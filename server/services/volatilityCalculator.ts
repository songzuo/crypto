/**
 * 波动性计算器
 * 根据用户指定算法计算7天和30天波动性
 */

import { storage } from '../storage';
import { db, pool } from '../db';

interface VolatilityData {
  symbol: string;
  name: string;
  cryptocurrencyId: number;
  volatility7d: number;
  volatility30d: number;
  direction: 'up' | 'down';
  category: 'Low' | 'Medium' | 'High';
  dataPoints7d: number;
  dataPoints30d: number;
}

/**
 * 计算单个加密货币的波动性
 * 7天：使用最近8个数据点的平均值
 * 30天：使用全部可用数据点的平均值
 */
async function calculateCryptocurrencyVolatility(cryptocurrencyId: number): Promise<VolatilityData | null> {
  try {
    // 获取加密货币基本信息
    const cryptoQuery = `
      SELECT symbol, name 
      FROM cryptocurrencies 
      WHERE id = $1
    `;
    
    const cryptoResult = await pool.query(cryptoQuery, [cryptocurrencyId]);
    if (cryptoResult.rows.length === 0) {
      return null;
    }
    
    const { symbol, name } = cryptoResult.rows[0];
    
    // 获取所有价格变化数据，按时间排序（最新的在前）
    const priceDataQuery = `
      SELECT price_change_24h, last_updated
      FROM cryptocurrencies 
      WHERE id = $1 
        AND price_change_24h IS NOT NULL 
        AND last_updated IS NOT NULL
      ORDER BY last_updated DESC
    `;
    
    // 从交易量市值比率数据中获取额外的价格变化数据
    const volumeRatioQuery = `
      SELECT price_change_24h, created_at as last_updated
      FROM volume_to_market_cap_ratios 
      WHERE cryptocurrency_id = $1 
        AND price_change_24h IS NOT NULL 
        AND created_at IS NOT NULL
      ORDER BY created_at DESC
      LIMIT 50
    `;
    
    const [priceResult, volumeResult] = await Promise.all([
      pool.query(priceDataQuery, [cryptocurrencyId]),
      pool.query(volumeRatioQuery, [cryptocurrencyId])
    ]);
    
    // 合并所有价格变化数据
    const allPriceChanges = [
      ...priceResult.rows.map(row => parseFloat(row.price_change_24h)),
      ...volumeResult.rows.map(row => parseFloat(row.price_change_24h))
    ].filter(val => !isNaN(val) && isFinite(val));
    
    if (allPriceChanges.length === 0) {
      return null;
    }
    
    // 7天波动性：使用最近8个数据点
    const recent8Points = allPriceChanges.slice(0, Math.min(8, allPriceChanges.length));
    const volatility7d = calculateVolatility(recent8Points);
    
    // 30天波动性：使用全部可用数据点
    const volatility30d = calculateVolatility(allPriceChanges);
    
    // 确定波动方向（基于最近的价格变化）
    const recentChange = allPriceChanges[0] || 0;
    const direction = recentChange >= 0 ? 'up' : 'down';
    
    // 分类波动性（基于7天波动性）
    let category: 'Low' | 'Medium' | 'High';
    if (volatility7d < 20) {
      category = 'Low';
    } else if (volatility7d < 50) {
      category = 'Medium';
    } else {
      category = 'High';
    }
    
    return {
      symbol,
      name,
      cryptocurrencyId,
      volatility7d,
      volatility30d,
      direction,
      category,
      dataPoints7d: recent8Points.length,
      dataPoints30d: allPriceChanges.length
    };
    
  } catch (error) {
    console.error(`计算加密货币 ${cryptocurrencyId} 波动性失败:`, error);
    return null;
  }
}

/**
 * 计算价格变化数组的波动性（标准差百分比）
 */
function calculateVolatility(priceChanges: number[]): number {
  if (priceChanges.length === 0) return 0;
  
  // 计算平均值
  const mean = priceChanges.reduce((sum, val) => sum + val, 0) / priceChanges.length;
  
  // 计算方差
  const variance = priceChanges.reduce((sum, val) => {
    const diff = val - mean;
    return sum + (diff * diff);
  }, 0) / priceChanges.length;
  
  // 计算标准差（波动性）
  const standardDeviation = Math.sqrt(variance);
  
  // 返回绝对值，表示波动性程度
  return Math.abs(standardDeviation);
}

/**
 * 为所有加密货币计算波动性并创建新批次
 */
export async function runVolatilityAnalysisWithNewAlgorithm(): Promise<number> {
  try {
    console.log('开始运行波动性分析（新算法）...');
    
    // 创建新的波动性分析批次
    const newBatch = await storage.createVolatilityAnalysisBatch({
      timeframe: '7d_8points_30d_all',
      analysisType: 'volatility_ranking_v2',
      totalAnalyzed: null,
      baseVolumeRatioBatchId: null,
      comparisonVolumeRatioBatchId: null
    });
    
    console.log(`创建新的波动性分析批次: ${newBatch.id}`);
    
    // 获取所有加密货币
    const cryptosResult = await storage.getCryptocurrencies(1, 10000);
    const cryptocurrencies = cryptosResult.data;
    
    console.log(`开始分析 ${cryptocurrencies.length} 个加密货币的波动性...`);
    
    const volatilityResults: VolatilityData[] = [];
    
    // 批量处理以提高效率
    const batchSize = 50;
    for (let i = 0; i < cryptocurrencies.length; i += batchSize) {
      const batch = cryptocurrencies.slice(i, i + batchSize);
      
      const batchPromises = batch.map(crypto => 
        calculateCryptocurrencyVolatility(crypto.id)
      );
      
      const batchResults = await Promise.all(batchPromises);
      
      // 过滤掉null结果
      const validResults = batchResults.filter(result => result !== null) as VolatilityData[];
      volatilityResults.push(...validResults);
      
      console.log(`已处理 ${Math.min(i + batchSize, cryptocurrencies.length)}/${cryptocurrencies.length} 个加密货币`);
    }
    
    // 按7天波动性排序
    volatilityResults.sort((a, b) => b.volatility7d - a.volatility7d);
    
    // 存储波动性分析结果
    let savedCount = 0;
    for (let i = 0; i < volatilityResults.length; i++) {
      const result = volatilityResults[i];
      
      try {
        await storage.createVolatilityAnalysisEntry({
          symbol: result.symbol,
          name: result.name,
          batchId: newBatch.id,
          cryptocurrencyId: result.cryptocurrencyId,
          volatilityPercentage: result.volatility7d,
          volatilityCategory: result.category,
          volatilityDirection: result.direction,
          volatilityRank: i + 1,
          priceChange24h: null,
          currentVolumeRatio: null,
          previousVolumeRatio: null,
          volumeRatioChange: null,
          marketCapChange24h: null,
          riskLevel: result.category.toLowerCase(),
          dataPoints: result.dataPoints7d,
          comparisons: result.dataPoints30d,
          period: '7d'
        });
        
        savedCount++;
      } catch (error) {
        console.error(`保存 ${result.symbol} 波动性数据失败:`, error);
      }
    }
    
    // 更新批次统计信息
    await storage.updateVolatilityAnalysisBatch(newBatch.id, {
      totalAnalyzed: savedCount
    });
    
    console.log(`波动性分析完成！`);
    console.log(`- 批次ID: ${newBatch.id}`);
    console.log(`- 分析了 ${cryptocurrencies.length} 个加密货币`);
    console.log(`- 成功保存 ${savedCount} 个结果`);
    console.log(`- 算法: 7天使用最近8个数据点，30天使用全部数据点`);
    
    return newBatch.id;
    
  } catch (error) {
    console.error('波动性分析失败:', error);
    throw error;
  }
}