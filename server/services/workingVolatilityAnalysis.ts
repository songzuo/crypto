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
  currentMarketCap?: number | null;
  previousMarketCap?: number | null;
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
    
    // Get current cryptocurrency market cap data and compare with historical data
    const currentCryptos = await storage.getCryptocurrencies(1, 2000, 'marketCap', 'desc');
    const currentCryptoMap = new Map(currentCryptos.data.map(c => [c.id, c]));
    
    console.log(`获取到 ${currentCryptos.data.length} 个当前加密货币的市值数据`);
    
    // Calculate volatility for each cryptocurrency
    const results: VolatilityResult[] = [];
    
    for (const crypto of validCryptos) {
      try {
        let volatilityPercentage = 0;
        let direction: 'up' | 'down' | 'stable' = 'stable';
        let currentMarketCap = crypto.marketCap;
        let previousMarketCap: number | null = null;
        
        // Calculate market cap volatility using price change as proxy for market cap change
        // Since market cap = price × circulating supply, price change reflects market cap change
        if (crypto.priceChange24h !== null && crypto.priceChange24h !== undefined && currentMarketCap) {
          // Calculate previous market cap based on price change
          const priceChangeDecimal = crypto.priceChange24h / 100;
          const currentPrice = crypto.price || 0;
          const previousPrice = currentPrice / (1 + priceChangeDecimal);
          
          if (currentPrice > 0) {
            // Estimate circulating supply from current data
            const estimatedSupply = currentMarketCap / currentPrice;
            previousMarketCap = previousPrice * estimatedSupply;
            
            // Calculate market cap volatility
            const marketCapChange = currentMarketCap - previousMarketCap;
            const marketCapChangePercent = Math.abs(marketCapChange / previousMarketCap) * 100;
            
            // Time-based normalization (24-hour period already normalized)
            volatilityPercentage = Math.min(marketCapChangePercent, 100);
            
            // Determine direction based on market cap change
            if (marketCapChange > 0) {
              direction = 'up';
            } else if (marketCapChange < 0) {
              direction = 'down';
            }
          } else {
            // Fallback to absolute price change percentage
            volatilityPercentage = Math.abs(crypto.priceChange24h);
            
            if (crypto.priceChange24h > 0.1) {
              direction = 'up';
            } else if (crypto.priceChange24h < -0.1) {
              direction = 'down';
            }
          }
        } else {
          // Skip cryptocurrencies without sufficient market data
          console.log(`跳过 ${crypto.symbol}: 缺少市值或价格变化数据`);
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
          currentMarketCap: currentMarketCap,
          previousMarketCap: previousMarketCap
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
          marketCapChange24h: result.currentMarketCap && result.previousMarketCap ? 
            ((result.currentMarketCap - result.previousMarketCap) / result.previousMarketCap) * 100 : null,
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