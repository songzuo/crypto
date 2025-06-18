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
    
    for (const crypto of cryptos.data) {
      try {
        // 收集该加密货币在各批次的市值数据
        const marketCapData: { batchId: number, marketCap: number, timestamp: Date }[] = [];
        
        for (const batch of latestBatches.data) {
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
            // 忽略单个批次的错误，继续其他批次
          }
        }

        if (marketCapData.length < 2) {
          // 数据不足，跳过此币种
          continue;
        }

        // 按时间排序（最新在前）
        marketCapData.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

        // 计算7天波动率：最新7个变化率的平均值
        let volatilityPercentage = 0;
        const dataPointsToUse = Math.min(8, marketCapData.length); // 最多使用8个数据点计算7个变化率
        
        if (dataPointsToUse >= 2) {
          const changes: number[] = [];
          for (let i = 0; i < dataPointsToUse - 1; i++) {
            const current = marketCapData[i].marketCap;
            const previous = marketCapData[i + 1].marketCap;
            const changePercent = Math.abs((current - previous) / previous) * 100;
            changes.push(changePercent);
          }
          volatilityPercentage = changes.reduce((sum, change) => sum + change, 0) / changes.length;
        }

        // 确定方向（基于最新vs最旧的市值变化）
        let direction: 'up' | 'down' | 'stable' = 'stable';
        const current = marketCapData[0].marketCap;
        const oldest = marketCapData[marketCapData.length - 1].marketCap;
        const overallChange = (current - oldest) / oldest;

        if (overallChange > 0.001) direction = 'up';      
        else if (overallChange < -0.001) direction = 'down';   
        else direction = 'stable';
        
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