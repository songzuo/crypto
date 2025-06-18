/**
 * Working Volatility Analysis V2
 * Simple, direct implementation that works with the existing database structure
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

export async function runWorkingVolatilityAnalysisV2(period: '7d' | '30d' = '7d') {
  console.log(`开始波动率分析V2，周期: ${period}`);
  
  try {
    // Get the latest batches
    const batchesResponse = await storage.getVolumeToMarketCapBatches(1, period === '7d' ? 8 : 50, 'desc');
    const batches = batchesResponse.data.reverse(); // Oldest first
    
    console.log(`获取到 ${batches.length} 个批次`);
    
    if (batches.length < 2) {
      throw new Error(`需要至少2个批次，当前只有 ${batches.length} 个`);
    }

    // Get all cryptocurrencies (limit to 50 for testing)
    const cryptosResponse = await storage.getCryptocurrencies(1, 50);
    const cryptos = cryptosResponse.data;
    
    console.log(`获取到 ${cryptos.length} 个加密货币`);
    
    const results: VolatilityResult[] = [];
    
    // Process each cryptocurrency
    for (const crypto of cryptos) {
      try {
        const marketCapHistory: { marketCap: number; timestamp: Date }[] = [];
        
        // Get market cap data for this crypto across all batches
        for (const batch of batches) {
          const ratiosResponse = await storage.getVolumeToMarketCapRatios(batch.id, 2000);
          const cryptoData = ratiosResponse.data.find(r => 
            r.symbol === crypto.symbol || r.cryptocurrencyId === crypto.id
          );
          
          if (cryptoData && cryptoData.marketCap && cryptoData.marketCap > 0) {
            marketCapHistory.push({
              marketCap: cryptoData.marketCap,
              timestamp: cryptoData.timestamp || batch.createdAt || new Date()
            });
          }
        }
        
        if (marketCapHistory.length >= 2) {
          // Sort by timestamp (oldest first)
          marketCapHistory.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
          
          // Calculate volatility
          const volatility = calculateVolatility(marketCapHistory, period);
          const direction = calculateDirection(marketCapHistory);
          const category = getCategory(volatility);
          
          results.push({
            symbol: crypto.symbol,
            name: crypto.name,
            cryptocurrencyId: crypto.id,
            volatilityPercentage: volatility,
            volatilityDirection: direction,
            volatilityCategory: category,
            rank: 0, // Will be set after sorting
            currentMarketCap: marketCapHistory[marketCapHistory.length - 1].marketCap,
            previousMarketCap: marketCapHistory[0].marketCap
          });
        }
      } catch (error) {
        console.error(`处理 ${crypto.symbol} 时出错:`, error);
      }
    }
    
    console.log(`计算出 ${results.length} 个有效结果`);
    
    // Sort by volatility (highest first) and assign ranks
    results.sort((a, b) => b.volatilityPercentage - a.volatilityPercentage);
    results.forEach((result, index) => {
      result.rank = index + 1;
    });
    
    // Save to database
    const batchData = {
      timeframe: period,
      totalAnalyzed: results.length,
      analysisType: 'market_cap_volatility_v2',
      hasChanges: results.length > 0
    };
    
    const analysisBatch = await storage.createVolatilityAnalysisBatch(batchData);
    
    // Save entries
    for (const result of results) {
      const entryData = {
        batchId: analysisBatch.id,
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
    
    console.log(`保存了 ${results.length} 个波动率分析结果到批次 ${analysisBatch.id}`);
    
    return {
      success: true,
      message: `成功分析了 ${results.length} 个加密货币的${period === '7d' ? '7天' : '30天'}波动率`,
      batchId: analysisBatch.id,
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

function calculateVolatility(history: { marketCap: number }[], period: '7d' | '30d'): number {
  if (history.length < 2) return 0;
  
  const changes: number[] = [];
  
  // Calculate percentage changes between consecutive data points
  for (let i = 1; i < history.length; i++) {
    const previous = history[i - 1].marketCap;
    const current = history[i].marketCap;
    
    if (previous > 0) {
      const change = Math.abs((current - previous) / previous) * 100;
      changes.push(change);
    }
  }
  
  if (changes.length === 0) return 0;
  
  // For 7d, use only the last 7 changes if we have more
  const changesToUse = period === '7d' && changes.length > 7 
    ? changes.slice(-7) 
    : changes;
  
  const avgChange = changesToUse.reduce((sum, change) => sum + change, 0) / changesToUse.length;
  return Math.round(avgChange * 100) / 100;
}

function calculateDirection(history: { marketCap: number }[]): 'up' | 'down' | 'stable' {
  if (history.length < 2) return 'stable';
  
  const first = history[0].marketCap;
  const last = history[history.length - 1].marketCap;
  
  const change = (last - first) / first;
  
  if (change > 0.05) return 'up';
  if (change < -0.05) return 'down';
  return 'stable';
}

function getCategory(volatility: number): string {
  if (volatility < 5) return 'low-risk';
  if (volatility < 15) return 'medium-risk';
  return 'high-risk';
}