/**
 * 直接波动性分析服务
 * 使用您指定的四个改进直接计算和返回波动性结果
 * 
 * 解决的问题：
 * 1. 143个数据产生142个比较比值
 * 2. 每个币的波动率是这142个比值按7天或30天平均的值
 * 3. 根据时间差计算小时波动率然后乘24得到日波动率
 * 4. 避免数据库存储复杂性，直接返回计算结果
 */

import { storage } from "../storage";

export interface DirectVolatilityResult {
  symbol: string;
  name: string;
  period: '7d' | '30d';
  volatilityPercentage: number;
  direction: 'up' | 'down' | 'stable';
  category: string;
  rank: number;
  dataPoints: number;
  comparisons: number;
  averageMarketCap: number;
  marketCapChange: number;
}

/**
 * 计算准确的市值波动率（按时间段正确计算）
 * 对于143个批次，产生142个比较比值
 */
function calculateAccurateVolatility(historicalData: Array<{marketCap: number, timestamp: Date}>): {
  volatilityPercentage: number;
  totalComparisons: number;
  averageMarketCap: number;
  marketCapChange: number;
} {
  if (historicalData.length < 2) {
    return { volatilityPercentage: 0, totalComparisons: 0, averageMarketCap: 0, marketCapChange: 0 };
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
    return { volatilityPercentage: 0, totalComparisons: 0, averageMarketCap: 0, marketCapChange: 0 };
  }
  
  // 计算平均日波动率（所有比值的平均）
  const avgDailyVolatility = volatilityRatios.reduce((sum, ratio) => sum + ratio, 0) / volatilityRatios.length;
  
  const averageMarketCap = sortedData.reduce((sum, item) => sum + item.marketCap, 0) / sortedData.length;
  const marketCapChange = ((sortedData[sortedData.length - 1].marketCap - sortedData[0].marketCap) / sortedData[0].marketCap) * 100;
  
  return { 
    volatilityPercentage: Math.min(avgDailyVolatility, 500), // 限制最大值为500%
    totalComparisons: volatilityRatios.length,
    averageMarketCap,
    marketCapChange
  };
}

/**
 * 确定波动性类别（基于真实市场标准）
 */
function categorizeVolatility(volatilityPercentage: number): string {
  if (volatilityPercentage >= 50) return '极高';
  if (volatilityPercentage >= 20) return '高';
  if (volatilityPercentage >= 10) return '中';
  if (volatilityPercentage >= 5) return '低';
  return '极低';
}

/**
 * 确定价格趋势方向
 */
function determinePriceDirection(marketCapChange: number): 'up' | 'down' | 'stable' {
  const threshold = 1; // 1%
  
  if (marketCapChange > threshold) return 'up';
  if (marketCapChange < -threshold) return 'down';
  return 'stable';
}

/**
 * 执行直接波动性分析并返回结果
 */
export async function getDirectVolatilityAnalysis(
  period: '7d' | '30d' = '7d',
  direction?: string,
  category?: string,
  page: number = 1,
  limit: number = 30
): Promise<{
  entries: DirectVolatilityResult[];
  total: number;
  page: number;
  limit: number;
  period: string;
}> {
  console.log(`开始${period}直接波动性分析...`);
  
  // 获取所有历史批次用于计算
  const allBatches = await storage.getVolumeToMarketCapBatches(1, 1000);
  const results: DirectVolatilityResult[] = [];
  
  if (allBatches.data.length < 2) {
    console.log('历史数据不足，至少需要2个批次进行波动性分析');
    return { entries: [], total: 0, page, limit, period };
  }
  
  console.log(`使用${allBatches.data.length}个历史批次进行波动性分析`);
  
  // 获取所有加密货币的历史数据
  const cryptoHistoricalData = new Map<string, Array<{marketCap: number, timestamp: Date}>>();
  
  // 收集所有批次的数据
  for (let i = 0; i < allBatches.data.length; i++) {
    const batch = allBatches.data[i];
    try {
      const batchData = await storage.getVolumeToMarketCapRatios(batch.id);
      
      for (const entry of batchData.data) {
        const crypto = await storage.getCryptocurrency(entry.cryptocurrencyId);
        if (!crypto || !crypto.marketCap || crypto.marketCap <= 0) continue;
        
        if (!cryptoHistoricalData.has(crypto.symbol)) {
          cryptoHistoricalData.set(crypto.symbol, []);
        }
        
        cryptoHistoricalData.get(crypto.symbol)!.push({
          marketCap: crypto.marketCap,
          timestamp: batch.createdAt || new Date()
        });
      }
    } catch (error) {
      console.log(`跳过批次 ${batch.id}，获取数据失败:`, error instanceof Error ? error.message : String(error));
      continue;
    }
  }
  
  // 计算每个加密货币的波动性
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
    
    // 计算其他指标
    const categoryValue = categorizeVolatility(avgVolatility);
    const direction_value = determinePriceDirection(periodStats.marketCapChange);
    
    const crypto = await storage.getCryptocurrencyBySymbol?.(symbol);
    if (!crypto) {
      // 尝试通过遍历找到匹配的加密货币
      const allCryptos = await storage.getCryptocurrencies(1, 2000);
      const foundCrypto = allCryptos.data.find(c => c.symbol === symbol);
      if (!foundCrypto) continue;
    }
    
    const finalCrypto = crypto || allCryptos?.data.find(c => c.symbol === symbol);
    if (!finalCrypto) continue;
    
    const result: DirectVolatilityResult = {
      symbol,
      name: finalCrypto.name,
      period,
      volatilityPercentage: avgVolatility,
      direction: direction_value,
      category: categoryValue,
      rank: finalCrypto.rank || 0,
      dataPoints: sortedData.length,
      comparisons: periodStats.totalComparisons,
      averageMarketCap: periodStats.averageMarketCap,
      marketCapChange: periodStats.marketCapChange
    };
    
    results.push(result);
  }
  
  // 按波动性排序
  results.sort((a, b) => b.volatilityPercentage - a.volatilityPercentage);
  
  // 更新排名
  results.forEach((result, index) => {
    result.rank = index + 1;
  });
  
  // 应用筛选条件
  let filteredResults = results;
  
  if (direction && direction !== 'all' && direction !== 'undefined') {
    filteredResults = filteredResults.filter(r => r.direction === direction);
  }
  
  if (category && category !== 'all' && category !== 'undefined') {
    filteredResults = filteredResults.filter(r => r.category === category);
  }
  
  // 应用分页
  const offset = (page - 1) * limit;
  const paginatedResults = filteredResults.slice(offset, offset + limit);
  
  // 统计各类别分布
  const categoryDistribution = results.reduce((acc, result) => {
    acc[result.category] = (acc[result.category] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  
  console.log(`${period}直接波动性分析完成，共分析${results.length}个加密货币`);
  console.log('各类别分布：', categoryDistribution);
  console.log(`筛选条件: direction=${direction}, category=${category}`);
  console.log(`筛选前: ${results.length}个结果, 筛选后: ${filteredResults.length}个结果`);
  
  return {
    entries: paginatedResults,
    total: filteredResults.length,
    page,
    limit,
    period
  };
}