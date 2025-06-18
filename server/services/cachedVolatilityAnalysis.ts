/**
 * 缓存波动性分析服务
 * 提供数据库缓存机制，避免每次请求都重新计算
 */

import { storage } from '../storage';
import { getFilteredPriceVolatility } from './priceVolatilityAnalysis';

interface CachedVolatilityData {
  batchId: number;
  period: '7d' | '30d';
  calculatedAt: Date;
  results: any[];
  total: number;
}

// 内存缓存存储
const volatilityCache = new Map<string, CachedVolatilityData>();
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24小时缓存

/**
 * 获取缓存的波动性分析数据
 */
export async function getCachedVolatilityAnalysis(
  period: '7d' | '30d' = '7d',
  direction?: string,
  category?: string,
  page: number = 1,
  limit: number = 50
) {
  const cacheKey = `volatility_${period}`;
  
  // 检查内存缓存
  const cached = volatilityCache.get(cacheKey);
  const now = new Date();
  
  if (cached && (now.getTime() - cached.calculatedAt.getTime()) < CACHE_DURATION) {
    console.log(`使用内存缓存的${period}波动性分析数据 (批次#${cached.batchId})`);
    
    // 应用筛选和分页
    return applyFiltersAndPagination(cached.results, direction, category, page, limit);
  }
  
  // 检查数据库中最新的波动性分析批次
  const latestBatch = await storage.getLatestVolatilityAnalysisBatch();
  
  if (latestBatch && latestBatch.createdAt) {
    const batchAge = now.getTime() - latestBatch.createdAt.getTime();
    
    // 如果批次数据在24小时内，检查是否有实际数据
    if (batchAge < CACHE_DURATION) {
      const entries = await storage.getVolatilityAnalysisResultsByBatchId(latestBatch.id);
      
      // 只有当批次确实有数据时才使用缓存
      if (entries.length > 0) {
        console.log(`使用数据库缓存的${period}波动性分析数据 (批次#${latestBatch.id}, ${entries.length}条记录)`);
        const results = await enrichVolatilityEntries(entries);
      
      // 更新内存缓存
      volatilityCache.set(cacheKey, {
        batchId: latestBatch.id,
        period,
        calculatedAt: latestBatch.createdAt,
        results,
        total: results.length
      });
      
      return applyFiltersAndPagination(results, direction, category, page, limit);
    }
  }
  
  // 缓存过期或不存在，重新计算
  console.log(`${period}波动性分析缓存过期，开始重新计算...`);
  return await calculateAndCacheVolatilityAnalysis(period, direction, category, page, limit);
}

/**
 * 重新计算并缓存波动性分析
 */
async function calculateAndCacheVolatilityAnalysis(
  period: '7d' | '30d',
  direction?: string,
  category?: string,
  page: number = 1,
  limit: number = 50
) {
  try {
    // 调用现有的波动性分析服务
    const { calculateAndStoreVolatilityAnalysis } = await import('./volatilityAnalysisService');
    const batchId = await calculateAndStoreVolatilityAnalysis(period);
    
    if (batchId) {
      // 获取新计算的结果
      const entries = await storage.getVolatilityAnalysisResultsByBatchId(batchId);
      const results = await enrichVolatilityEntries(entries);
      
      // 更新内存缓存
      const cacheKey = `volatility_${period}`;
      volatilityCache.set(cacheKey, {
        batchId,
        period,
        calculatedAt: new Date(),
        results,
        total: results.length
      });
      
      console.log(`${period}波动性分析计算完成，已缓存${results.length}个结果`);
      return applyFiltersAndPagination(results, direction, category, page, limit);
    }
  } catch (error) {
    console.error('重新计算波动性分析失败:', error);
  }
  
  // 如果计算失败，尝试使用旧的实时计算方法作为备用
  console.log('使用备用实时计算方法...');
  return await getFilteredPriceVolatility(period, direction, category, page, limit);
}

/**
 * 丰富波动性条目数据
 */
async function enrichVolatilityEntries(entries: any[]) {
  const results = [];
  
  for (const entry of entries) {
    try {
      const crypto = await storage.getCryptocurrency(entry.cryptocurrencyId);
      if (crypto) {
        results.push({
          id: crypto.id,
          symbol: crypto.symbol,
          name: crypto.name,
          marketCap: crypto.marketCap,
          rank: crypto.rank,
          volatilityPercentage: entry.volatilityPercentage,
          volatilityScore: entry.volatilityScore,
          volatilityRank: entry.volatilityRank,
          volatilityDirection: entry.volatilityDirection,
          volatilityCategory: entry.volatilityCategory,
          riskLevel: entry.riskLevel,
          createdAt: entry.createdAt
        });
      }
    } catch (error) {
      console.error(`获取加密货币数据失败 (ID: ${entry.cryptocurrencyId}):`, error);
    }
  }
  
  return results;
}

/**
 * 应用筛选和分页
 */
function applyFiltersAndPagination(
  results: any[],
  direction?: string,
  category?: string,
  page: number = 1,
  limit: number = 50
) {
  let filtered = [...results];
  
  // 应用方向筛选
  if (direction && direction !== 'all') {
    filtered = filtered.filter(r => r.volatilityDirection === direction);
  }
  
  // 应用类别筛选
  if (category && category !== 'all') {
    filtered = filtered.filter(r => r.volatilityCategory === category);
  }
  
  // 按波动率排序
  filtered.sort((a, b) => (b.volatilityPercentage || 0) - (a.volatilityPercentage || 0));
  
  // 应用分页
  const total = filtered.length;
  const startIndex = (page - 1) * limit;
  const endIndex = startIndex + limit;
  const paginatedResults = filtered.slice(startIndex, endIndex);
  
  return {
    entries: paginatedResults,
    total,
    page,
    limit,
    hasNext: endIndex < total,
    hasPrev: page > 1
  };
}

/**
 * 清除过期缓存
 */
export function clearExpiredCache() {
  const now = new Date();
  const expiredKeys: string[] = [];
  
  volatilityCache.forEach((cached, key) => {
    if ((now.getTime() - cached.calculatedAt.getTime()) >= CACHE_DURATION) {
      expiredKeys.push(key);
    }
  });
  
  expiredKeys.forEach(key => {
    volatilityCache.delete(key);
    console.log(`清除过期缓存: ${key}`);
  });
}

/**
 * 手动清除所有缓存
 */
export function clearAllCache() {
  volatilityCache.clear();
  console.log('已清除所有波动性分析缓存');
}