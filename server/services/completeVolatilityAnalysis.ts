/**
 * 完整波动性分析服务
 * 确保只有数据点充足的加密货币才进行分析和保存
 * 7天分析：至少8个数据点
 * 30天分析：至少31个数据点
 */

import { Pool } from '@neondatabase/serverless';
import { pool } from '../db';

interface CompleteVolatilityResult {
  symbol: string;
  name: string;
  cryptocurrencyId: number;
  volatility7d: number;
  volatility30d: number;
  direction: 'up' | 'down';
  category7d: 'Low' | 'Medium' | 'High';
  category30d: 'Low' | 'Medium' | 'High';
  dataPoints7d: number;
  dataPoints30d: number;
  actualComparisons7d: number;
  actualComparisons30d: number;
}

/**
 * 计算波动性（平均值方法）
 * 7天：使用最近8个数据点的平均值
 * 30天：使用全部数据点的平均值
 */
function calculateAverageVolatility(dataPoints: number[]): number {
  if (dataPoints.length === 0) return 0;
  
  const sum = dataPoints.reduce((acc, val) => acc + Math.abs(val), 0);
  return sum / dataPoints.length;
}

/**
 * 分类波动性
 */
function categorizeVolatility(volatility: number): 'Low' | 'Medium' | 'High' {
  if (volatility < 20) return 'Low';
  if (volatility < 50) return 'Medium';
  return 'High';
}

/**
 * 执行完整的波动性分析
 * 只处理有足够数据点的加密货币
 */
export async function runCompleteVolatilityAnalysis(): Promise<{ 
  batchId7d: number; 
  batchId30d: number; 
  totalAnalyzed: number;
  totalSkipped: number;
  dataQuality: {
    cryptocurrenciesWithSufficientData: number;
    cryptocurrenciesWithInsufficientData: number;
    totalAvailable: number;
  }
}> {
  console.log('🎯 开始完整波动性分析（确保数据完整性）...');
  
  // 创建批次
  const batchQuery7d = `
    INSERT INTO volatility_analysis_batches (timeframe, analysis_type, total_analyzed, created_at)
    VALUES ($1, $2, $3, NOW())
    RETURNING id
  `;
  
  const batchQuery30d = `
    INSERT INTO volatility_analysis_batches (timeframe, analysis_type, total_analyzed, created_at)
    VALUES ($1, $2, $3, NOW())
    RETURNING id
  `;
  
  const batch7dResult = await pool.query(batchQuery7d, ['7d_min_8_points', 'complete_7d_analysis', 0]);
  const batch30dResult = await pool.query(batchQuery30d, ['30d_min_31_points', 'complete_30d_analysis', 0]);
  
  const batchId7d = batch7dResult.rows[0].id;
  const batchId30d = batch30dResult.rows[0].id;
  
  console.log(`📊 创建分析批次: 7天批次#${batchId7d}, 30天批次#${batchId30d}`);
  
  // 获取所有加密货币
  const cryptoQuery = `
    SELECT DISTINCT c.id, c.symbol, c.name
    FROM cryptocurrencies c
    JOIN volume_to_market_cap_ratios v ON c.id = v.cryptocurrency_id
    WHERE c.symbol IS NOT NULL 
      AND c.name IS NOT NULL 
      AND c.symbol != '' 
      AND c.name != ''
      AND v.volume_to_market_cap_ratio IS NOT NULL
    ORDER BY c.id
  `;
  
  const cryptoResult = await pool.query(cryptoQuery);
  console.log(`📈 找到 ${cryptoResult.rows.length} 个有数据的加密货币`);
  
  const volatilityResults: CompleteVolatilityResult[] = [];
  let processedCount = 0;
  let skippedCount = 0;
  let sufficientDataCount = 0;
  let insufficientDataCount = 0;
  
  // 处理每个加密货币
  for (const crypto of cryptoResult.rows) {
    try {
      // 获取该加密货币的所有交易量市值比率数据
      const volumeQuery = `
        SELECT volume_to_market_cap_ratio, timestamp
        FROM volume_to_market_cap_ratios
        WHERE cryptocurrency_id = $1
          AND volume_to_market_cap_ratio IS NOT NULL
        ORDER BY timestamp DESC
      `;
      
      const volumeResult = await pool.query(volumeQuery, [crypto.id]);
      const allDataPoints = volumeResult.rows.map(row => parseFloat(row.volume_to_market_cap_ratio));
      
      if (allDataPoints.length === 0) {
        skippedCount++;
        insufficientDataCount++;
        continue;
      }
      
      // 检查数据点是否充足
      const has7dData = allDataPoints.length >= 8;
      const has30dData = allDataPoints.length >= 31;
      
      if (!has7dData && !has30dData) {
        console.log(`❌ ${crypto.symbol}: 数据不足 (${allDataPoints.length} 个数据点，需要至少8个)`);
        skippedCount++;
        insufficientDataCount++;
        continue;
      }
      
      // 计算价格变化（相邻数据点的差值）
      const changes = [];
      for (let i = 1; i < allDataPoints.length; i++) {
        const change = ((allDataPoints[i-1] - allDataPoints[i]) / allDataPoints[i]) * 100;
        if (!isNaN(change) && isFinite(change)) {
          changes.push(change);
        }
      }
      
      if (changes.length === 0) {
        skippedCount++;
        insufficientDataCount++;
        continue;
      }
      
      let volatility7d = 0;
      let volatility30d = 0;
      let dataPoints7d = 0;
      let dataPoints30d = 0;
      let actualComparisons7d = 0;
      let actualComparisons30d = 0;
      
      // 7天分析：使用最近8个数据点
      if (has7dData) {
        const recent8Points = changes.slice(0, Math.min(8, changes.length));
        volatility7d = calculateAverageVolatility(recent8Points);
        dataPoints7d = recent8Points.length;
        actualComparisons7d = recent8Points.length;
      }
      
      // 30天分析：使用全部数据点
      if (has30dData) {
        volatility30d = calculateAverageVolatility(changes);
        dataPoints30d = changes.length;
        actualComparisons30d = changes.length;
      }
      
      // 只有数据充足的才保存
      if (has7dData || has30dData) {
        const direction = (has7dData ? volatility7d : volatility30d) > 0 ? 'up' : 'down';
        
        volatilityResults.push({
          symbol: crypto.symbol,
          name: crypto.name,
          cryptocurrencyId: crypto.id,
          volatility7d,
          volatility30d,
          direction,
          category7d: categorizeVolatility(volatility7d),
          category30d: categorizeVolatility(volatility30d),
          dataPoints7d,
          dataPoints30d,
          actualComparisons7d,
          actualComparisons30d
        });
        
        sufficientDataCount++;
      } else {
        insufficientDataCount++;
      }
      
      processedCount++;
      
      if (processedCount % 100 === 0) {
        console.log(`📈 已处理 ${processedCount}/${cryptoResult.rows.length} 个加密货币`);
      }
      
    } catch (error) {
      console.log(`❌ ${crypto.symbol} 计算失败:`, (error as Error).message);
      skippedCount++;
      insufficientDataCount++;
      continue;
    }
  }
  
  console.log(`🔢 数据质量检查完成:`);
  console.log(`   - 总计处理: ${processedCount} 个加密货币`);
  console.log(`   - 数据充足: ${sufficientDataCount} 个`);
  console.log(`   - 数据不足: ${insufficientDataCount} 个`);
  console.log(`   - 有效结果: ${volatilityResults.length} 个`);
  
  // 分别保存7天和30天数据
  const valid7dResults = volatilityResults.filter(r => r.dataPoints7d >= 8);
  const valid30dResults = volatilityResults.filter(r => r.dataPoints30d >= 31);
  
  console.log(`📊 准备保存:`);
  console.log(`   - 7天分析: ${valid7dResults.length} 个（至少8个数据点）`);
  console.log(`   - 30天分析: ${valid30dResults.length} 个（至少31个数据点）`);
  
  // 按波动性排序
  const sorted7d = valid7dResults.sort((a, b) => b.volatility7d - a.volatility7d);
  const sorted30d = valid30dResults.sort((a, b) => b.volatility30d - a.volatility30d);
  
  let savedCount = 0;
  
  // 保存7天波动性数据
  if (sorted7d.length > 0) {
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
          result.actualComparisons7d,
          `7天波动性：使用最近${result.dataPoints7d}个数据点的平均值计算（数据完整性验证通过）`
        ]);
        
        savedCount++;
        
      } catch (saveError) {
        console.error(`💾 7天保存 ${result.symbol} 失败:`, (saveError as Error).message);
      }
    }
  }
  
  // 保存30天波动性数据
  if (sorted30d.length > 0) {
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
          result.actualComparisons30d,
          `30天波动性：使用全部${result.dataPoints30d}个数据点的平均值计算（数据完整性验证通过）`
        ]);
        
        savedCount++;
        
      } catch (saveError) {
        console.error(`💾 30天保存 ${result.symbol} 失败:`, (saveError as Error).message);
      }
    }
  }
  
  // 更新批次总数
  await pool.query('UPDATE volatility_analysis_batches SET total_analyzed = $1 WHERE id = $2', [sorted7d.length, batchId7d]);
  await pool.query('UPDATE volatility_analysis_batches SET total_analyzed = $1 WHERE id = $2', [sorted30d.length, batchId30d]);
  
  console.log(`✅ 完整波动性分析完成！`);
  console.log(`📊 最终结果:`);
  console.log(`   - 7天分析: ${sorted7d.length} 个加密货币（至少8个数据点）`);
  console.log(`   - 30天分析: ${sorted30d.length} 个加密货币（至少31个数据点）`);
  console.log(`   - 总计保存: ${savedCount} 条记录`);
  
  return {
    batchId7d,
    batchId30d,
    totalAnalyzed: volatilityResults.length,
    totalSkipped: skippedCount,
    dataQuality: {
      cryptocurrenciesWithSufficientData: sufficientDataCount,
      cryptocurrenciesWithInsufficientData: insufficientDataCount,
      totalAvailable: cryptoResult.rows.length
    }
  };
}

/**
 * 设置定时任务：每天执行一次完整分析
 */
export function setupDailyCompleteAnalysis(): void {
  import('node-cron').then(cron => {
    // 每天凌晨2点执行
    cron.schedule('0 2 * * *', async () => {
      console.log('🕐 开始执行每日完整波动性分析...');
      try {
        await runCompleteVolatilityAnalysis();
      } catch (error) {
        console.error('❌ 每日完整波动性分析失败:', error);
      }
    });
    
    console.log('⏰ 设置每日完整波动性分析定时任务 - 每天凌晨2点执行');
  });
}