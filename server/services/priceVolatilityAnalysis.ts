/**
 * 基于价格数据的真实波动性分析服务
 * 计算加密货币价格的标准波动率，而非交易量比率波动率
 */

import { storage } from '../storage';

export interface PriceVolatilityResult {
  symbol: string;
  name: string;
  period: '7d' | '30d';
  volatilityPercentage: number;
  standardDeviation: number;
  direction: 'up' | 'down' | 'stable';
  category: string;
  rank: number;
  dataPoints: number;
  averagePrice: number;
  minPrice: number;
  maxPrice: number;
  priceChange: number;
}

/**
 * 计算价格波动率（基于价格变化的标准差）
 */
function calculatePriceVolatility(prices: number[]): {
  mean: number;
  standardDeviation: number;
  volatilityPercentage: number;
} {
  if (prices.length < 2) {
    return { mean: 0, standardDeviation: 0, volatilityPercentage: 0 };
  }
  
  // 计算日收益率
  const returns: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    if (prices[i-1] > 0 && prices[i] > 0) {
      const dailyReturn = (prices[i] - prices[i-1]) / prices[i-1];
      returns.push(dailyReturn);
    }
  }
  
  if (returns.length === 0) {
    return { mean: 0, standardDeviation: 0, volatilityPercentage: 0 };
  }
  
  // 计算收益率的平均值和标准差
  const meanReturn = returns.reduce((sum, ret) => sum + ret, 0) / returns.length;
  const variance = returns.reduce((sum, ret) => sum + Math.pow(ret - meanReturn, 2), 0) / returns.length;
  const standardDeviation = Math.sqrt(variance);
  
  // 年化波动率（假设252个交易日）
  const annualizedVolatility = standardDeviation * Math.sqrt(252) * 100;
  
  // 对于短期分析，我们使用实际的标准差*100作为波动率百分比
  const volatilityPercentage = standardDeviation * 100;
  
  const averagePrice = prices.reduce((sum, price) => sum + price, 0) / prices.length;
  
  return { 
    mean: averagePrice, 
    standardDeviation, 
    volatilityPercentage 
  };
}

/**
 * 确定波动性类别（基于真实市场标准）
 */
function categorizeVolatility(volatilityPercentage: number): string {
  if (volatilityPercentage >= 8) return '极高';    // >8% 日波动率
  if (volatilityPercentage >= 5) return '高';      // 5-8% 日波动率
  if (volatilityPercentage >= 3) return '中';      // 3-5% 日波动率  
  if (volatilityPercentage >= 1.5) return '低';    // 1.5-3% 日波动率
  return '极低';                                   // <1.5% 日波动率
}

/**
 * 确定价格趋势方向
 */
function determinePriceDirection(firstPrice: number, lastPrice: number): 'up' | 'down' | 'stable' {
  const change = ((lastPrice - firstPrice) / firstPrice) * 100;
  if (change > 2) return 'up';      // 上涨超过2%
  if (change < -2) return 'down';   // 下跌超过2%
  return 'stable';                  // 变化在±2%内
}

/**
 * 获取基于价格的波动性分析结果
 */
export async function getPriceBasedVolatilityAnalysis(period: '7d' | '30d' = '7d'): Promise<PriceVolatilityResult[]> {
  try {
    const requiredBatches = period === '7d' ? 7 : 30;
    
    // 获取最近的批次数据
    const batches = await storage.getVolumeToMarketCapBatches(1, requiredBatches);
    
    if (batches.data.length < 3) {
      console.warn(`需要至少3个批次进行${period}价格波动性分析，当前只有${batches.data.length}个批次`);
      return [];
    }
    
    console.log(`开始${period}价格波动性分析，使用${batches.data.length}个历史批次`);
    
    // 获取加密货币的历史价格数据
    const cryptoPriceData = new Map<string, number[]>(); // symbol -> [prices]
    const cryptoNames = new Map<string, string>(); // symbol -> name
    
    // 收集所有批次的市值数据作为价格代理
    for (const batch of batches.data) {
      const batchData = await storage.getVolumeToMarketCapRatiosByBatchId(batch.id, 1, 5000);
      
      for (const item of batchData.data) {
        // 使用市值作为价格代理进行波动率分析
        if (item.marketCap && item.marketCap > 0 && !isNaN(item.marketCap)) {
          if (!cryptoPriceData.has(item.symbol)) {
            cryptoPriceData.set(item.symbol, []);
            cryptoNames.set(item.symbol, item.name);
          }
          cryptoPriceData.get(item.symbol)!.push(item.marketCap);
        }
      }
    }
    
    const results: PriceVolatilityResult[] = [];
    
    // 分析每个加密货币的价格波动性
    for (const [symbol, prices] of cryptoPriceData.entries()) {
      if (prices.length < 3) continue; // 至少需要3个数据点
      
      const stats = calculatePriceVolatility(prices);
      const category = categorizeVolatility(stats.volatilityPercentage);
      const direction = determinePriceDirection(prices[0], prices[prices.length - 1]);
      const priceChange = ((prices[prices.length - 1] - prices[0]) / prices[0]) * 100;
      
      results.push({
        symbol,
        name: cryptoNames.get(symbol) || symbol,
        period,
        volatilityPercentage: stats.volatilityPercentage,
        standardDeviation: stats.standardDeviation,
        direction,
        category,
        rank: 0, // 稍后分配
        dataPoints: prices.length,
        averagePrice: stats.mean,
        minPrice: Math.min(...prices),
        maxPrice: Math.max(...prices),
        priceChange
      });
    }
    
    // 按波动率绝对值排序
    results.sort((a, b) => b.volatilityPercentage - a.volatilityPercentage);
    
    // 分配排名
    results.forEach((result, index) => {
      result.rank = index + 1;
    });
    
    console.log(`${period}价格波动性分析完成，共分析${results.length}个加密货币`);
    console.log(`各类别分布：`);
    const categoryCount = results.reduce((acc, r) => {
      acc[r.category] = (acc[r.category] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    console.log(categoryCount);
    
    return results;
    
  } catch (error) {
    console.error(`${period}价格波动性分析出错:`, error);
    return [];
  }
}

/**
 * 获取带筛选的价格波动性结果
 */
export async function getFilteredPriceVolatility(
  period: '7d' | '30d' = '7d',
  direction?: string,
  category?: string,
  page: number = 1,
  limit: number = 30
): Promise<{ entries: PriceVolatilityResult[], total: number, page: number, limit: number }> {
  const allResults = await getPriceBasedVolatilityAnalysis(period);
  
  let filteredResults = allResults;
  
  if (direction && direction !== 'all') {
    filteredResults = filteredResults.filter(result => result.direction === direction);
  }
  
  if (category && category !== 'all') {
    filteredResults = filteredResults.filter(result => result.category === category);
  }
  
  console.log(`筛选条件: direction=${direction}, category=${category}`);
  console.log(`筛选前: ${allResults.length}个结果, 筛选后: ${filteredResults.length}个结果`);
  
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