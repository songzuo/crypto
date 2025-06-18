/**
 * 波动性分析调度器
 * 定期生成新的波动性分析批次，自动存储到数据库
 */

import { storage } from '../storage';
import { runAPIVolumeRatioAnalysis } from '../apiVolumeRatioAnalysis';

/**
 * 运行波动性分析并存储新批次
 */
export async function runScheduledVolatilityAnalysis(): Promise<void> {
  try {
    console.log('开始运行定期波动性分析...');
    
    // 获取当前加密货币总数
    const allCryptos = await storage.getCryptocurrencies(1, 10000);
    const cryptoCount = allCryptos.length;
    
    if (cryptoCount < 100) {
      console.log(`加密货币数量不足 (${cryptoCount}个)，跳过波动性分析`);
      return;
    }
    
    // 创建新的波动性分析批次
    const newBatch = await storage.createVolatilityAnalysisBatch({
      timeframe: '7d',
      analysisType: 'volatility_ranking',
      totalAnalyzed: null,
      baseVolumeRatioBatchId: null,
      comparisonVolumeRatioBatchId: null
    });
    
    console.log(`创建新的波动性分析批次: ${newBatch.id}`);
    
    // 运行波动性分析
    await runAPIVolumeRatioAnalysis();
    
    // 更新批次状态
    await storage.updateVolatilityAnalysisBatch(newBatch.id, {
      totalAnalyzed: cryptoCount
    });
    
    console.log(`波动性分析批次 ${newBatch.id} 完成，分析了 ${cryptoCount} 个加密货币`);
    
  } catch (error) {
    console.error('定期波动性分析失败:', error);
  }
}

/**
 * 检查是否需要运行新的波动性分析
 * 如果最新批次超过24小时，则运行新分析
 */
export async function checkAndRunVolatilityAnalysis(): Promise<void> {
  try {
    const latestBatch = await storage.getLatestVolatilityAnalysisBatch();
    
    if (!latestBatch) {
      console.log('没有找到现有批次，运行首次波动性分析');
      await runScheduledVolatilityAnalysis();
      return;
    }
    
    const now = new Date().getTime();
    const batchTime = new Date(latestBatch.createdAt || latestBatch.createdAt).getTime();
    const hoursSinceLastBatch = (now - batchTime) / (1000 * 60 * 60);
    
    if (hoursSinceLastBatch >= 24) {
      console.log(`最新批次已超过24小时 (${hoursSinceLastBatch.toFixed(1)}小时)，运行新的波动性分析`);
      await runScheduledVolatilityAnalysis();
    } else {
      console.log(`最新批次还较新 (${hoursSinceLastBatch.toFixed(1)}小时前)，暂不需要新分析`);
    }
    
  } catch (error) {
    console.error('检查波动性分析调度失败:', error);
  }
}