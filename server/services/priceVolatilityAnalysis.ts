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
 * 计算基于市值的准确波动率（按时间段正确计算）
 * 对于143个批次，应该有142个比较比值
 */
function calculateAccurateVolatility(historicalData: Array<{marketCap: number, timestamp: Date}>): {
  mean: number;
  standardDeviation: number;
  volatilityPercentage: number;
  totalComparisons: number;
} {
  if (historicalData.length < 2) {
    return { mean: 0, standardDeviation: 0, volatilityPercentage: 0, totalComparisons: 0 };
  }
  
  // 按时间排序
  const sortedData = historicalData.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  
  // 计算所有相邻数据点之间的波动率比值
  const volatilityRatios: number[] = [];
  
  for (let i = 1; i < sortedData.length; i++) {
    const current = sortedData[i];
    const previous = sortedData[i - 1];
    
    if (previous.marketCap > 0 && current.marketCap > 0) {
      // 市值变化百分比：(本次市值 - 上次市值) / 上次市值
      const percentChange = Math.abs((current.marketCap - previous.marketCap) / previous.marketCap);
      
      // 计算时间间隔（小时）
      const timeIntervalHours = (current.timestamp.getTime() - previous.timestamp.getTime()) / (1000 * 60 * 60);
      
      // 转换为日波动率：小时波动率 * 24
      if (timeIntervalHours > 0) {
        const hourlyVolatility = percentChange / timeIntervalHours;
        const dailyVolatility = hourlyVolatility * 24;
        volatilityRatios.push(dailyVolatility * 100); // 转换为百分比
      }
    }
  }
  
  if (volatilityRatios.length === 0) {
    return { mean: 0, standardDeviation: 0, volatilityPercentage: 0, totalComparisons: 0 };
  }
  
  // 计算平均日波动率（所有比值的平均）
  const avgDailyVolatility = volatilityRatios.reduce((sum, ratio) => sum + ratio, 0) / volatilityRatios.length;
  
  // 计算标准差
  const variance = volatilityRatios.reduce((sum, ratio) => sum + Math.pow(ratio - avgDailyVolatility, 2), 0) / volatilityRatios.length;
  const standardDeviation = Math.sqrt(variance);
  
  const averageMarketCap = sortedData.reduce((sum, item) => sum + item.marketCap, 0) / sortedData.length;
  
  return { 
    mean: averageMarketCap, 
    standardDeviation, 
    volatilityPercentage: Math.min(avgDailyVolatility, 500), // 限制最大值为500%
    totalComparisons: volatilityRatios.length
  };
}

/**
 * 简化的市值波动率计算函数（保持旧代码兼容）
 */
function calculateMarketCapVolatility(marketCaps: number[], timestamps: Date[]): {
  mean: number;
  standardDeviation: number;
  volatilityPercentage: number;
} {
  const historicalData = marketCaps.map((marketCap, index) => ({
    marketCap,
    timestamp: timestamps[index]
  }));
  
  const result = calculateAccurateVolatility(historicalData);
  return {
    mean: result.mean,
    standardDeviation: result.standardDeviation,
    volatilityPercentage: result.volatilityPercentage
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
      
      // 使用新的准确波动率计算方法：143个数据产生142个比值
      const fullStats = calculateAccurateVolatility(sortedData);
      
      // 根据时间段筛选数据进行平均计算
      const periodHours = period === '7d' ? 7 * 24 : 30 * 24;
      const cutoffTime = new Date(Date.now() - periodHours * 60 * 60 * 1000);
      const periodData = sortedData.filter(d => d.timestamp >= cutoffTime);
      
      // 如果时间段内数据不足，使用全部数据
      const dataForPeriod = periodData.length >= 2 ? periodData : sortedData;
      const periodStats = calculateAccurateVolatility(dataForPeriod);
      
      // 平均波动性：使用时间段内的准确计算结果
      const avgVolatility = periodStats.volatilityPercentage;
      
      // 使用最新数据计算其他指标
      const recentWindow = sortedData.slice(-Math.min(7, sortedData.length));
      const recentMarketCaps = recentWindow.map(d => d.marketCap);
      const recentStats = { 
        mean: periodStats.mean,
        standardDeviation: periodStats.standardDeviation, 
        volatilityPercentage: avgVolatility 
      };
      
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