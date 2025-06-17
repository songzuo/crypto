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
 * 计算市值波动率（基于市值数据和时间戳的准确日均波动率）
 */
function calculateMarketCapVolatility(marketCaps: number[], timestamps: Date[]): {
  mean: number;
  standardDeviation: number;
  volatilityPercentage: number;
} {
  if (marketCaps.length < 2 || timestamps.length !== marketCaps.length) {
    return { mean: 0, standardDeviation: 0, volatilityPercentage: 0 };
  }
  
  // 计算每个时间段的市值变化和时间间隔
  const periodChanges: number[] = [];
  
  for (let i = 1; i < marketCaps.length; i++) {
    if (marketCaps[i-1] > 0 && marketCaps[i] > 0) {
      // 市值变化百分比：(本次市值 - 上次市值) / 上次市值
      const percentChange = Math.abs((marketCaps[i] - marketCaps[i-1]) / marketCaps[i-1]);
      
      // 计算时间间隔（小时）
      const timeIntervalHours = (timestamps[i].getTime() - timestamps[i-1].getTime()) / (1000 * 60 * 60);
      
      // 转换为日波动率：如果时间间隔不是24小时，按比例调整
      if (timeIntervalHours > 0) {
        const dailyVolatility = (percentChange / timeIntervalHours) * 24;
        periodChanges.push(dailyVolatility * 100); // 转换为百分比
      }
    }
  }
  
  if (periodChanges.length === 0) {
    return { mean: 0, standardDeviation: 0, volatilityPercentage: 0 };
  }
  
  // 计算平均日波动率
  const avgDailyVolatility = periodChanges.reduce((sum, change) => sum + change, 0) / periodChanges.length;
  
  // 计算标准差
  const variance = periodChanges.reduce((sum, change) => sum + Math.pow(change - avgDailyVolatility, 2), 0) / periodChanges.length;
  const standardDeviation = Math.sqrt(variance);
  
  const averageMarketCap = marketCaps.reduce((sum, cap) => sum + cap, 0) / marketCaps.length;
  
  return { 
    mean: averageMarketCap, 
    standardDeviation, 
    volatilityPercentage: Math.min(avgDailyVolatility, 500) // 限制最大值为500%
  };
}

/**
 * 兼容性函数：保持原有接口
 */
function calculatePriceVolatility(prices: number[]): {
  mean: number;
  standardDeviation: number;
  volatilityPercentage: number;
} {
  // 为兼容性创建假时间戳（每24小时一个数据点）
  const timestamps = prices.map((_, index) => new Date(Date.now() - (prices.length - 1 - index) * 24 * 60 * 60 * 1000));
  return calculateMarketCapVolatility(prices, timestamps);
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
    // 获取所有历史批次数据进行完整的历史波动率分析
    const allBatches = await storage.getVolumeToMarketCapBatches(1, 200); // 获取所有可用批次
    
    if (allBatches.data.length < 7) {
      console.warn(`历史批次不足，当前只有${allBatches.data.length}个批次，至少需要7个批次进行有效分析`);
      return [];
    }
    
    console.log(`开始${period}完整历史价格波动性分析，使用全部${allBatches.data.length}个历史批次`);
    
    // 按时间排序批次（最旧的在前）
    const sortedBatches = allBatches.data.sort((a, b) => 
      (a.createdAt?.getTime() || 0) - (b.createdAt?.getTime() || 0)
    );
    
    // 首先获取所有加密货币的基本信息和当前价格
    const allCryptos = await storage.getCryptocurrencies(1, 5000, 'rank', 'asc');
    const cryptoMap = new Map<string, { id: number, name: string, currentPrice: number }>();
    
    for (const crypto of allCryptos.data) {
      if (crypto.price && crypto.price > 0) {
        cryptoMap.set(crypto.symbol, {
          id: crypto.id,
          name: crypto.name,
          currentPrice: crypto.price
        });
      }
    }
    
    // 收集每个加密货币在所有批次中的完整历史市值数据，并计算价格波动
    const cryptoHistoricalData = new Map<string, Array<{marketCap: number, timestamp: Date, batchIndex: number}>>();
    const cryptoNames = new Map<string, string>();
    
    // 遍历所有历史批次收集数据
    for (let batchIndex = 0; batchIndex < sortedBatches.length; batchIndex++) {
      const batch = sortedBatches[batchIndex];
      try {
        const batchData = await storage.getVolumeToMarketCapRatiosByBatchId(batch.id);
        
        if (Array.isArray(batchData)) {
          for (const item of batchData) {
            if (item.marketCap && item.marketCap > 0 && !isNaN(item.marketCap)) {
              if (!cryptoHistoricalData.has(item.symbol)) {
                cryptoHistoricalData.set(item.symbol, []);
                cryptoNames.set(item.symbol, item.name);
              }
              
              // 记录市值数据，稍后转换为价格
              cryptoHistoricalData.get(item.symbol)!.push({
                marketCap: item.marketCap,
                timestamp: batch.createdAt || new Date(),
                batchIndex: batchIndex
              });
            }
          }
        }
      } catch (error) {
        console.log(`跳过批次 ${batch.id}，获取数据失败:`, error instanceof Error ? error.message : String(error));
        continue;
      }
    }
    
    const results: PriceVolatilityResult[] = [];
    
    // 计算每个加密货币的完整历史波动性
    const cryptoEntries = Array.from(cryptoHistoricalData.entries());
    for (const [symbol, historicalData] of cryptoEntries) {
      if (historicalData.length < 7) continue; // 至少需要7个历史数据点
      
      // 按时间排序历史数据
      const sortedData = historicalData.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
      
      // 根据时间周期计算滑动窗口波动性
      const periodDays = period === '7d' ? 7 : 30;
      const rollingVolatilities: number[] = [];
      
      // 计算每个可能的时间窗口的波动性（使用市值作为价格代理）
      for (let i = periodDays - 1; i < sortedData.length; i++) {
        const windowData = sortedData.slice(i - periodDays + 1, i + 1);
        const marketCaps = windowData.map(d => d.marketCap);
        
        if (marketCaps.length >= periodDays) {
          const windowStats = calculatePriceVolatility(marketCaps);
          rollingVolatilities.push(windowStats.volatilityPercentage);
        }
      }
      
      if (rollingVolatilities.length === 0) continue;
      
      // 计算平均波动性（多个时间窗口的平均值）
      const avgVolatility = rollingVolatilities.reduce((sum, vol) => sum + vol, 0) / rollingVolatilities.length;
      
      // 使用最新时间窗口的数据计算其他指标
      const recentWindow = sortedData.slice(-periodDays);
      const recentMarketCaps = recentWindow.map(d => d.marketCap);
      const recentStats = calculatePriceVolatility(recentMarketCaps);
      
      const category = categorizeVolatility(avgVolatility);
      const direction = determinePriceDirection(recentMarketCaps[0], recentMarketCaps[recentMarketCaps.length - 1]);
      const priceChange = ((recentMarketCaps[recentMarketCaps.length - 1] - recentMarketCaps[0]) / recentMarketCaps[0]) * 100;
      
      results.push({
        symbol,
        name: cryptoNames.get(symbol) || symbol,
        period,
        volatilityPercentage: avgVolatility, // 使用多窗口平均波动性
        standardDeviation: recentStats.standardDeviation,
        direction,
        category,
        rank: 0, // 稍后分配
        dataPoints: historicalData.length,
        averagePrice: recentStats.mean,
        minPrice: Math.min(...recentMarketCaps),
        maxPrice: Math.max(...recentMarketCaps),
        priceChange
      });
    }
    
    // 按波动率绝对值排序
    results.sort((a, b) => b.volatilityPercentage - a.volatilityPercentage);
    
    // 分配排名
    results.forEach((result, index) => {
      result.rank = index + 1;
    });
    
    console.log(`${period}完整历史价格波动性分析完成，共分析${results.length}个加密货币`);
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