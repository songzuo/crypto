import { storage } from '../storage';
import { InsertVolatilityAnalysisBatch, InsertVolatilityAnalysisEntry } from '@shared/schema';

interface VolatilityResult {
  symbol: string;
  name: string;
  cryptocurrencyId: number;
  volatilityPercentage: number;
  volatilityDirection: 'up' | 'down' | 'stable';
  volatilityCategory: string;
  rank: number;
  currentVolumeRatio?: number | null;
  previousVolumeRatio?: number | null;
}

/**
 * Calculate volatility based on price changes and market cap data
 */
export async function runWorkingVolatilityAnalysis(period: '7d' | '30d' = '7d'): Promise<{ success: boolean; message: string; batchId?: number }> {
  try {
    console.log(`开始执行${period}波动性分析...`);
    
    // Get all cryptocurrencies with market data
    const cryptos = await storage.getCryptocurrencies(1, 2000, 'marketCap', 'desc');
    const validCryptos = cryptos.data.filter(crypto => 
      crypto.marketCap && crypto.marketCap > 0 && crypto.price && crypto.price > 0
    );
    
    console.log(`找到 ${validCryptos.length} 个有效加密货币进行分析`);
    
    if (validCryptos.length === 0) {
      return { success: false, message: '没有找到有效的加密货币数据' };
    }
    
    // Create batch record
    const batchData: InsertVolatilityAnalysisBatch = {
      timeframe: period,
      totalAnalyzed: validCryptos.length,
      createdAt: new Date(),
      status: 'processing'
    };
    
    const batch = await storage.createVolatilityAnalysisBatch(batchData);
    console.log(`创建批次记录，ID: ${batch.id}`);
    
    // Get the latest two volume ratio batches for comparison
    const latestBatches = await storage.getVolumeToMarketCapBatches(1, 2);
    if (latestBatches.data.length < 2) {
      throw new Error('需要至少两个交易量市值比率批次来计算波动性');
    }
    
    const [currentBatch, previousBatch] = latestBatches.data;
    console.log(`使用批次 #${currentBatch.id} 和 #${previousBatch.id} 进行波动性计算`);
    
    // Get volume ratios for both batches
    const currentRatios = await storage.getVolumeToMarketCapRatiosByBatchId(currentBatch.id);
    const previousRatios = await storage.getVolumeToMarketCapRatiosByBatchId(previousBatch.id);
    
    // Create maps for efficient lookup
    const currentRatioMap = new Map(currentRatios.map(r => [r.cryptocurrencyId, r]));
    const previousRatioMap = new Map(previousRatios.map(r => [r.cryptocurrencyId, r]));
    
    console.log(`当前批次有 ${currentRatios.length} 个比率，之前批次有 ${previousRatios.length} 个比率`);
    
    // Calculate volatility for each cryptocurrency
    const results: VolatilityResult[] = [];
    
    for (const crypto of validCryptos) {
      try {
        const currentRatio = currentRatioMap.get(crypto.id);
        const previousRatio = previousRatioMap.get(crypto.id);
        
        let volatilityPercentage = 0;
        let direction: 'up' | 'down' | 'stable' = 'stable';
        
        if (currentRatio && previousRatio && currentRatio.volumeToMarketCapRatio && previousRatio.volumeToMarketCapRatio) {
          // Calculate volatility based on ratio change
          const ratioChange = currentRatio.volumeToMarketCapRatio - previousRatio.volumeToMarketCapRatio;
          const relativeChange = Math.abs(ratioChange / previousRatio.volumeToMarketCapRatio) * 100;
          
          // Time-based normalization (as specified in user requirements)
          const timeDiffHours = (currentRatio.timestamp.getTime() - previousRatio.timestamp.getTime()) / (1000 * 60 * 60);
          const normalizedVolatility = timeDiffHours > 0 ? (relativeChange / timeDiffHours) * 24 : relativeChange;
          
          volatilityPercentage = Math.min(normalizedVolatility, 100); // Cap at 100%
          
          // Determine direction based on ratio change
          if (ratioChange > 0.001) {
            direction = 'up';
          } else if (ratioChange < -0.001) {
            direction = 'down';
          }
        } else if (crypto.priceChange24h !== null && crypto.priceChange24h !== undefined) {
          // Fallback to price change if ratio data is missing
          volatilityPercentage = Math.abs(crypto.priceChange24h);
          
          if (crypto.priceChange24h > 0.1) {
            direction = 'up';
          } else if (crypto.priceChange24h < -0.1) {
            direction = 'down';
          }
        } else {
          // Skip cryptocurrencies without sufficient data
          console.log(`跳过 ${crypto.symbol}: 缺少比率数据和价格变化数据`);
          continue;
        }
        
        // Categorize volatility based on calculated percentage
        let category = 'Low';
        if (volatilityPercentage > 15) category = 'High';
        else if (volatilityPercentage > 5) category = 'Medium';
        
        results.push({
          symbol: crypto.symbol,
          name: crypto.name,
          cryptocurrencyId: crypto.id,
          volatilityPercentage,
          volatilityDirection: direction,
          volatilityCategory: category,
          rank: 0, // Will be set after sorting
          currentVolumeRatio: currentRatio?.volumeToMarketCapRatio || null,
          previousVolumeRatio: previousRatio?.volumeToMarketCapRatio || null
        });
        
      } catch (error) {
        console.error(`处理加密货币 ${crypto.symbol} 时出错:`, error);
      }
    }
    
    // Sort by volatility percentage (descending) and assign ranks
    results.sort((a, b) => b.volatilityPercentage - a.volatilityPercentage);
    results.forEach((result, index) => {
      result.rank = index + 1;
    });
    
    console.log(`计算完成，准备保存 ${results.length} 条记录到数据库`);
    
    // Save results to database
    let savedCount = 0;
    for (const result of results) {
      try {
        const entryData: InsertVolatilityAnalysisEntry = {
          batchId: batch.id,
          cryptocurrencyId: result.cryptocurrencyId,
          symbol: result.symbol,
          name: result.name,
          volatilityPercentage: result.volatilityPercentage,
          volatilityDirection: result.volatilityDirection,
          volatilityCategory: result.volatilityCategory,
          volatilityRank: result.rank,
          currentVolumeRatio: result.currentVolumeRatio || 0,
          previousVolumeRatio: result.previousVolumeRatio || 0,
          volatilityScore: result.volatilityPercentage,
          analysisTime: new Date()
        };
        
        await storage.createVolatilityAnalysisEntry(entryData);
        savedCount++;
        
      } catch (error) {
        console.error(`保存结果 ${result.symbol} 时出错:`, error);
      }
    }
    
    // Update batch status
    await storage.updateVolatilityAnalysisBatch(batch.id, {
      status: 'completed',
      totalAnalyzed: savedCount
    });
    
    console.log(`波动性分析完成，成功保存 ${savedCount} 条记录`);
    
    return {
      success: true,
      message: `波动性分析完成，共分析 ${savedCount} 个币种`,
      batchId: batch.id
    };
    
  } catch (error) {
    console.error('波动性分析执行失败:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : '执行失败'
    };
  }
}