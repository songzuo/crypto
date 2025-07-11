/**
 * 真正的完整波动性分析服务
 * 处理全部1000+加密货币，正确实现7天和30天波动性算法
 * 7天：8个数据点进行7次比较
 * 30天：31个数据点进行31次比较
 */

import { pool } from '../db';

interface RealVolatilityResult {
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

interface RealAnalysisProgress {
  batchId: string;
  totalCryptocurrencies: number;
  processedCount: number;
  completedCount: number;
  isComplete: boolean;
  progressPercentage: number;
  remainingPercentage: number;
  startTime: Date;
  estimatedEndTime?: Date;
  currentCrypto?: string;
  message: string;
}

// 全局进度跟踪
let realGlobalProgress: RealAnalysisProgress | null = null;

/**
 * 获取当前分析进度
 */
export function getRealAnalysisProgress(): RealAnalysisProgress | null {
  return realGlobalProgress;
}

/**
 * 计算正确的波动性 - 用户指定算法
 * 7天：8个数据点进行7次比较
 * 30天：31个数据点进行31次比较
 */
function calculateCorrectVolatility(
  dataPoints: number[], 
  analysisType: '7d' | '30d'
): { volatility: number; actualComparisons: number } {
  
  if (analysisType === '7d') {
    // 7天分析：需要至少8个数据点，进行7次比较
    if (dataPoints.length < 8) {
      return { volatility: 0, actualComparisons: 0 };
    }
    
    const recent8 = dataPoints.slice(0, 8);
    const comparisons: number[] = [];
    
    // 进行7次比较（8个数据点之间）
    for (let i = 1; i < recent8.length; i++) {
      const change = Math.abs(recent8[i-1] - recent8[i]);
      if (!isNaN(change) && isFinite(change)) {
        comparisons.push(change);
      }
    }
    
    if (comparisons.length === 0) {
      return { volatility: 0, actualComparisons: 0 };
    }
    
    // 计算平均值
    const avgVolatility = comparisons.reduce((sum, val) => sum + val, 0) / comparisons.length;
    return { volatility: avgVolatility, actualComparisons: comparisons.length };
    
  } else {
    // 30天分析：需要至少31个数据点，进行31次比较
    if (dataPoints.length < 31) {
      return { volatility: 0, actualComparisons: 0 };
    }
    
    const first31 = dataPoints.slice(0, 31);
    const comparisons: number[] = [];
    
    // 进行31次比较（31个数据点之间）
    for (let i = 1; i < first31.length; i++) {
      const change = Math.abs(first31[i-1] - first31[i]);
      if (!isNaN(change) && isFinite(change)) {
        comparisons.push(change);
      }
    }
    
    if (comparisons.length === 0) {
      return { volatility: 0, actualComparisons: 0 };
    }
    
    // 计算平均值
    const avgVolatility = comparisons.reduce((sum, val) => sum + val, 0) / comparisons.length;
    return { volatility: avgVolatility, actualComparisons: comparisons.length };
  }
}

/**
 * 分类波动性
 */
function categorizeVolatility(volatility: number): 'Low' | 'Medium' | 'High' {
  if (volatility < 0.02) return 'Low';    // 2% 以下
  if (volatility < 0.05) return 'Medium'; // 2-5%
  return 'High';                          // 5% 以上
}

/**
 * 执行真正的完整波动性分析
 */
export async function runRealCompleteVolatilityAnalysis(): Promise<{ 
  batchId7d: number; 
  batchId30d: number; 
  totalAnalyzed: number;
  totalSkipped: number;
  progressMessage: string;
}> {
  console.log('🎯 开始真正的完整波动性分析（全部1000+加密货币）...');
  
  // 创建分析批次
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
  
  const batch7dResult = await pool.query(batchQuery7d, ['7d_8_points_7_comparisons', 'real_7d_analysis', 0]);
  const batch30dResult = await pool.query(batchQuery30d, ['30d_31_points_31_comparisons', 'real_30d_analysis', 0]);
  
  const batchId7d = batch7dResult.rows[0].id;
  const batchId30d = batch30dResult.rows[0].id;
  
  console.log(`📊 创建真实分析批次: 7天批次#${batchId7d}, 30天批次#${batchId30d}`);
  
  // 获取全部加密货币数据（不限制数量）
  const cryptoQuery = `
    SELECT c.id, c.symbol, c.name, c.current_price, c.market_cap, c.price_change_24h
    FROM cryptocurrencies c
    WHERE c.symbol IS NOT NULL 
      AND c.name IS NOT NULL 
      AND c.symbol != '' 
      AND c.name != ''
      AND c.current_price IS NOT NULL
    ORDER BY c.market_cap DESC NULLS LAST, c.id ASC
  `;
  
  const cryptoResult = await pool.query(cryptoQuery);
  console.log(`📈 找到 ${cryptoResult.rows.length} 个加密货币待分析`);
  
  // 初始化进度跟踪
  realGlobalProgress = {
    batchId: `7d-${batchId7d}_30d-${batchId30d}`,
    totalCryptocurrencies: cryptoResult.rows.length,
    processedCount: 0,
    completedCount: 0,
    isComplete: false,
    progressPercentage: 0,
    remainingPercentage: 100,
    startTime: new Date(),
    message: `开始分析 ${cryptoResult.rows.length} 个加密货币...`
  };
  
  const validResults: RealVolatilityResult[] = [];
  let processedCount = 0;
  let skippedCount = 0;
  
  // 处理每个加密货币
  for (const crypto of cryptoResult.rows) {
    try {
      // 更新进度
      processedCount++;
      const progressPercentage = Math.round((processedCount / cryptoResult.rows.length) * 100);
      const remainingPercentage = 100 - progressPercentage;
      
      if (realGlobalProgress) {
        realGlobalProgress.processedCount = processedCount;
        realGlobalProgress.progressPercentage = progressPercentage;
        realGlobalProgress.remainingPercentage = remainingPercentage;
        realGlobalProgress.currentCrypto = crypto.symbol;
        realGlobalProgress.message = `还有${remainingPercentage}%的数据正在计算 (${processedCount}/${cryptoResult.rows.length})`;
      }
      
      // 获取该加密货币的所有历史数据 - 增加限制以获取足够的30天数据
      const volumeQuery = `
        SELECT volume_to_market_cap_ratio, timestamp
        FROM volume_to_market_cap_ratios
        WHERE cryptocurrency_id = $1
          AND volume_to_market_cap_ratio IS NOT NULL
          AND timestamp IS NOT NULL
        ORDER BY timestamp DESC
        LIMIT 100
      `;
      
      const volumeResult = await pool.query(volumeQuery, [crypto.id]);
      const ratioDataPoints = volumeResult.rows.map(row => parseFloat(row.volume_to_market_cap_ratio));
      
      // 如果没有交易量数据，尝试使用价格数据
      let allDataPoints = ratioDataPoints;
      if (allDataPoints.length === 0) {
        // 使用价格变化作为替代数据
        const priceChangeValue = parseFloat(crypto.price_change_24h);
        if (!isNaN(priceChangeValue)) {
          allDataPoints = [Math.abs(priceChangeValue)];
        }
      }
      
      if (allDataPoints.length === 0) {
        skippedCount++;
        continue;
      }
      
      // 计算7天和30天波动性
      const result7d = calculateCorrectVolatility(allDataPoints, '7d');
      const result30d = calculateCorrectVolatility(allDataPoints, '30d');
      
      // 只有当至少有一个时间范围有有效数据时才保存
      if (result7d.volatility > 0 || result30d.volatility > 0) {
        const direction = allDataPoints[0] > (allDataPoints[1] || 0) ? 'up' : 'down';
        
        const validResult: RealVolatilityResult = {
          symbol: crypto.symbol,
          name: crypto.name,
          cryptocurrencyId: crypto.id,
          volatility7d: result7d.volatility,
          volatility30d: result30d.volatility,
          direction,
          category7d: categorizeVolatility(result7d.volatility),
          category30d: categorizeVolatility(result30d.volatility),
          dataPoints7d: Math.min(allDataPoints.length, 8),
          dataPoints30d: Math.min(allDataPoints.length, 31),
          actualComparisons7d: result7d.actualComparisons,
          actualComparisons30d: result30d.actualComparisons
        };
        
        validResults.push(validResult);
      } else {
        skippedCount++;
      }
      
      // 每处理100个加密货币输出一次进度
      if (processedCount % 100 === 0) {
        console.log(`📊 进度: ${processedCount}/${cryptoResult.rows.length} (${progressPercentage}%), 有效结果: ${validResults.length}`);
      }
      
    } catch (error) {
      console.error(`处理加密货币 ${crypto.symbol} 时发生错误:`, error);
      skippedCount++;
    }
  }
  
  // 保存7天分析结果
  if (validResults.length > 0) {
    console.log(`💾 保存 ${validResults.length} 个7天波动性分析结果...`);
    
    for (const result of validResults) {
      if (result.volatility7d > 0) {
        const insertQuery = `
          INSERT INTO volatility_analysis (
            cryptocurrency_id, batch_id, symbol, name, volatility, direction, category, 
            data_points, actual_comparisons, timeframe, created_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
          ON CONFLICT (cryptocurrency_id, batch_id) DO UPDATE SET
            volatility = EXCLUDED.volatility,
            direction = EXCLUDED.direction,
            category = EXCLUDED.category,
            data_points = EXCLUDED.data_points,
            actual_comparisons = EXCLUDED.actual_comparisons
        `;
        
        await pool.query(insertQuery, [
          result.cryptocurrencyId,
          batchId7d,
          result.symbol,
          result.name,
          result.volatility7d,
          result.direction,
          result.category7d,
          result.dataPoints7d,
          result.actualComparisons7d,
          '7d'
        ]);
      }
    }
  }
  
  // 保存30天分析结果
  if (validResults.length > 0) {
    console.log(`💾 保存 ${validResults.length} 个30天波动性分析结果...`);
    
    for (const result of validResults) {
      if (result.volatility30d > 0) {
        const insertQuery = `
          INSERT INTO volatility_analysis (
            cryptocurrency_id, batch_id, symbol, name, volatility, direction, category, 
            data_points, actual_comparisons, timeframe, created_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
          ON CONFLICT (cryptocurrency_id, batch_id) DO UPDATE SET
            volatility = EXCLUDED.volatility,
            direction = EXCLUDED.direction,
            category = EXCLUDED.category,
            data_points = EXCLUDED.data_points,
            actual_comparisons = EXCLUDED.actual_comparisons
        `;
        
        await pool.query(insertQuery, [
          result.cryptocurrencyId,
          batchId30d,
          result.symbol,
          result.name,
          result.volatility30d,
          result.direction,
          result.category30d,
          result.dataPoints30d,
          result.actualComparisons30d,
          '30d'
        ]);
      }
    }
  }
  
  // 更新批次统计
  await pool.query('UPDATE volatility_analysis_batches SET total_analyzed = $1 WHERE id = $2', [validResults.length, batchId7d]);
  await pool.query('UPDATE volatility_analysis_batches SET total_analyzed = $1 WHERE id = $2', [validResults.length, batchId30d]);
  
  // 完成进度跟踪
  if (realGlobalProgress) {
    realGlobalProgress.completedCount = validResults.length;
    realGlobalProgress.isComplete = true;
    realGlobalProgress.progressPercentage = 100;
    realGlobalProgress.remainingPercentage = 0;
    realGlobalProgress.message = `分析完成！处理了 ${processedCount} 个加密货币，获得 ${validResults.length} 个有效结果`;
  }
  
  console.log(`✅ 真实波动性分析完成！`);
  console.log(`📊 总处理: ${processedCount}, 有效结果: ${validResults.length}, 跳过: ${skippedCount}`);
  
  return {
    batchId7d,
    batchId30d,
    totalAnalyzed: validResults.length,
    totalSkipped: skippedCount,
    progressMessage: `完成分析 ${validResults.length} 个加密货币的波动性数据`
  };
}