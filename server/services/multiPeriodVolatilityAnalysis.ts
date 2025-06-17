/**
 * 多周期波动性分析服务
 * 基于交易量市值比率数据计算7天和30天平均波动性指标
 */

import { storage } from '../storage';

export interface MultiPeriodVolatilityResult {
  symbol: string;
  name: string;
  period: '7d' | '30d';
  volatilityPercentage: number;
  standardDeviation: number;
  direction: 'up' | 'down' | 'stable';
  category: string;
  rank: number;
  dataPoints: number;
  averageRatio: number;
  minRatio: number;
  maxRatio: number;
}

/**
 * 计算标准差和平均波动性
 */
function calculateStandardDeviation(values: number[]): {
  mean: number;
  standardDeviation: number;
  volatilityPercentage: number;
} {
  if (values.length === 0) {
    return { mean: 0, standardDeviation: 0, volatilityPercentage: 0 };
  }
  
  const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
  const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
  const standardDeviation = Math.sqrt(variance);
  
  // 转换为百分比波动率 (变异系数)
  const volatilityPercentage = mean > 0 ? (standardDeviation / mean) * 100 : 0;
  
  return { mean, standardDeviation, volatilityPercentage };
}

/**
 * 确定波动性类别
 */
function categorizeVolatility(volatilityPercentage: number): string {
  if (volatilityPercentage >= 10) return '极高';
  if (volatilityPercentage >= 5) return '高';
  if (volatilityPercentage >= 2) return '中';
  if (volatilityPercentage >= 1) return '低';
  return '极低';
}

/**
 * 确定总体方向
 */
function determineDirection(firstValue: number, lastValue: number): 'up' | 'down' | 'stable' {
  const change = ((lastValue - firstValue) / firstValue) * 100;
  if (change > 1) return 'up';
  if (change < -1) return 'down';
  return 'stable';
}

/**
 * 获取多周期波动性分析结果
 */
export async function getMultiPeriodVolatilityAnalysis(period: '7d' | '30d' = '7d'): Promise<MultiPeriodVolatilityResult[]> {
  try {
    const requiredBatches = period === '7d' ? 7 : 30;
    
    // 获取最近的批次数据
    const batches = await storage.getVolumeToMarketCapBatches(1, requiredBatches);
    
    if (batches.data.length < 3) {
      console.warn(`需要至少3个批次进行${period}波动性分析，当前只有${batches.data.length}个批次`);
      return [];
    }
    
    console.log(`开始${period}波动性分析，使用${batches.data.length}个历史批次`);
    
    // 收集所有批次的数据
    const batchDataMap = new Map<string, number[]>(); // symbol -> [ratios]
    const cryptoNames = new Map<string, string>(); // symbol -> name
    
    for (const batch of batches.data) {
      const batchData = await storage.getVolumeToMarketCapRatiosByBatchId(batch.id);
      
      for (const item of batchData) {
        if (item.volumeToMarketCapRatio && item.volumeToMarketCapRatio > 0 && !isNaN(item.volumeToMarketCapRatio)) {
          if (!batchDataMap.has(item.symbol)) {
            batchDataMap.set(item.symbol, []);
            cryptoNames.set(item.symbol, item.name);
          }
          batchDataMap.get(item.symbol)!.push(item.volumeToMarketCapRatio);
        }
      }
    }
    
    console.log(`收集到${batchDataMap.size}个加密货币的历史数据`);
    
    const results: MultiPeriodVolatilityResult[] = [];
    
    // 计算每个加密货币的波动性
    for (const [symbol, ratios] of Array.from(batchDataMap.entries())) {
      // 需要至少3个数据点才能计算有效的波动性
      if (ratios.length < 3) continue;
      
      const name = cryptoNames.get(symbol) || symbol;
      const stats = calculateStandardDeviation(ratios);
      const direction = determineDirection(ratios[ratios.length - 1], ratios[0]);
      const category = categorizeVolatility(stats.volatilityPercentage);
      
      results.push({
        symbol,
        name,
        period,
        volatilityPercentage: stats.volatilityPercentage,
        standardDeviation: stats.standardDeviation,
        direction,
        category,
        rank: 0, // 稍后分配
        dataPoints: ratios.length,
        averageRatio: stats.mean,
        minRatio: Math.min(...ratios),
        maxRatio: Math.max(...ratios)
      });
    }
    
    // 按波动率绝对值排序
    results.sort((a, b) => b.volatilityPercentage - a.volatilityPercentage);
    
    // 分配排名
    results.forEach((result, index) => {
      result.rank = index + 1;
    });
    
    console.log(`${period}波动性分析完成，共分析${results.length}个加密货币`);
    
    return results;
    
  } catch (error) {
    console.error(`${period}波动性分析出错:`, error);
    return [];
  }
}

/**
 * 获取带筛选的多周期波动性结果
 */
export async function getFilteredMultiPeriodVolatility(
  period: '7d' | '30d' = '7d',
  direction?: string,
  category?: string,
  page: number = 1,
  limit: number = 30
): Promise<{ entries: MultiPeriodVolatilityResult[], total: number, page: number, limit: number }> {
  const allResults = await getMultiPeriodVolatilityAnalysis(period);
  
  let filteredResults = allResults;
  
  if (direction && direction !== 'all') {
    filteredResults = filteredResults.filter(result => result.direction === direction);
  }
  
  if (category && category !== 'all') {
    filteredResults = filteredResults.filter(result => result.category === category);
  }
  
  // 分页
  const total = filteredResults.length;
  const startIndex = (page - 1) * limit;
  const endIndex = startIndex + limit;
  const paginatedResults = filteredResults.slice(startIndex, endIndex);
  
  return {
    entries: paginatedResults,
    total,
    page,
    limit
  };
}