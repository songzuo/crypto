/**
 * 优化的波动性分析服务
 * 实现正确的计算方法并存储到数据库
 * 
 * 解决的问题：
 * 1. 143个数据产生142个比较比值
 * 2. 每个币的波动率是这142个比值按7天或30天平均的值
 * 3. 根据时间差计算小时波动率然后乘24得到日波动率
 * 4. 结果存储在数据库中避免重复计算
 */

import { storage } from "../storage";
import { eq, desc } from "drizzle-orm";

export interface VolatilityResult {
  symbol: string;
  name: string;
  period: '7d' | '30d';
  volatilityPercentage: number;
  standardDeviation: number;
  direction: 'up' | 'down' | 'stable';
  category: string;
  rank: number;
  dataPoints: number;
  comparisons: number;
  averageMarketCap: number;
  minMarketCap: number;
  maxMarketCap: number;
  marketCapChange: number;
}

/**
 * 计算准确的市值波动率（按时间段正确计算）
 * 对于143个批次，产生142个比较比值
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
function determinePriceDirection(firstMarketCap: number, lastMarketCap: number): 'up' | 'down' | 'stable' {
  const threshold = 0.01; // 1%
  const change = (lastMarketCap - firstMarketCap) / firstMarketCap;
  
  if (change > threshold) return 'up';
  if (change < -threshold) return 'down';
  return 'stable';
}

/**
 * 执行波动性分析并存储到数据库
 */
export async function calculateAndStoreVolatilityAnalysis(period: '7d' | '30d' = '7d'): Promise<number> {
  console.log(`开始${period}波动性分析计算和数据库存储...`);
  
  // 创建新的分析批次
  const batch = await storage.createVolatilityAnalysisBatch({
    timeframe: period,
    totalAnalyzed: 0,
    analysisType: 'market_cap_volatility'
  });
  
  console.log(`创建了波动性分析批次 ${batch.id}`);
  
  // 获取所有历史批次用于计算
  const allBatches = await storage.getAllVolatilityRatioBatches();
  const results: VolatilityResult[] = [];
  
  if (allBatches.length < 2) {
    console.log('历史数据不足，至少需要2个批次进行波动性分析');
    return batch.id;
  }
  
  console.log(`使用${allBatches.length}个历史批次进行波动性分析`);
  
  // 获取所有加密货币的历史数据
  const cryptoHistoricalData = new Map<string, Array<{marketCap: number, timestamp: Date, batchIndex: number}>>();
  
  // 收集所有批次的数据
  for (let i = 0; i < allBatches.length; i++) {
    const batch = allBatches[i];
    try {
      const batchData = await storage.getVolumeRatiosByBatchId(batch.id);
      
      for (const entry of batchData) {
        const crypto = await storage.getCryptocurrency(entry.cryptocurrencyId);
        if (!crypto || !crypto.marketCap || crypto.marketCap <= 0) continue;
        
        if (!cryptoHistoricalData.has(crypto.symbol)) {
          cryptoHistoricalData.set(crypto.symbol, []);
        }
        
        cryptoHistoricalData.get(crypto.symbol)!.push({
          marketCap: crypto.marketCap,
          timestamp: batch.createdAt || new Date(),
          batchIndex: i
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
    const marketCaps = sortedData.map(d => d.marketCap);
    const category = categorizeVolatility(avgVolatility);
    const direction = determinePriceDirection(marketCaps[0], marketCaps[marketCaps.length - 1]);
    const marketCapChange = ((marketCaps[marketCaps.length - 1] - marketCaps[0]) / marketCaps[0]) * 100;
    
    const crypto = await storage.getCryptocurrencyBySymbol(symbol);
    if (!crypto) continue;
    
    const result: VolatilityResult = {
      symbol,
      name: crypto.name,
      period,
      volatilityPercentage: avgVolatility,
      standardDeviation: periodStats.standardDeviation,
      direction,
      category,
      rank: crypto.rank || 0,
      dataPoints: sortedData.length,
      comparisons: periodStats.totalComparisons,
      averageMarketCap: periodStats.mean,
      minMarketCap: Math.min(...marketCaps),
      maxMarketCap: Math.max(...marketCaps),
      marketCapChange
    };
    
    results.push(result);
    
    // 存储到数据库
    try {
      await storage.createVolatilityAnalysisEntry({
        batchId: batch.id,
        cryptocurrencyId: crypto.id,
        name: crypto.name,
        symbol: crypto.symbol,
        currentVolumeRatio: null,
        previousVolumeRatio: null,
        volatilityScore: Math.min(avgVolatility * 2, 100), // 转换为0-100分数
        volatilityPercentage: avgVolatility,
        volatilityDirection: direction,
        volatilityRank: 0, // 将在排序后更新
        priceChange24h: marketCapChange,
        volumeChange24h: null,
        marketCapChange24h: marketCapChange,
        volatilityCategory: category,
        riskLevel: avgVolatility >= 20 ? '高风险' : avgVolatility >= 10 ? '中风险' : '低风险'
      });
    } catch (error) {
      console.log(`存储${symbol}波动性分析结果失败:`, error instanceof Error ? error.message : String(error));
    }
  }
  
  // 按波动性排序并更新排名
  results.sort((a, b) => b.volatilityPercentage - a.volatilityPercentage);
  
  for (let i = 0; i < results.length; i++) {
    results[i].rank = i + 1;
    // 更新数据库中的排名
    try {
      const crypto = await storage.getCryptocurrencyBySymbol(results[i].symbol);
      if (crypto) {
        const entries = await storage.getVolatilityAnalysisEntriesByBatchId(batch.id);
        const entry = entries.find(e => e.cryptocurrencyId === crypto.id);
        if (entry) {
          // 这里需要更新排名，但storage接口可能需要扩展
          console.log(`${results[i].symbol} 波动性排名: ${i + 1}`);
        }
      }
    } catch (error) {
      console.log(`更新${results[i].symbol}排名失败:`, error instanceof Error ? error.message : String(error));
    }
  }
  
  // 统计各类别分布
  const categoryDistribution = results.reduce((acc, result) => {
    acc[result.category] = (acc[result.category] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  
  console.log(`${period}波动性分析完成，共分析${results.length}个加密货币`);
  console.log('各类别分布：', categoryDistribution);
  
  return batch.id;
}

/**
 * 从数据库获取最新的波动性分析结果
 */
export async function getLatestVolatilityAnalysis(period: '7d' | '30d' = '7d'): Promise<VolatilityResult[]> {
  try {
    // 获取最新的分析批次
    const latestBatch = await storage.getLatestVolatilityAnalysisBatch(period);
    if (!latestBatch) {
      console.log('没有找到最新的波动性分析批次，开始计算...');
      const newBatchId = await calculateAndStoreVolatilityAnalysis(period);
      const newBatch = await storage.getVolatilityAnalysisBatch(newBatchId);
      if (!newBatch) return [];
      return await getVolatilityAnalysisResults(newBatch.id);
    }
    
    // 检查批次是否过期（超过1小时重新计算）
    const batchAge = Date.now() - (latestBatch.createdAt?.getTime() || 0);
    const oneHour = 60 * 60 * 1000;
    
    if (batchAge > oneHour) {
      console.log('波动性分析结果已过期，重新计算...');
      const newBatchId = await calculateAndStoreVolatilityAnalysis(period);
      return await getVolatilityAnalysisResults(newBatchId);
    }
    
    return await getVolatilityAnalysisResults(latestBatch.id);
  } catch (error) {
    console.log('获取波动性分析结果失败，重新计算:', error instanceof Error ? error.message : String(error));
    const newBatchId = await calculateAndStoreVolatilityAnalysis(period);
    return await getVolatilityAnalysisResults(newBatchId);
  }
}

/**
 * 从数据库获取特定批次的波动性分析结果
 */
async function getVolatilityAnalysisResults(batchId: number): Promise<VolatilityResult[]> {
  const entries = await storage.getVolatilityAnalysisEntriesByBatchId(batchId);
  
  const results: VolatilityResult[] = entries.map((entry, index) => ({
    symbol: entry.symbol,
    name: entry.name,
    period: '7d', // 从数据库获取
    volatilityPercentage: entry.volatilityPercentage || 0,
    standardDeviation: 0, // 需要从计算结果获取
    direction: (entry.volatilityDirection as 'up' | 'down' | 'stable') || 'stable',
    category: entry.volatilityCategory || '低',
    rank: entry.volatilityRank || index + 1,
    dataPoints: 0, // 需要从计算结果获取
    comparisons: 0, // 需要从计算结果获取
    averageMarketCap: 0, // 需要从计算结果获取
    minMarketCap: 0,
    maxMarketCap: 0,
    marketCapChange: entry.marketCapChange24h || 0
  }));
  
  // 按波动性排序
  results.sort((a, b) => b.volatilityPercentage - a.volatilityPercentage);
  
  return results;
}