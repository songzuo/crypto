/**
 * 简化版波动性分析服务
 * 直接计算并保存波动性数据到数据库
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
}

/**
 * 执行简化版波动性分析
 */
export async function runSimplifiedVolatilityAnalysis(period: '7d' | '30d' = '7d'): Promise<{ success: boolean; message: string; batchId?: number }> {
  try {
    console.log(`开始运行简化版波动性分析...`);
    
    // 获取最新的两个批次用于比较
    const allBatches = await storage.getVolumeToMarketCapBatches(1, 200);
    console.log(`当前批次数据: ${allBatches.data.length} 条`);
    
    if (allBatches.data.length < 2) {
      return { success: false, message: '历史数据不足，至少需要2个批次' };
    }
    
    const currentBatch = allBatches.data[0];
    const previousBatch = allBatches.data[1];
    
    // 获取当前和前一批次的数据
    const currentData = await storage.getVolumeToMarketCapResults(currentBatch.id);
    const previousData = await storage.getVolumeToMarketCapResults(previousBatch.id);
    
    console.log(`当前批次数据: ${currentData.length} 条, 前一批次数据: ${previousData.length} 条`);
    
    // 过滤有效数据
    const validCurrentData = currentData.filter(d => d.marketCap && d.marketCap > 0);
    const validPreviousData = previousData.filter(d => d.marketCap && d.marketCap > 0);
    
    console.log(`有效数据 - 当前: ${validCurrentData.length} 条, 前一批次: ${validPreviousData.length} 条`);
    
    // 创建前一批次数据的映射
    const previousDataMap = new Map();
    validPreviousData.forEach(item => {
      if (item.cryptocurrencyId) {
        previousDataMap.set(item.cryptocurrencyId, item);
      }
    });
    
    // 创建波动性分析批次
    const volatilityBatch = await storage.createVolatilityAnalysisBatch({
      timeframe: period,
      totalAnalyzed: 0,
      analysisType: 'market_cap_volatility'
    });
    
    const results: VolatilityResult[] = [];
    
    // 分析每个加密货币的波动性
    for (const currentItem of validCurrentData) {
      if (!currentItem.cryptocurrencyId || !currentItem.marketCap) continue;
      
      const previousItem = previousDataMap.get(currentItem.cryptocurrencyId);
      if (!previousItem || !previousItem.marketCap) continue;
      
      // 计算市值变化百分比
      const marketCapChange = ((currentItem.marketCap - previousItem.marketCap) / previousItem.marketCap) * 100;
      const volatilityPercentage = Math.abs(marketCapChange);
      
      // 确定方向
      let direction: 'up' | 'down' | 'stable' = 'stable';
      if (marketCapChange > 1) direction = 'up';
      else if (marketCapChange < -1) direction = 'down';
      
      // 分类波动性
      let category = '极低';
      if (volatilityPercentage >= 50) category = '极高';
      else if (volatilityPercentage >= 20) category = '高';
      else if (volatilityPercentage >= 10) category = '中';
      else if (volatilityPercentage >= 5) category = '低';
      
      const result: VolatilityResult = {
        symbol: currentItem.symbol,
        name: currentItem.name,
        cryptocurrencyId: currentItem.cryptocurrencyId,
        volatilityPercentage,
        volatilityDirection: direction,
        volatilityCategory: category,
        rank: 0
      };
      
      results.push(result);
    }
    
    // 按波动性排序
    results.sort((a, b) => b.volatilityPercentage - a.volatilityPercentage);
    
    // 分配排名并保存到数据库
    let savedCount = 0;
    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      result.rank = i + 1;
      
      try {
        await storage.createVolatilityAnalysisEntry({
          batchId: volatilityBatch.id,
          cryptocurrencyId: result.cryptocurrencyId,
          symbol: result.symbol,
          name: result.name,
          volatilityPercentage: result.volatilityPercentage,
          volatilityDirection: result.volatilityDirection,
          volatilityCategory: result.volatilityCategory,
          volatilityRank: result.rank,
          currentVolumeRatio: 0, // 占位符
          previousVolumeRatio: 0, // 占位符
          volatilityScore: result.volatilityPercentage,
          priceChange24h: null,
          volumeChange24h: null,
          marketCapChange24h: null
        });
        savedCount++;
      } catch (error) {
        console.error(`保存波动性条目失败 (${result.symbol}):`, error);
      }
    }
    
    // 更新批次的总分析数量
    await storage.updateVolatilityAnalysisBatch(volatilityBatch.id, {
      totalAnalyzed: savedCount
    });
    
    console.log(`波动性分析完成，共分析 ${results.length} 个币种`);
    
    return { 
      success: true, 
      message: `波动性分析完成，共分析 ${results.length} 个币种`,
      batchId: volatilityBatch.id
    };
    
  } catch (error) {
    console.error('波动性分析失败:', error);
    return { 
      success: false, 
      message: `分析失败: ${error instanceof Error ? error.message : String(error)}` 
    };
  }
}