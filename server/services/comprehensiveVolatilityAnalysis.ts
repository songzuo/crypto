/**
 * 全面波动性分析服务
 * 处理所有780个加密货币，分别计算7天和30天波动性
 * 解决数据库约束问题，确保7天和30天数据分开保存
 */

import { pool } from '../db';
import cron from 'node-cron';

export async function runFullVolatilityAnalysis(): Promise<{ batchId7d: number; batchId30d: number; totalAnalyzed: number }> {
  try {
    console.log('🔄 开始全面波动性分析 - 处理所有780个加密货币');
    
    // 创建两个分离的批次：7天和30天
    const batch7dQuery = `
      INSERT INTO volatility_analysis_batches (timeframe, analysis_type, total_analyzed)
      VALUES ($1, $2, $3)
      RETURNING id
    `;
    
    const batch30dQuery = `
      INSERT INTO volatility_analysis_batches (timeframe, analysis_type, total_analyzed)
      VALUES ($1, $2, $3)
      RETURNING id
    `;
    
    const batch7dResult = await pool.query(batch7dQuery, [
      '7d_latest_8_points', 
      'comprehensive_7d_analysis', 
      0
    ]);
    
    const batch30dResult = await pool.query(batch30dQuery, [
      '30d_all_points', 
      'comprehensive_30d_analysis', 
      0
    ]);
    
    const batchId7d = batch7dResult.rows[0].id;
    const batchId30d = batch30dResult.rows[0].id;
    
    console.log(`✅ 创建分离批次: 7天批次 ${batchId7d}, 30天批次 ${batchId30d}`);
    
    // 获取所有有交易量数据的加密货币
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
      HAVING COUNT(v.id) >= 2
      ORDER BY total_data_points DESC
    `;
    
    const cryptoResult = await pool.query(cryptoDataQuery);
    console.log(`📊 找到 ${cryptoResult.rows.length} 个加密货币进行全面分析`);
    
    const volatilityResults = [];
    let processedCount = 0;
    
    for (const crypto of cryptoResult.rows) {
      try {
        // 获取交易量比率数据
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
        
        if (volumeResult.rows.length < 2) {
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
        
        if (changes.length < 1) continue;
        
        // 🎯 分离计算：7天波动性使用最近8个点的平均值，30天波动性使用全部点的平均值
        const recent8Points = changes.slice(0, Math.min(8, changes.length));
        const volatility7d = calculateAverageVolatility(recent8Points);
        const volatility30d = calculateAverageVolatility(changes);
        
        // 方向判断
        const recentTrend = ratioValues.length > 1 ? ratioValues[0] - ratioValues[1] : 0;
        const direction = recentTrend >= 0 ? 'up' : 'down';
        
        // 波动性分类
        const category7d = volatility7d < 10 ? 'Low' : volatility7d < 30 ? 'Medium' : 'High';
        const category30d = volatility30d < 10 ? 'Low' : volatility30d < 30 ? 'Medium' : 'High';
        
        volatilityResults.push({
          cryptocurrencyId: crypto.id,
          symbol: crypto.symbol,
          name: crypto.name,
          volatility7d,
          volatility30d,
          direction,
          category7d,
          category30d,
          dataPoints7d: recent8Points.length,
          dataPoints30d: changes.length,
          totalRawDataPoints: volumeResult.rows.length,
          actualComparisons: changes.length
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
    
    console.log(`🔢 算法计算完成: ${volatilityResults.length} 个有效结果`);
    console.log(`📊 7天波动性计算: 使用最近8个数据点的平均值`);
    console.log(`📊 30天波动性计算: 使用全部可用数据点的平均值`);
    
    // 按7天和30天分别排序并保存
    const sorted7d = [...volatilityResults].sort((a, b) => b.volatility7d - a.volatility7d);
    const sorted30d = [...volatilityResults].sort((a, b) => b.volatility30d - a.volatility30d);
    
    let savedCount = 0;
    
    // 保存7天波动性数据
    console.log('💾 保存7天波动性数据...');
    for (let i = 0; i < sorted7d.length; i++) {
      const result = sorted7d[i];
      
      try {
        const insertQuery = `
          INSERT INTO volatility_analysis_entries (
            symbol, name, batch_id, cryptocurrency_id, volatility_percentage,
            volatility_category, volatility_direction, volatility_rank,
            risk_level, period, data_points_used, comparison_count, algorithm_description
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        `;
        
        await pool.query(insertQuery, [
          result.symbol,
          result.name,
          batchId7d,
          result.cryptocurrencyId,
          result.volatility7d,
          result.category7d,
          result.direction,
          i + 1,
          result.category7d.toLowerCase(),
          '7d',
          result.dataPoints7d,
          result.actualComparisons,
          `7天波动性：使用最近${result.dataPoints7d}个数据点的平均值计算`
        ]);
        
        savedCount++;
        
      } catch (saveError) {
        console.error(`💾 7天保存 ${result.symbol} 失败:`, (saveError as Error).message);
      }
    }
    
    // 保存30天波动性数据
    console.log('💾 保存30天波动性数据...');
    for (let i = 0; i < sorted30d.length; i++) {
      const result = sorted30d[i];
      
      try {
        const insertQuery = `
          INSERT INTO volatility_analysis_entries (
            symbol, name, batch_id, cryptocurrency_id, volatility_percentage,
            volatility_category, volatility_direction, volatility_rank,
            risk_level, period, data_points_used, comparison_count, algorithm_description
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        `;
        
        await pool.query(insertQuery, [
          result.symbol,
          result.name,
          batchId30d,
          result.cryptocurrencyId,
          result.volatility30d,
          result.category30d,
          result.direction,
          i + 1,
          result.category30d.toLowerCase(),
          '30d',
          result.dataPoints30d,
          result.actualComparisons,
          `30天波动性：使用全部${result.dataPoints30d}个数据点的平均值计算`
        ]);
        
        savedCount++;
        
      } catch (saveError) {
        console.error(`💾 30天保存 ${result.symbol} 失败:`, (saveError as Error).message);
      }
    }
    
    // 更新批次统计
    await pool.query(
      'UPDATE volatility_analysis_batches SET total_analyzed = $1 WHERE id = $2',
      [sorted7d.length, batchId7d]
    );
    
    await pool.query(
      'UPDATE volatility_analysis_batches SET total_analyzed = $1 WHERE id = $2',
      [sorted30d.length, batchId30d]
    );
    
    console.log(`🎉 全面波动性分析完成！`);
    console.log(`📊 7天批次 ${batchId7d}: ${sorted7d.length} 个记录`);
    console.log(`📊 30天批次 ${batchId30d}: ${sorted30d.length} 个记录`);
    console.log(`📊 总计处理: ${volatilityResults.length} 个加密货币`);
    console.log(`💾 成功保存: ${savedCount} 条记录`);
    
    return { batchId7d, batchId30d, totalAnalyzed: savedCount };
    
  } catch (error) {
    console.error('❌ 全面波动性分析失败:', error);
    throw error;
  }
}

/**
 * 计算波动性（平均值方法）
 * 7天：使用最近8个数据点的平均值
 * 30天：使用全部数据点的平均值
 */
function calculateAverageVolatility(dataPoints: number[]): number {
  if (dataPoints.length === 0) return 0;
  
  // 计算平均值（用户要求的算法）
  const mean = dataPoints.reduce((sum, val) => sum + val, 0) / dataPoints.length;
  
  return mean;
}

/**
 * 设置定时任务：每小时执行一次
 */
export function setupHourlyVolatilityAnalysis(): void {
  console.log('⏰ 设置全面波动性分析定时任务 - 每小时执行一次');
  
  // 每小时的第0分钟执行
  cron.schedule('0 * * * *', async () => {
    try {
      console.log('🕐 定时全面波动性分析开始执行...');
      const result = await runFullVolatilityAnalysis();
      console.log(`✅ 定时分析完成 - 7天批次: ${result.batchId7d}, 30天批次: ${result.batchId30d}, 总记录: ${result.totalAnalyzed}`);
    } catch (error) {
      console.error('❌ 定时全面波动性分析失败:', error);
    }
  });
  
  console.log('📅 全面波动性分析将每小时自动执行，分别处理7天和30天数据');
}