/**
 * 修复的波动率分析服务
 * 使用最新的148个批次数据，正确计算市值波动率
 */

import { DatabaseStorage } from '../storage';

const storage = new DatabaseStorage();

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
 * 运行修复的波动率分析
 */
export async function runFixedVolatilityAnalysis(period: '7d' | '30d' = '7d') {
  console.log(`开始修复的波动率分析，周期: ${period}`);
  
  try {
    // 获取最新的批次数据
    const batches = await getLatestBatches(period);
    console.log(`获取到 ${batches.length} 个批次用于分析`);
    
    if (batches.length < 2) {
      throw new Error(`需要至少2个批次数据来计算波动率，当前只有 ${batches.length} 个批次`);
    }

    // 计算波动率
    const results = await calculateVolatilityForPeriod(batches, period);
    console.log(`成功计算了 ${results.length} 个加密货币的波动率`);
    
    // 保存结果到数据库
    const batchData = {
      timeframe: period,
      totalAnalyzed: results.length,
      analysisType: '修复版市值波动率分析',
      hasChanges: results.length > 0
    };
    
    const batch = await storage.createVolatilityAnalysisBatch(batchData);
    
    // 保存每个结果
    for (const result of results) {
      const entryData = {
        batchId: batch.id,
        symbol: result.symbol,
        name: result.name,
        cryptocurrencyId: result.cryptocurrencyId,
        volatilityPercentage: result.volatilityPercentage,
        volatilityDirection: result.volatilityDirection,
        volatilityCategory: result.volatilityCategory,
        rank: result.rank,
        currentMarketCap: result.currentMarketCap || null,
        previousMarketCap: result.previousMarketCap || null
      };
      
      await storage.createVolatilityAnalysisEntry(entryData);
    }
    
    console.log(`波动率分析完成，批次ID: ${batch.id}`);
    return {
      success: true,
      message: `成功分析了 ${results.length} 个加密货币的${period === '7d' ? '7天' : '30天'}波动率`,
      batchId: batch.id,
      totalAnalyzed: results.length
    };
    
  } catch (error) {
    console.error('波动率分析失败:', error);
    return {
      success: false,
      message: `波动率分析失败: ${error instanceof Error ? error.message : '未知错误'}`,
      totalAnalyzed: 0
    };
  }
}

/**
 * 获取最新的批次数据
 */
async function getLatestBatches(period: '7d' | '30d') {
  if (period === '7d') {
    // 7天分析：获取最新8个批次（用于计算7个变化率）
    const batches = await storage.getVolumeToMarketCapRatioBatches(1, 8, 'desc');
    return batches.data.reverse(); // 按时间顺序排列
  } else {
    // 30天分析：获取所有可用批次（最新148个）
    const batches = await storage.getVolumeToMarketCapRatioBatches(1, 200, 'desc');
    return batches.data.reverse(); // 按时间顺序排列
  }
}

/**
 * 计算指定周期的波动率
 */
async function calculateVolatilityForPeriod(batches: any[], period: '7d' | '30d'): Promise<VolatilityResult[]> {
  const results: VolatilityResult[] = [];
  
  // 获取所有加密货币
  const allCryptos = await storage.getCryptocurrencies(1, 2000);
  if (!allCryptos.data || allCryptos.data.length === 0) {
    throw new Error('没有找到加密货币数据');
  }
  
  console.log(`开始计算 ${allCryptos.data.length} 个加密货币的波动率`);
  
  // 只处理前500个加密货币以避免超时
  const cryptosToProcess = allCryptos.data.slice(0, 500);
  
  for (const crypto of cryptosToProcess) {
    try {
      const volatilityData = await calculateCryptoVolatility(crypto, batches, period);
      if (volatilityData) {
        results.push(volatilityData);
      }
    } catch (error) {
      console.error(`计算 ${crypto.symbol} 的波动率时出错:`, error);
    }
  }
  
  // 按波动率排序并添加排名
  results.sort((a, b) => b.volatilityPercentage - a.volatilityPercentage);
  results.forEach((result, index) => {
    result.rank = index + 1;
  });
  
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
      const batchEntries = await storage.getVolumeToMarketCapRatios(batch.id, 2000);
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
  
  // 确定风险类别
  const category = getVolatilityCategory(volatilityPercentage);

  return {
    symbol: crypto.symbol,
    name: crypto.name,
    cryptocurrencyId: crypto.id,
    volatilityPercentage,
    volatilityDirection: direction,
    volatilityCategory: category,
    rank: 0, // 将在外部设置
    currentMarketCap: marketCapData[0]?.marketCap,
    previousMarketCap: marketCapData[marketCapData.length - 1]?.marketCap
  };
}

/**
 * 计算7天波动率：最新8个数据点的7个变化率平均值
 */
function calculate7DayVolatility(marketCapData: { marketCap: number }[]): number {
  if (marketCapData.length < 2) return 0;
  
  const dataToUse = marketCapData.slice(0, 8); // 最新8个数据点
  if (dataToUse.length < 2) return 0;
  
  const changes: number[] = [];
  for (let i = 0; i < dataToUse.length - 1; i++) {
    const current = dataToUse[i].marketCap;
    const previous = dataToUse[i + 1].marketCap;
    
    if (previous > 0) {
      const change = Math.abs((current - previous) / previous) * 100;
      changes.push(change);
    }
  }
  
  if (changes.length === 0) return 0;
  
  const avgChange = changes.reduce((sum, change) => sum + change, 0) / changes.length;
  return Math.round(avgChange * 100) / 100;
}

/**
 * 计算30天波动率：所有数据点的平均波动率
 */
function calculate30DayVolatility(marketCapData: { marketCap: number }[]): number {
  if (marketCapData.length < 2) return 0;
  
  const changes: number[] = [];
  for (let i = 0; i < marketCapData.length - 1; i++) {
    const current = marketCapData[i].marketCap;
    const previous = marketCapData[i + 1].marketCap;
    
    if (previous > 0) {
      const change = Math.abs((current - previous) / previous) * 100;
      changes.push(change);
    }
  }
  
  if (changes.length === 0) return 0;
  
  const avgChange = changes.reduce((sum, change) => sum + change, 0) / changes.length;
  return Math.round(avgChange * 100) / 100;
}

/**
 * 确定波动方向
 */
function determineDirection(marketCapData: { marketCap: number }[]): 'up' | 'down' | 'stable' {
  if (marketCapData.length < 2) return 'stable';
  
  const current = marketCapData[0].marketCap;
  const previous = marketCapData[marketCapData.length - 1].marketCap;
  
  const change = (current - previous) / previous;
  
  if (change > 0.05) return 'up';
  if (change < -0.05) return 'down';
  return 'stable';
}

/**
 * 获取波动率类别
 */
function getVolatilityCategory(volatility: number): string {
  if (volatility < 5) return 'low-risk';
  if (volatility < 15) return 'medium-risk';
  return 'high-risk';
}