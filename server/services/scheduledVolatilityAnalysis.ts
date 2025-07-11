/**
 * 定时波动性分析服务
 * 每小时自动执行波动性分析并记录到数据库
 */

import { pool } from '../db';
import cron from 'node-cron';

export async function runComprehensiveVolatilityAnalysis(): Promise<{ batchId: number; totalAnalyzed: number }> {
  try {
    console.log('🔄 开始全面波动性分析 - 处理所有批次数据');
    
    // 创建新批次
    const batchQuery = `
      INSERT INTO volatility_analysis_batches (timeframe, analysis_type, total_analyzed)
      VALUES ($1, $2, $3)
      RETURNING id
    `;
    
    const batchResult = await pool.query(batchQuery, [
      'comprehensive_7d_30d', 
      'scheduled_comprehensive_analysis', 
      0
    ]);
    const batchId = batchResult.rows[0].id;
    
    console.log(`✅ 创建综合分析批次: ${batchId}`);
    
    // 获取所有有交易量数据的加密货币（从所有165个批次）
    const cryptoDataQuery = `
      SELECT DISTINCT 
        c.id, c.symbol, c.name,
        COUNT(v.id) as total_data_points,
        COUNT(DISTINCT v.batch_id) as batch_count
      FROM cryptocurrencies c
      JOIN volume_to_market_cap_ratios v ON c.id = v.cryptocurrency_id
      WHERE v.volume_to_market_cap_ratio IS NOT NULL
        AND c.symbol IS NOT NULL 
        AND c.name IS NOT NULL
        AND c.symbol != ''
        AND c.name != ''
      GROUP BY c.id, c.symbol, c.name
      HAVING COUNT(v.id) >= 3
      ORDER BY total_data_points DESC
    `;
    
    const cryptoResult = await pool.query(cryptoDataQuery);
    console.log(`📊 找到 ${cryptoResult.rows.length} 个有足够数据的加密货币（来自所有批次）`);
    
    // 显示前几个加密货币的数据统计
    console.log('📋 前10个加密货币数据统计:');
    cryptoResult.rows.slice(0, 10).forEach((crypto, index) => {
      console.log(`${index + 1}. ${crypto.symbol}: ${crypto.total_data_points} 数据点，来自 ${crypto.batch_count} 个批次`);
    });
    
    const volatilityResults = [];
    let processedCount = 0;
    
    for (const crypto of cryptoResult.rows) {
      try {
        // 获取所有交易量比率数据（从所有165个批次）
        const volumeQuery = `
          SELECT volume_to_market_cap_ratio, timestamp, batch_id
          FROM volume_to_market_cap_ratios 
          WHERE cryptocurrency_id = $1 
            AND volume_to_market_cap_ratio IS NOT NULL 
            AND volume_to_market_cap_ratio > 0
          ORDER BY timestamp DESC 
          LIMIT 100
        `;
        
        const volumeResult = await pool.query(volumeQuery, [crypto.id]);
        
        if (volumeResult.rows.length < 3) {
          continue;
        }
        
        // 构建波动性数据序列
        const ratioValues = volumeResult.rows.map(row => parseFloat(row.volume_to_market_cap_ratio));
        const changes = [];
        
        // 计算相邻数据点的变化百分比
        for (let i = 1; i < ratioValues.length; i++) {
          if (ratioValues[i] !== 0) {
            const change = Math.abs((ratioValues[i-1] - ratioValues[i]) / ratioValues[i]) * 100;
            if (isFinite(change)) changes.push(change);
          }
        }
        
        if (changes.length < 3) continue;
        
        // 🎯 分离的7天和30天波动性计算：
        
        // 1. 7天波动性：使用最近8个数据点的平均值
        const recent8Points = changes.slice(0, Math.min(8, changes.length));
        const volatility7d = calculateAverageVolatility(recent8Points);
        
        // 2. 30天波动性：使用全部可用数据点的平均值
        const volatility30d = calculateAverageVolatility(changes);
        
        // 方向判断基于最近趋势
        const recentTrend = ratioValues.length > 1 ? ratioValues[0] - ratioValues[1] : 0;
        const direction = recentTrend >= 0 ? 'up' : 'down';
        
        // 波动性分类（基于7天波动性）
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
          dataPoints30d: changes.length,
          totalDataPoints: crypto.total_data_points
        });
        
        processedCount++;
        
        if (processedCount % 100 === 0) {
          console.log(`📈 已处理 ${processedCount}/${cryptoResult.rows.length} 个加密货币`);
        }
        
      } catch (error) {
        console.log(`❌ ${crypto.symbol} 计算失败:`, (error as Error).message);
        continue;
      }
    }
    
    // 按7天波动性排序
    volatilityResults.sort((a, b) => b.volatility7d - a.volatility7d);
    
    console.log(`🔢 算法计算完成: ${volatilityResults.length} 个有效结果`);
    
    // 保存到数据库
    let savedCount = 0;
    for (let i = 0; i < volatilityResults.length; i++) {
      const result = volatilityResults[i];
      
      try {
        // 7天波动性记录
        const insert7dQuery = `
          INSERT INTO volatility_analysis_entries (
            symbol, name, batch_id, cryptocurrency_id, volatility_percentage,
            volatility_category, volatility_direction, volatility_rank,
            risk_level, period
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
          ON CONFLICT (symbol, batch_id) DO UPDATE SET
            volatility_percentage = EXCLUDED.volatility_percentage,
            volatility_category = EXCLUDED.volatility_category,
            volatility_direction = EXCLUDED.volatility_direction,
            volatility_rank = EXCLUDED.volatility_rank,
            risk_level = EXCLUDED.risk_level,
            period = EXCLUDED.period
        `;
        
        await pool.query(insert7dQuery, [
          result.symbol,
          result.name,
          batchId,
          result.cryptocurrencyId,
          result.volatility7d,
          result.category,
          result.direction,
          i + 1,
          result.category.toLowerCase(),
          '7d'
        ]);
        
        // 30天波动性记录
        const insert30dQuery = `
          INSERT INTO volatility_analysis_entries (
            symbol, name, batch_id, cryptocurrency_id, volatility_percentage,
            volatility_category, volatility_direction, volatility_rank,
            risk_level, period
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
          ON CONFLICT (symbol, batch_id) DO UPDATE SET
            volatility_percentage = EXCLUDED.volatility_percentage,
            volatility_category = EXCLUDED.volatility_category,
            volatility_direction = EXCLUDED.volatility_direction,
            volatility_rank = EXCLUDED.volatility_rank,
            risk_level = EXCLUDED.risk_level,
            period = EXCLUDED.period
        `;
        
        // 为30天数据重新计算排名
        const rank30d = volatilityResults
          .sort((a, b) => b.volatility30d - a.volatility30d)
          .findIndex(item => item.cryptocurrencyId === result.cryptocurrencyId) + 1;
        
        await pool.query(insert30dQuery, [
          result.symbol,
          result.name,
          batchId,
          result.cryptocurrencyId,
          result.volatility30d,
          result.volatility30d < 10 ? 'Low' : result.volatility30d < 30 ? 'Medium' : 'High',
          result.direction,
          rank30d,
          result.volatility30d < 10 ? 'low' : result.volatility30d < 30 ? 'medium' : 'high',
          '30d'
        ]);
        
        savedCount += 2; // 7天和30天各一条记录
        
      } catch (saveError) {
        console.error(`💾 保存 ${result.symbol} 失败:`, (saveError as Error).message);
      }
    }
    
    // 更新批次统计
    await pool.query(
      'UPDATE volatility_analysis_batches SET total_analyzed = $1 WHERE id = $2',
      [savedCount, batchId]
    );
    
    console.log(`🎉 综合波动性分析完成！批次 ${batchId} 包含 ${savedCount} 个记录`);
    console.log(`📋 处理了 ${volatilityResults.length} 个加密货币，分别记录7天和30天波动性`);
    console.log(`📊 数据来源：所有164个交易量批次的综合数据`);
    
    return { batchId, totalAnalyzed: savedCount };
    
  } catch (error) {
    console.error('❌ 综合波动性分析失败:', error);
    throw error;
  }
}

/**
 * 计算平均波动性（标准差）
 */
function calculateAverageVolatility(dataPoints: number[]): number {
  if (dataPoints.length === 0) return 0;
  
  // 计算平均值
  const mean = dataPoints.reduce((sum, val) => sum + val, 0) / dataPoints.length;
  
  // 计算方差
  const variance = dataPoints.reduce((sum, val) => {
    const diff = val - mean;
    return sum + (diff * diff);
  }, 0) / dataPoints.length;
  
  // 返回标准差作为波动性指标
  return Math.sqrt(variance);
}

/**
 * 设置定时任务：每小时执行一次
 */
export function setupVolatilityScheduler(): void {
  console.log('⏰ 设置波动性分析定时任务 - 每小时执行一次');
  
  // 每小时的第0分钟执行
  cron.schedule('0 * * * *', async () => {
    try {
      console.log('🕐 定时波动性分析开始执行...');
      const result = await runComprehensiveVolatilityAnalysis();
      console.log(`✅ 定时波动性分析完成 - 批次 ${result.batchId}，记录 ${result.totalAnalyzed} 条`);
    } catch (error) {
      console.error('❌ 定时波动性分析失败:', error);
    }
  });
  
  console.log('📅 波动性分析将每小时自动执行');
}