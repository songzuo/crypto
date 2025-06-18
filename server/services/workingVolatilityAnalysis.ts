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
    
    // Calculate volatility for each cryptocurrency
    const results: VolatilityResult[] = [];
    
    for (const crypto of validCryptos) {
      try {
        // Use price change 24h as a proxy for volatility
        let volatilityPercentage = Math.abs(crypto.priceChange24h || 0);
        
        // If no price change data, use a calculated volatility based on market cap fluctuation
        if (!crypto.priceChange24h && crypto.marketCap && crypto.price) {
          // Estimate volatility based on market cap and price relationship
          const marketCapVolatility = (crypto.marketCap / (crypto.price * 1000000)) * 0.1;
          volatilityPercentage = Math.min(marketCapVolatility, 50); // Cap at 50%
        }
        
        // Determine direction
        let direction: 'up' | 'down' | 'stable' = 'stable';
        if (crypto.priceChange24h && crypto.priceChange24h > 0.1) {
          direction = 'up';
        } else if (crypto.priceChange24h && crypto.priceChange24h < -0.1) {
          direction = 'down';
        }
        
        // Categorize volatility
        let category = 'Low';
        if (volatilityPercentage > 10) category = 'High';
        else if (volatilityPercentage > 5) category = 'Medium';
        
        results.push({
          symbol: crypto.symbol,
          name: crypto.name,
          cryptocurrencyId: crypto.id,
          volatilityPercentage,
          volatilityDirection: direction,
          volatilityCategory: category,
          rank: 0 // Will be set after sorting
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