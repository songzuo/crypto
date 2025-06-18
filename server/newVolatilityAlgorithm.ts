/**
 * 新波动性算法实现
 * 7天：使用最近8个数据点计算平均值
 * 30天：使用全部数据点计算平均值
 */

import { pool } from './db';

interface VolatilityResult {
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

export async function runNewVolatilityAlgorithm(): Promise<{ batchId: number; totalAnalyzed: number }> {
  try {
    console.log('开始运行新波动性算法...');
    
    // 创建新批次
    const batchQuery = `
      INSERT INTO volatility_analysis_batches (timeframe, analysis_type, total_analyzed)
      VALUES ($1, $2, $3)
      RETURNING id
    `;
    
    const batchResult = await pool.query(batchQuery, ['7d_8points_30d_all', 'new_volatility_algorithm', 0]);
    const batchId = batchResult.rows[0].id;
    
    console.log(`创建新批次: ${batchId}`);
    
    // 获取所有加密货币
    const cryptoQuery = `
      SELECT id, symbol, name 
      FROM cryptocurrencies 
      WHERE symbol IS NOT NULL AND name IS NOT NULL
      ORDER BY id
      LIMIT 500
    `;
    
    const cryptoResult = await pool.query(cryptoQuery);
    const cryptocurrencies = cryptoResult.rows;
    
    console.log(`分析 ${cryptocurrencies.length} 个加密货币...`);
    
    const results: VolatilityResult[] = [];
    let processedCount = 0;
    
    for (const crypto of cryptocurrencies) {
      try {
        const volatilityData = await calculateCryptoVolatility(crypto.id, crypto.symbol, crypto.name);
        if (volatilityData) {
          results.push(volatilityData);
        }
        processedCount++;
        
        if (processedCount % 50 === 0) {
          console.log(`已处理 ${processedCount}/${cryptocurrencies.length} 个加密货币`);
        }
      } catch (error) {
        console.error(`处理 ${crypto.symbol} 失败:`, error);
      }
    }
    
    // 按7天波动性排序
    results.sort((a, b) => b.volatility7d - a.volatility7d);
    
    // 保存结果
    let savedCount = 0;
    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      
      try {
        const entryQuery = `
          INSERT INTO volatility_analysis_entries (
            symbol, name, batch_id, cryptocurrency_id, volatility_percentage,
            volatility_category, volatility_direction, volatility_rank,
            risk_level, data_points, comparisons, period
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        `;
        
        await pool.query(entryQuery, [
          result.symbol,
          result.name,
          batchId,
          result.cryptocurrencyId,
          result.volatility7d,
          result.category,
          result.direction,
          i + 1,
          result.category.toLowerCase(),
          result.dataPoints7d,
          result.dataPoints30d,
          '7d'
        ]);
        
        savedCount++;
      } catch (error) {
        console.error(`保存 ${result.symbol} 失败:`, error);
      }
    }
    
    // 更新批次统计
    await pool.query(
      'UPDATE volatility_analysis_batches SET total_analyzed = $1 WHERE id = $2',
      [savedCount, batchId]
    );
    
    console.log(`新算法完成: 批次 ${batchId}, 保存 ${savedCount} 个结果`);
    
    return { batchId, totalAnalyzed: savedCount };
    
  } catch (error) {
    console.error('新波动性算法失败:', error);
    throw error;
  }
}

async function calculateCryptoVolatility(
  cryptocurrencyId: number, 
  symbol: string, 
  name: string
): Promise<VolatilityResult | null> {
  try {
    // 获取价格变化数据
    const priceQuery = `
      SELECT price_change_percentage_24h, created_at
      FROM volume_to_market_cap_ratios 
      WHERE cryptocurrency_id = $1 
        AND price_change_percentage_24h IS NOT NULL 
        AND price_change_percentage_24h != 0
      ORDER BY created_at DESC
      LIMIT 30
    `;
    
    const priceResult = await pool.query(priceQuery, [cryptocurrencyId]);
    const priceChanges = priceResult.rows
      .map(row => parseFloat(row.price_change_percentage_24h))
      .filter(val => !isNaN(val) && isFinite(val));
    
    if (priceChanges.length < 3) {
      return null;
    }
    
    // 7天波动性：最近8个数据点
    const recent8Points = priceChanges.slice(0, Math.min(8, priceChanges.length));
    const volatility7d = calculateVolatility(recent8Points);
    
    // 30天波动性：全部数据点
    const volatility30d = calculateVolatility(priceChanges);
    
    // 方向判断
    const recentChange = priceChanges[0] || 0;
    const direction = recentChange >= 0 ? 'up' : 'down';
    
    // 分类
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
      dataPoints30d: priceChanges.length
    };
    
  } catch (error) {
    console.error(`计算 ${symbol} 波动性失败:`, error);
    return null;
  }
}

function calculateVolatility(priceChanges: number[]): number {
  if (priceChanges.length === 0) return 0;
  
  // 计算平均值
  const mean = priceChanges.reduce((sum, val) => sum + val, 0) / priceChanges.length;
  
  // 计算方差
  const variance = priceChanges.reduce((sum, val) => {
    const diff = val - mean;
    return sum + (diff * diff);
  }, 0) / priceChanges.length;
  
  // 返回标准差
  return Math.sqrt(variance);
}