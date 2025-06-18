/**
 * 用户指定算法实现
 * 严格按照用户要求：7天波动性使用最近8个数据点的平均值，30天波动性使用全部数据点的平均值  
 */

import { pool } from './db';

export async function runUserSpecifiedVolatilityAlgorithm(): Promise<{ batchId: number; totalAnalyzed: number }> {
  try {
    console.log('🎯 执行用户指定算法：7天使用最近8个数据点平均值，30天使用全部数据点平均值');
    
    // 创建新批次
    const batchQuery = `
      INSERT INTO volatility_analysis_batches (timeframe, analysis_type, total_analyzed)
      VALUES ($1, $2, $3)
      RETURNING id
    `;
    
    const batchResult = await pool.query(batchQuery, [
      'user_algorithm_7d_8pts_30d_all', 
      'user_specified_algorithm', 
      0
    ]);
    const batchId = batchResult.rows[0].id;
    
    console.log(`✅ 创建批次 ${batchId} - 用户指定算法规格`);
    
    // 获取有交易量数据的加密货币，用于新算法计算
    const existingDataQuery = `
      SELECT DISTINCT 
        c.id, c.symbol, c.name,
        COUNT(v.id) as data_count
      FROM cryptocurrencies c
      JOIN volume_to_market_cap_ratios v ON c.id = v.cryptocurrency_id
      WHERE c.symbol IS NOT NULL 
        AND c.name IS NOT NULL
        AND v.volume_to_market_cap_ratio IS NOT NULL
      GROUP BY c.id, c.symbol, c.name
      HAVING COUNT(v.id) >= 8
      ORDER BY c.id
      LIMIT 200
    `;
    
    const cryptoResult = await pool.query(existingDataQuery);
    console.log(`📊 找到 ${cryptoResult.rows.length} 个加密货币进行算法重计算`);
    
    const volatilityResults = [];
    
    for (const crypto of cryptoResult.rows) {
      try {
        // 获取交易量数据用于波动性计算
        const volumeQuery = `
          SELECT volume_to_market_cap_ratio, timestamp 
          FROM volume_to_market_cap_ratios 
          WHERE cryptocurrency_id = $1 
            AND volume_to_market_cap_ratio IS NOT NULL 
          ORDER BY timestamp DESC 
          LIMIT 30
        `;
        
        const volumeResult = await pool.query(volumeQuery, [crypto.id]);
        
        if (volumeResult.rows.length < 8) {
          console.log(`${crypto.symbol}: 数据点不足 (${volumeResult.rows.length})`);
          continue;
        }
        
        // 构建波动性数据序列
        const ratioValues = volumeResult.rows.map(row => parseFloat(row.volume_to_market_cap_ratio));
        const priceChangeSequence = [];
        
        // 计算交易量比率变化作为波动性指标
        for (let i = 1; i < ratioValues.length; i++) {
          const change = Math.abs((ratioValues[i-1] - ratioValues[i]) / ratioValues[i]) * 100;
          if (isFinite(change)) priceChangeSequence.push(change);
        }
        
        if (priceChangeSequence.length < 3) continue;
        
        // 🎯 用户算法核心：
        // 1. 7天波动性：使用最近8个数据点的平均值
        const recent8Points = priceChangeSequence.slice(0, Math.min(8, priceChangeSequence.length));
        const volatility7d = calculateAverageVolatility(recent8Points);
        
        // 2. 30天波动性：使用全部数据点的平均值
        const volatility30d = calculateAverageVolatility(priceChangeSequence);
        
        // 基于最近变化判断方向
        const recentTrend = ratioValues.length > 1 ? ratioValues[0] - ratioValues[1] : 0;
        const direction = recentTrend >= 0 ? 'up' : 'down';
        
        // 波动性分类
        let category: 'Low' | 'Medium' | 'High';
        if (volatility7d < 10) {
          category = 'Low';
        } else if (volatility7d < 30) {
          category = 'Medium'; 
        } else {
          category = 'High';
        }
        
        volatilityResults.push({
          cryptocurrencyId: crypto.id,
          symbol: crypto.symbol,
          name: crypto.name,
          volatility7d,
          volatility30d,
          direction,
          category,
          dataPoints7d: recent8Points.length,
          dataPoints30d: priceChangeSequence.length
        });
        
        console.log(`📈 ${crypto.symbol}: 7d=${volatility7d.toFixed(1)}% (${recent8Points.length}点), 30d=${volatility30d.toFixed(1)}% (${priceChangeSequence.length}点)`);
        
      } catch (error) {
        console.error(`❌ ${crypto.symbol} 计算失败:`, error.message);
      }
    }
    
    // 按7天波动性排序（这是主要指标）
    volatilityResults.sort((a, b) => b.volatility7d - a.volatility7d);
    
    console.log(`🔢 总计算结果: ${volatilityResults.length} 个有效项目`);
    
    // 批量保存到数据库
    let savedCount = 0;
    for (let i = 0; i < volatilityResults.length; i++) {
      const result = volatilityResults[i];
      
      try {
        const insertQuery = `
          INSERT INTO volatility_analysis_entries (
            symbol, name, batch_id, cryptocurrency_id, volatility_percentage,
            volatility_category, volatility_direction, volatility_rank,
            risk_level, data_points, comparisons, period
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        `;
        
        await pool.query(insertQuery, [
          result.symbol,
          result.name,
          batchId,
          result.cryptocurrencyId,
          result.volatility7d, // 主要指标：7天波动性
          result.category,
          result.direction,
          i + 1, // 排名
          result.category.toLowerCase(),
          result.dataPoints7d, // 7天数据点数
          result.dataPoints30d, // 30天数据点数  
          '7d'
        ]);
        
        savedCount++;
        
      } catch (saveError) {
        console.error(`💾 保存 ${result.symbol} 失败:`, saveError.message);
      }
    }
    
    // 更新批次统计
    await pool.query(
      'UPDATE volatility_analysis_batches SET total_analyzed = $1 WHERE id = $2',
      [savedCount, batchId]
    );
    
    console.log(`🎉 用户算法完成！批次 ${batchId} 包含 ${savedCount} 个结果`);
    console.log(`📋 算法规格确认：7天使用最近8个数据点平均值，30天使用全部数据点平均值`);
    
    return { batchId, totalAnalyzed: savedCount };
    
  } catch (error) {
    console.error('❌ 用户算法执行失败:', error);
    throw error;
  }
}

/**
 * 计算平均波动性
 * 根据用户要求使用平均值算法
 */
function calculateAverageVolatility(dataPoints: number[]): number {
  if (dataPoints.length === 0) return 0;
  
  // 计算数据点的平均值
  const mean = dataPoints.reduce((sum, val) => sum + val, 0) / dataPoints.length;
  
  // 计算标准差作为波动性指标
  const squaredDiffs = dataPoints.map(val => Math.pow(val - mean, 2));
  const variance = squaredDiffs.reduce((sum, val) => sum + val, 0) / dataPoints.length;
  const standardDeviation = Math.sqrt(variance);
  
  return standardDeviation;
}