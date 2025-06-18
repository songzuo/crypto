/**
 * 改进的波动率分析服务
 * 1. 使用最新的148个批次数据而不是固定的143个
 * 2. 7天分析使用最新8次数据点（7个波动率）
 * 3. 30天分析使用全部批次数据的平均值
 */

import { storage } from '../storage';

interface VolatilityResult {
  symbol: string;
  name: string;
  cryptocurrencyId: number;
  volatilityPercentage: number;
  volatilityDirection: 'up' | 'down' | 'stable';
  volatilityCategory: string;
  rank: number;
  currentMarketCap?: number;
  previousMarketCap?: number;
}

/**
 * 运行改进的波动率分析
 * @param period '7d' 或 '30d'
 */
export async function runImprovedVolatilityAnalysis(period: '7d' | '30d' = '7d') {
  console.log(`开始改进的波动率分析，周期: ${period}`);
  
  try {
    // 创建新的分析批次
    const batch = await storage.createVolatilityAnalysisBatch({
      timeframe: period,
      analysisType: 'market_cap_change',
      totalAnalyzed: 0
    });

    console.log(`创建分析批次 #${batch.id}`);

    // 获取最新的批次数据用于计算
    const latestBatches = await getLatestBatches(period);
    console.log(`获取到 ${latestBatches.length} 个批次用于分析`);

    if (latestBatches.length === 0) {
      throw new Error('没有足够的历史数据进行波动率分析');
    }

    // 分析每个加密货币的波动率
    const results = await calculateVolatilityForPeriod(latestBatches, period);
    
    // 按波动率排序并添加排名
    results.sort((a, b) => b.volatilityPercentage - a.volatilityPercentage);
    results.forEach((result, index) => {
      result.rank = index + 1;
    });

    // 保存结果
    let savedCount = 0;
    for (const result of results) {
      try {
        const entryData = {
          batchId: batch.id,
          cryptocurrencyId: result.cryptocurrencyId,
          symbol: result.symbol,
          name: result.name,
          volatilityPercentage: result.volatilityPercentage,
          volatilityDirection: result.volatilityDirection,
          volatilityCategory: result.volatilityCategory,
          volatilityRank: result.rank,
          marketCapChange24h: result.currentMarketCap && result.previousMarketCap ? 
            ((result.currentMarketCap - result.previousMarketCap) / result.previousMarketCap) * 100 : null,
          volatilityScore: result.volatilityPercentage
        };
        
        await storage.createVolatilityAnalysisEntry(entryData);
        savedCount++;
        
      } catch (error) {
        console.error(`保存结果 ${result.symbol} 时出错:`, error);
      }
    }
    
    // 更新批次状态
    await storage.updateVolatilityAnalysisBatch(batch.id, {
      totalAnalyzed: savedCount
    });
    
    console.log(`波动性分析完成，成功保存 ${savedCount} 条记录`);
    
    return {
      success: true,
      batchId: batch.id,
      totalAnalyzed: savedCount,
      period,
      results: results.slice(0, 10) // 返回前10个结果预览
    };

  } catch (error) {
    console.error('波动率分析失败:', error);
    throw error;
  }
}

/**
 * 获取最新的批次数据
 */
async function getLatestBatches(period: '7d' | '30d') {
  if (period === '7d') {
    // 7天分析：获取最新8个批次（用于计算7个波动率数据点）
    const batches = await storage.getVolumeToMarketCapBatches(1, 8);
    return batches.data;
  } else {
    // 30天分析：获取所有可用批次
    const batches = await storage.getVolumeToMarketCapBatches(1, 200); // 假设最多200个批次
    return batches.data;
  }
}

/**
 * 计算指定周期的波动率
 */
async function calculateVolatilityForPeriod(batches: any[], period: '7d' | '30d'): Promise<VolatilityResult[]> {
  const results: VolatilityResult[] = [];
  
  if (batches.length < 2) {
    throw new Error('需要至少2个批次数据来计算波动率');
  }

  // 获取所有加密货币
  const allCryptos = await storage.getCryptocurrencies(1, 2000);
  
  for (const crypto of allCryptos.data) {
    try {
      const volatility = await calculateCryptoVolatility(crypto, batches, period);
      if (volatility) {
        results.push(volatility);
      }
    } catch (error) {
      console.error(`计算 ${crypto.symbol} 波动率失败:`, error);
    }
  }

  return results;
}

/**
 * 计算单个加密货币的波动率
 */
async function calculateCryptoVolatility(
  crypto: any, 
  batches: any[], 
  period: '7d' | '30d'
): Promise<VolatilityResult | null> {
  
  // 收集该加密货币在各批次的市值数据
  const marketCapData: { batchId: number, marketCap: number, timestamp: Date }[] = [];
  
  for (const batch of batches) {
    try {
      const batchEntries = await storage.getVolumeToMarketCapRatios(batch.id, 1, 1000);
      const cryptoEntry = batchEntries.data.find(entry => 
        entry.symbol === crypto.symbol || entry.cryptocurrencyId === crypto.id
      );
      
      if (cryptoEntry && cryptoEntry.marketCap && cryptoEntry.marketCap > 0) {
        marketCapData.push({
          batchId: batch.id,
          marketCap: cryptoEntry.marketCap,
          timestamp: batch.createdAt || new Date()
        });
      }
    } catch (error) {
      console.error(`获取批次 ${batch.id} 中 ${crypto.symbol} 数据失败:`, error);
    }
  }

  if (marketCapData.length < 2) {
    return null; // 数据不足
  }

  // 按时间排序（最新在前）
  marketCapData.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  let volatilityPercentage: number;

  if (period === '7d') {
    // 7天模式：计算最新7个变化率的平均值
    volatilityPercentage = calculate7DayVolatility(marketCapData);
  } else {
    // 30天模式：计算所有数据点的平均波动率
    volatilityPercentage = calculate30DayVolatility(marketCapData);
  }

  // 确定方向
  const direction = determineDirection(marketCapData);
  
  // 分类波动率等级
  let category = 'Low';
  if (volatilityPercentage > 15) category = 'High';
  else if (volatilityPercentage > 5) category = 'Medium';

  return {
    symbol: crypto.symbol,
    name: crypto.name,
    cryptocurrencyId: crypto.id,
    volatilityPercentage,
    volatilityDirection: direction,
    volatilityCategory: category,
    rank: 0, // 将在外部设置
    currentMarketCap: marketCapData[0]?.marketCap,
    previousMarketCap: marketCapData[1]?.marketCap
  };
}

/**
 * 计算7天波动率：最新8个数据点的7个变化率平均值
 */
function calculate7DayVolatility(marketCapData: { marketCap: number }[]): number {
  if (marketCapData.length < 8) {
    // 如果数据不足8个点，使用所有可用数据
    return calculateAllAvailableVolatility(marketCapData);
  }

  // 取最新8个数据点
  const recent8Points = marketCapData.slice(0, 8);
  
  // 计算7个连续变化率
  const changes: number[] = [];
  for (let i = 0; i < recent8Points.length - 1; i++) {
    const current = recent8Points[i].marketCap;
    const previous = recent8Points[i + 1].marketCap;
    const changePercent = Math.abs((current - previous) / previous) * 100;
    changes.push(changePercent);
  }

  // 返回平均变化率
  return changes.reduce((sum, change) => sum + change, 0) / changes.length;
}

/**
 * 计算30天波动率：所有数据点的平均波动率
 */
function calculate30DayVolatility(marketCapData: { marketCap: number }[]): number {
  return calculateAllAvailableVolatility(marketCapData);
}

/**
 * 计算所有可用数据的平均波动率
 */
function calculateAllAvailableVolatility(marketCapData: { marketCap: number }[]): number {
  if (marketCapData.length < 2) {
    return 0;
  }

  const changes: number[] = [];
  for (let i = 0; i < marketCapData.length - 1; i++) {
    const current = marketCapData[i].marketCap;
    const previous = marketCapData[i + 1].marketCap;
    const changePercent = Math.abs((current - previous) / previous) * 100;
    changes.push(changePercent);
  }

  return changes.reduce((sum, change) => sum + change, 0) / changes.length;
}

/**
 * 确定波动方向
 */
function determineDirection(marketCapData: { marketCap: number }[]): 'up' | 'down' | 'stable' {
  if (marketCapData.length < 2) {
    return 'stable';
  }

  const current = marketCapData[0].marketCap;
  const previous = marketCapData[1].marketCap;
  const change = (current - previous) / previous;

  if (change > 0.001) return 'up';      // 上涨超过0.1%
  if (change < -0.001) return 'down';   // 下跌超过0.1%
  return 'stable';
}