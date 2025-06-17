/**
 * 简化版波动性分析服务
 * 基于现有交易量市值比率数据计算波动性排名
 */

import { storage } from '../storage';

export interface VolatilityResult {
  symbol: string;
  name: string;
  currentRatio: number;
  previousRatio: number;
  volatilityScore: number;
  volatilityPercentage: number;
  direction: 'up' | 'down' | 'stable';
  category: string;
  rank: number;
}

/**
 * 计算波动性指标
 */
function calculateVolatility(current: number, previous: number): {
  score: number;
  percentage: number;
  direction: 'up' | 'down' | 'stable';
  category: string;
} {
  const change = current - previous;
  const percentage = previous > 0 ? (change / previous) * 100 : 0;
  const absoluteChange = Math.abs(percentage);
  
  // 计算波动性评分 (0-100)
  const score = Math.min(100, absoluteChange * 2);
  
  // 确定方向
  let direction: 'up' | 'down' | 'stable';
  if (Math.abs(percentage) < 5) {
    direction = 'stable';
  } else {
    direction = percentage > 0 ? 'up' : 'down';
  }
  
  // 确定风险等级
  let category: string;
  if (absoluteChange >= 50) {
    category = '极高';
  } else if (absoluteChange >= 25) {
    category = '高';
  } else if (absoluteChange >= 10) {
    category = '中';
  } else if (absoluteChange >= 5) {
    category = '低';
  } else {
    category = '极低';
  }
  
  return { score, percentage, direction, category };
}

/**
 * 运行简化版波动性分析
 */
export async function runSimpleVolatilityAnalysis(): Promise<VolatilityResult[]> {
  console.log('开始运行简化版波动性分析...');
  
  // 获取最新的两个批次
  const batches = await storage.getVolumeToMarketCapBatches(1, 2);
  
  if (batches.data.length < 2) {
    console.warn('需要至少两个批次数据进行波动性分析');
    return [];
  }
  
  const [currentBatch, previousBatch] = batches.data;
  
  // 获取两个批次的数据
  const currentData = await storage.getVolumeToMarketCapRatiosByBatchId(currentBatch.id);
  const previousData = await storage.getVolumeToMarketCapRatiosByBatchId(previousBatch.id);
  
  // 创建前一批次数据的映射
  const previousMap = new Map();
  previousData.forEach(item => {
    previousMap.set(item.symbol, item.volumeToMarketCapRatio);
  });
  
  const results: VolatilityResult[] = [];
  
  // 计算波动性
  currentData.forEach(current => {
    const previousRatio = previousMap.get(current.symbol);
    
    if (previousRatio !== undefined && previousRatio > 0) {
      const volatility = calculateVolatility(
        current.volumeToMarketCapRatio,
        previousRatio
      );
      
      results.push({
        symbol: current.symbol,
        name: current.name,
        currentRatio: current.volumeToMarketCapRatio,
        previousRatio,
        volatilityScore: volatility.score,
        volatilityPercentage: volatility.percentage,
        direction: volatility.direction,
        category: volatility.category,
        rank: 0 // 稍后分配
      });
    }
  });
  
  // 按波动性评分排序并分配排名
  results.sort((a, b) => b.volatilityScore - a.volatilityScore);
  results.forEach((result, index) => {
    result.rank = index + 1;
  });
  
  console.log(`波动性分析完成，共分析 ${results.length} 个币种`);
  
  return results;
}

/**
 * 获取波动性分析结果（带筛选）
 */
export async function getVolatilityResults(
  direction?: string,
  category?: string
): Promise<VolatilityResult[]> {
  const results = await runSimpleVolatilityAnalysis();
  
  let filtered = results;
  
  if (direction) {
    filtered = filtered.filter(r => r.direction === direction);
  }
  
  if (category) {
    filtered = filtered.filter(r => r.category === category);
  }
  
  return filtered;
}