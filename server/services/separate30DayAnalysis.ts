/**
 * 独立的30天波动性分析系统
 * 完全独立于7天分析，使用完整的30天数据进行计算
 */

import { pool } from '../db';

interface Separate30DayResult {
  symbol: string;
  name: string;
  cryptocurrencyId: number;
  volatility30d: number;
  direction: 'up' | 'down';
  category: 'Low' | 'Medium' | 'High';
  dataPoints30d: number;
  actualComparisons30d: number;
  averageValue: number;
  standardDeviation: number;
  rawDataPoints: number[];
}

interface Separate30DayProgress {
  batchId: number | null;
  totalCryptocurrencies: number;
  processedCount: number;
  completedCount: number;
  isComplete: boolean;
  progressPercentage: number;
  remainingPercentage: number;
  startTime: Date | null;
  estimatedEndTime?: Date | null;
  currentCrypto?: string;
  message: string;
}

let separate30DayGlobalProgress: Separate30DayProgress | null = null;

/**
 * 获取独立30天分析进度
 */
export function getSeparate30DayAnalysisProgress(): Separate30DayProgress | null {
  return separate30DayGlobalProgress;
}

/**
 * 计算30天波动性 - 使用完整数据集
 */
function calculate30DayVolatility(dataPoints: number[]): {
  volatility: number;
  actualComparisons: number;
  averageValue: number;
  standardDeviation: number;
} {
  if (dataPoints.length < 31) {
    return { volatility: 0, actualComparisons: 0, averageValue: 0, standardDeviation: 0 };
  }

  // 使用最多31个数据点进行30天分析
  const relevantPoints = dataPoints.slice(0, 31);
  
  // 计算平均值
  const sum = relevantPoints.reduce((acc, val) => acc + val, 0);
  const average = sum / relevantPoints.length;
  
  // 计算标准差
  const variance = relevantPoints.reduce((acc, val) => acc + Math.pow(val - average, 2), 0) / relevantPoints.length;
  const standardDeviation = Math.sqrt(variance);
  
  // 计算实际比较次数（相邻数据点的差异）
  let totalVolatility = 0;
  let actualComparisons = 0;
  
  for (let i = 0; i < relevantPoints.length - 1; i++) {
    const diff = Math.abs(relevantPoints[i] - relevantPoints[i + 1]);
    totalVolatility += diff;
    actualComparisons++;
  }
  
  // 30天分析应该有30次比较（31个数据点）
  const expectedComparisons = 30;
  const volatility = actualComparisons > 0 ? totalVolatility / actualComparisons : 0;
  
  console.log(`30天波动性计算: ${relevantPoints.length} 个数据点, ${actualComparisons} 次比较, 平均值: ${average.toFixed(4)}, 标准差: ${standardDeviation.toFixed(4)}`);
  
  return {
    volatility,
    actualComparisons,
    averageValue: average,
    standardDeviation
  };
}

/**
 * 波动性分类
 */
function categorize30DayVolatility(volatility: number): 'Low' | 'Medium' | 'High' {
  if (volatility < 0.1) return 'Low';
  if (volatility < 0.3) return 'Medium';
  return 'High';
}

/**
 * 运行独立的30天波动性分析
 */
export async function runSeparate30DayAnalysis(): Promise<{ 
  batchId: number; 
  totalAnalyzed: number; 
  progressMessage: string 
}> {
  console.log('🚀 开始独立30天波动性分析...');
  
  // 创建新的30天分析批次
  const batchResult = await pool.query(`
    INSERT INTO volatility_analysis_batches (timeframe, analysis_type, total_analyzed, created_at)
    VALUES ('30d', 'separate_30day', 0, NOW())
    RETURNING id
  `);
  
  const batchId = batchResult.rows[0].id;
  console.log(`📊 创建30天分析批次: ${batchId}`);
  
  // 获取所有加密货币
  const cryptoQuery = `
    SELECT DISTINCT c.id, c.name, c.symbol, c.price_change_24h, c.market_cap
    FROM cryptocurrencies c
    WHERE c.name IS NOT NULL 
      AND c.symbol IS NOT NULL
      AND c.id IS NOT NULL
    ORDER BY c.market_cap DESC NULLS LAST
  `;
  
  const cryptoResult = await pool.query(cryptoQuery);
  console.log(`🔍 找到 ${cryptoResult.rows.length} 个加密货币进行30天分析`);
  
  // 初始化进度跟踪
  separate30DayGlobalProgress = {
    batchId,
    totalCryptocurrencies: cryptoResult.rows.length,
    processedCount: 0,
    completedCount: 0,
    isComplete: false,
    progressPercentage: 0,
    remainingPercentage: 100,
    startTime: new Date(),
    message: `开始30天独立分析 ${cryptoResult.rows.length} 个加密货币...`
  };
  
  const validResults: Separate30DayResult[] = [];
  let processedCount = 0;
  let skippedCount = 0;
  
  // 处理每个加密货币
  for (const crypto of cryptoResult.rows) {
    try {
      // 更新进度
      processedCount++;
      const progressPercentage = Math.round((processedCount / cryptoResult.rows.length) * 100);
      const remainingPercentage = 100 - progressPercentage;
      
      if (separate30DayGlobalProgress) {
        separate30DayGlobalProgress.processedCount = processedCount;
        separate30DayGlobalProgress.progressPercentage = progressPercentage;
        separate30DayGlobalProgress.remainingPercentage = remainingPercentage;
        separate30DayGlobalProgress.currentCrypto = crypto.symbol;
        separate30DayGlobalProgress.message = `30天分析还有${remainingPercentage}%的数据正在计算 (${processedCount}/${cryptoResult.rows.length})`;
      }
      
      // 获取该加密货币的历史数据 - 获取更多数据点用于30天分析
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
      
      // 如果没有交易量数据，尝试获取价格历史数据
      let allDataPoints = ratioDataPoints;
      if (allDataPoints.length < 31) {
        // 尝试获取历史价格数据（使用当前价格和价格变化）
        const priceQuery = `
          SELECT price, price_change_24h
          FROM cryptocurrencies
          WHERE id = $1
            AND price IS NOT NULL
            AND price_change_24h IS NOT NULL
          LIMIT 1
        `;
        
        const priceResult = await pool.query(priceQuery, [crypto.id]);
        if (priceResult.rows.length > 0) {
          // 由于我们只有当前价格和24小时变化，无法获取31个历史数据点
          // 这里我们需要依赖volume_to_market_cap_ratios表的历史数据
          console.log(`📊 ${crypto.symbol}: 无法从价格数据获取足够的历史数据点`);
        }
      }
      
      // 检查是否有足够的数据进行30天分析
      if (allDataPoints.length < 31) {
        console.log(`❌ ${crypto.symbol}: 数据不足 (${allDataPoints.length} 个数据点，30天需要31个)`);
        // 记录当前数据点数量以便分析
        if (allDataPoints.length > 0) {
          console.log(`📊 ${crypto.symbol}: 当前可用数据点: ${allDataPoints.length}, 实际数据: [${allDataPoints.slice(0, 5).map(v => v.toFixed(6)).join(', ')}...]`);
        }
        skippedCount++;
        continue;
      }
      
      // 计算30天波动性
      const result30d = calculate30DayVolatility(allDataPoints);
      
      if (result30d.volatility > 0 && result30d.actualComparisons >= 30) {
        const direction = allDataPoints[0] > (allDataPoints[1] || 0) ? 'up' : 'down';
        
        const validResult: Separate30DayResult = {
          symbol: crypto.symbol,
          name: crypto.name,
          cryptocurrencyId: crypto.id,
          volatility30d: result30d.volatility,
          direction,
          category: categorize30DayVolatility(result30d.volatility),
          dataPoints30d: allDataPoints.length,
          actualComparisons30d: result30d.actualComparisons,
          averageValue: result30d.averageValue,
          standardDeviation: result30d.standardDeviation,
          rawDataPoints: allDataPoints.slice(0, 31)
        };
        
        validResults.push(validResult);
        console.log(`✅ ${crypto.symbol}: 30天波动性 ${result30d.volatility.toFixed(4)} (${result30d.actualComparisons} 次比较)`);
      } else {
        console.log(`❌ ${crypto.symbol}: 30天计算失败 (波动性: ${result30d.volatility}, 比较次数: ${result30d.actualComparisons})`);
        skippedCount++;
      }
      
      // 每处理50个加密货币输出一次进度
      if (processedCount % 50 === 0) {
        console.log(`📊 30天分析进度: ${processedCount}/${cryptoResult.rows.length} (${progressPercentage}%), 有效结果: ${validResults.length}`);
      }
      
    } catch (error) {
      console.error(`处理加密货币 ${crypto.symbol} 时发生错误:`, error);
      skippedCount++;
    }
  }
  
  // 保存30天分析结果
  if (validResults.length > 0) {
    console.log(`💾 保存 ${validResults.length} 个30天波动性分析结果...`);
    
    for (const result of validResults) {
      const insertQuery = `
        INSERT INTO volatility_analysis (
          batch_id, cryptocurrency_id, symbol, name, period, 
          volatility_percentage, direction, category, data_points, 
          comparisons, average_market_cap, market_cap_change, 
          created_at, analysis_type
        ) VALUES (
          $1, $2, $3, $4, '30d', $5, $6, $7, $8, $9, $10, $11, NOW(), 'separate_30day'
        )
        ON CONFLICT (batch_id, cryptocurrency_id, period) 
        DO UPDATE SET
          volatility_percentage = EXCLUDED.volatility_percentage,
          direction = EXCLUDED.direction,
          category = EXCLUDED.category,
          data_points = EXCLUDED.data_points,
          comparisons = EXCLUDED.comparisons
      `;
      
      await pool.query(insertQuery, [
        batchId,
        result.cryptocurrencyId,
        result.symbol,
        result.name,
        result.volatility30d,
        result.direction,
        result.category,
        result.dataPoints30d,
        result.actualComparisons30d,
        result.averageValue,
        result.standardDeviation
      ]);
    }
  }
  
  // 更新批次统计
  await pool.query('UPDATE volatility_analysis_batches SET total_analyzed = $1 WHERE id = $2', [validResults.length, batchId]);
  
  // 完成进度跟踪
  if (separate30DayGlobalProgress) {
    separate30DayGlobalProgress.completedCount = validResults.length;
    separate30DayGlobalProgress.isComplete = true;
    separate30DayGlobalProgress.progressPercentage = 100;
    separate30DayGlobalProgress.remainingPercentage = 0;
    separate30DayGlobalProgress.message = `✅ 30天独立分析完成！处理了 ${processedCount} 个加密货币，获得 ${validResults.length} 个有效结果`;
  }
  
  // 延迟清空进度，让前端有时间显示完成状态
  setTimeout(() => {
    separate30DayGlobalProgress = null;
  }, 5000);
  
  console.log(`✅ 30天独立波动性分析完成！`);
  console.log(`📊 总处理: ${processedCount}, 有效结果: ${validResults.length}, 跳过: ${skippedCount}`);
  
  return {
    batchId,
    totalAnalyzed: validResults.length,
    progressMessage: `30天独立分析完成 ${validResults.length} 个加密货币的波动性数据`
  };
}