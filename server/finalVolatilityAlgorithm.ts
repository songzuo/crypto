/**
 * 最终波动性算法实现
 * 算法设计：1、七天算最近8个数据点的平均值  2、三十天算全部数据点的平均值
 */

import { pool } from './db';

export async function generateNewVolatilityBatch(): Promise<{ batchId: number; totalAnalyzed: number }> {
  try {
    console.log('开始生成新的波动性分析批次（用户指定算法）...');
    
    // 创建新批次
    const batchQuery = `
      INSERT INTO volatility_analysis_batches (timeframe, analysis_type, total_analyzed)
      VALUES ($1, $2, $3)
      RETURNING id
    `;
    
    const batchResult = await pool.query(batchQuery, [
      '7d_8points_30d_all', 
      'user_specified_algorithm', 
      0
    ]);
    const batchId = batchResult.rows[0].id;
    
    console.log(`创建新批次 ${batchId}: 7天使用最近8个数据点，30天使用全部数据点`);
    
    // 获取加密货币数据 - 使用现有的技术分析数据作为价格变化源
    const cryptoDataQuery = `
      SELECT DISTINCT 
        c.id as crypto_id,
        c.symbol,
        c.name,
        COUNT(ta.id) as data_count
      FROM cryptocurrencies c
      JOIN technical_analysis_entries ta ON c.id = ta.cryptocurrency_id
      WHERE ta.rsi IS NOT NULL 
        AND c.symbol IS NOT NULL 
        AND c.name IS NOT NULL
      GROUP BY c.id, c.symbol, c.name
      HAVING COUNT(ta.id) >= 3
      ORDER BY c.id
      LIMIT 300
    `;
    
    const cryptoResult = await pool.query(cryptoDataQuery);
    const cryptocurrencies = cryptoResult.rows;
    
    console.log(`找到 ${cryptocurrencies.length} 个有足够数据的加密货币`);
    
    const volatilityResults = [];
    
    for (const crypto of cryptocurrencies) {
      try {
        // 获取该加密货币的技术分析数据作为价格变化指标
        const taDataQuery = `
          SELECT rsi, macd, created_at 
          FROM technical_analysis_entries 
          WHERE cryptocurrency_id = $1 
            AND rsi IS NOT NULL 
            AND macd IS NOT NULL
          ORDER BY created_at DESC 
          LIMIT 30
        `;
        
        const taResult = await pool.query(taDataQuery, [crypto.crypto_id]);
        if (taResult.rows.length < 3) continue;
        
        // 使用RSI变化作为价格波动指标
        const rsiValues = taResult.rows.map(row => parseFloat(row.rsi)).filter(val => !isNaN(val));
        const priceChanges = [];
        
        // 计算RSI变化百分比作为波动性指标
        for (let i = 1; i < rsiValues.length; i++) {
          const change = ((rsiValues[i-1] - rsiValues[i]) / rsiValues[i]) * 100;
          if (isFinite(change)) priceChanges.push(Math.abs(change));
        }
        
        if (priceChanges.length < 3) continue;
        
        // 7天波动性：使用最近8个数据点的平均值
        const recent8Points = priceChanges.slice(0, Math.min(8, priceChanges.length));
        const volatility7d = calculateVolatilityAverage(recent8Points);
        
        // 30天波动性：使用全部数据点的平均值  
        const volatility30d = calculateVolatilityAverage(priceChanges);
        
        // 方向判断 - 基于最近RSI趋势
        const recentRsiChange = rsiValues.length > 1 ? rsiValues[0] - rsiValues[1] : 0;
        const direction = recentRsiChange >= 0 ? 'up' : 'down';
        
        // 分类
        let category: 'Low' | 'Medium' | 'High';
        if (volatility7d < 5) {
          category = 'Low';
        } else if (volatility7d < 15) {
          category = 'Medium';
        } else {
          category = 'High';
        }
        
        volatilityResults.push({
          cryptocurrencyId: crypto.crypto_id,
          symbol: crypto.symbol,
          name: crypto.name,
          volatility7d,
          volatility30d,
          direction,
          category,
          dataPoints7d: recent8Points.length,
          dataPoints30d: priceChanges.length
        });
        
      } catch (error) {
        console.error(`计算 ${crypto.symbol} 波动性失败:`, error);
        continue;
      }
    }
    
    // 按7天波动性排序
    volatilityResults.sort((a, b) => b.volatility7d - a.volatility7d);
    
    // 保存结果
    let savedCount = 0;
    for (let i = 0; i < volatilityResults.length; i++) {
      const result = volatilityResults[i];
      
      try {
        const entryQuery = `
          INSERT INTO volatility_analysis_entries (
            symbol, name, batch_id, cryptocurrency_id, volatility_percentage,
            volatility_category, volatility_direction, volatility_rank,
            risk_level, data_points, comparisons, period
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        `;
        
        await pool.query(entryQuery, [
          result.symbol,
          result.name,
          batchId,
          result.cryptocurrencyId,
          result.volatility7d,
          result.category,
          result.direction,
          i + 1,
          result.category.toLowerCase(),
          result.dataPoints7d,
          result.dataPoints30d,
          '7d'
        ]);
        
        savedCount++;
      } catch (error) {
        console.error(`保存 ${result.symbol} 失败:`, error);
      }
    }
    
    // 更新批次统计
    await pool.query(
      'UPDATE volatility_analysis_batches SET total_analyzed = $1 WHERE id = $2',
      [savedCount, batchId]
    );
    
    console.log(`✅ 新算法完成: 批次 ${batchId}, 保存 ${savedCount} 个结果`);
    console.log(`算法规格: 7天波动性使用最近8个数据点平均值，30天波动性使用全部数据点平均值`);
    
    return { batchId, totalAnalyzed: savedCount };
    
  } catch (error) {
    console.error('生成新波动性批次失败:', error);
    throw error;
  }
}

/**
 * 计算价格变化数组的波动性（标准差）
 * 根据用户要求：计算平均值
 */
function calculateVolatilityAverage(priceChanges: number[]): number {
  if (priceChanges.length === 0) return 0;
  
  // 计算平均值
  const mean = priceChanges.reduce((sum, val) => sum + val, 0) / priceChanges.length;
  
  // 计算方差
  const variance = priceChanges.reduce((sum, val) => {
    const diff = val - mean;
    return sum + (diff * diff);
  }, 0) / priceChanges.length;
  
  // 返回标准差作为波动性指标
  return Math.sqrt(variance);
}