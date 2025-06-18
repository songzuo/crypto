/**
 * Direct Volatility Analysis
 * Uses raw SQL queries to calculate volatility from existing data
 */

import { db } from '../db';
import { sql } from 'drizzle-orm';

interface VolatilityResult {
  symbol: string;
  name: string;
  cryptocurrencyId: number;
  volatilityPercentage: number;
  volatilityDirection: 'up' | 'down' | 'stable';
  volatilityCategory: string;
  rank: number;
  currentMarketCap?: number;
  previousMarketCap?: number;
}

export async function runDirectVolatilityAnalysis(period: '7d' | '30d' = '7d') {
  console.log(`开始直接波动率分析，周期: ${period}`);
  
  try {
    // Get market cap data directly from volume_to_market_cap_ratios table
    const batchLimit = period === '7d' ? 8 : 30;
    
    const marketCapData = await db.execute(sql`
      WITH latest_batches AS (
        SELECT DISTINCT batch_id 
        FROM volume_to_market_cap_ratios 
        WHERE market_cap IS NOT NULL AND market_cap > 0
        ORDER BY batch_id DESC 
        LIMIT ${batchLimit}
      ),
      crypto_data AS (
        SELECT 
          v.symbol,
          COALESCE(c.name, v.symbol) as name,
          COALESCE(v.cryptocurrency_id, c.id, 0) as cryptocurrency_id,
          v.market_cap,
          v.batch_id,
          vmb.created_at as timestamp
        FROM volume_to_market_cap_ratios v
        LEFT JOIN cryptocurrencies c ON c.symbol = v.symbol
        LEFT JOIN volume_to_market_cap_batches vmb ON vmb.id = v.batch_id
        WHERE v.batch_id IN (SELECT batch_id FROM latest_batches)
          AND v.market_cap IS NOT NULL 
          AND v.market_cap > 0
        ORDER BY v.symbol, v.batch_id ASC
      )
      SELECT * FROM crypto_data
      LIMIT 1000
    `);
    
    const dataRows = marketCapData.rows || marketCapData;
    console.log(`获取到 ${Array.isArray(dataRows) ? dataRows.length : 'invalid'} 条市值数据记录`);
    
    // Group data by symbol to calculate volatility
    const cryptoGroups = new Map<string, any[]>();
    
    if (!Array.isArray(dataRows)) {
      throw new Error('数据格式错误：无法获取市值数据');
    }
    
    for (const row of dataRows) {
      const symbol = row.symbol as string;
      if (!cryptoGroups.has(symbol)) {
        cryptoGroups.set(symbol, []);
      }
      cryptoGroups.get(symbol)!.push(row);
    }
    
    console.log(`处理 ${cryptoGroups.size} 个不同的加密货币`);
    
    const results: VolatilityResult[] = [];
    
    // Calculate volatility for each cryptocurrency
    for (const [symbol, data] of cryptoGroups) {
      if (data.length >= 2) {
        // Sort by batch_id to ensure chronological order
        data.sort((a, b) => (a.batch_id as number) - (b.batch_id as number));
        
        const marketCaps = data.map(d => d.market_cap as number);
        const volatility = calculateVolatility(marketCaps);
        const direction = calculateDirection(marketCaps);
        const category = getCategory(volatility);
        
        results.push({
          symbol,
          name: data[0].name as string,
          cryptocurrencyId: data[0].cryptocurrency_id as number,
          volatilityPercentage: volatility,
          volatilityDirection: direction,
          volatilityCategory: category,
          rank: 0, // Will be set after sorting
          currentMarketCap: marketCaps[marketCaps.length - 1],
          previousMarketCap: marketCaps[0]
        });
      }
    }
    
    console.log(`计算出 ${results.length} 个有效波动率结果`);
    
    // Sort by volatility (highest first) and assign ranks
    results.sort((a, b) => b.volatilityPercentage - a.volatilityPercentage);
    results.forEach((result, index) => {
      result.rank = index + 1;
    });
    
    // Save to database using raw SQL
    const batchInsertResult = await db.execute(sql`
      INSERT INTO volatility_analysis_batches 
      (timeframe, total_analyzed, analysis_type, has_changes, created_at) 
      VALUES (${period}, ${results.length}, 'direct_market_cap_volatility', ${results.length > 0}, NOW())
      RETURNING id
    `);
    
    const batchId = (batchInsertResult[0] as any).id;
    console.log(`创建分析批次 ${batchId}`);
    
    // Insert entries in batches
    if (results.length > 0) {
      const entries = results.map(result => [
        batchId,
        result.symbol,
        result.name,
        result.cryptocurrencyId,
        result.volatilityPercentage,
        result.volatilityDirection,
        result.volatilityCategory,
        result.rank,
        result.currentMarketCap,
        result.previousMarketCap
      ]);
      
      // Insert entries in chunks to avoid SQL parameter limits
      const chunkSize = 50;
      for (let i = 0; i < entries.length; i += chunkSize) {
        const chunk = entries.slice(i, i + chunkSize);
        const values = chunk.map((_, index) => 
          `($${index * 10 + 1}, $${index * 10 + 2}, $${index * 10 + 3}, $${index * 10 + 4}, $${index * 10 + 5}, $${index * 10 + 6}, $${index * 10 + 7}, $${index * 10 + 8}, $${index * 10 + 9}, $${index * 10 + 10})`
        ).join(', ');
        
        const flatValues = chunk.flat();
        
        await db.execute(sql.raw(`
          INSERT INTO volatility_analysis_entries 
          (batch_id, symbol, name, cryptocurrency_id, volatility_percentage, volatility_direction, volatility_category, rank, current_market_cap, previous_market_cap)
          VALUES ${values}
        `, flatValues));
      }
    }
    
    console.log(`保存了 ${results.length} 个波动率分析结果到批次 ${batchId}`);
    
    return {
      success: true,
      message: `成功分析了 ${results.length} 个加密货币的${period === '7d' ? '7天' : '30天'}波动率`,
      batchId: batchId,
      totalAnalyzed: results.length
    };
    
  } catch (error) {
    console.error('直接波动率分析失败:', error);
    return {
      success: false,
      message: `波动率分析失败: ${error instanceof Error ? error.message : '未知错误'}`,
      totalAnalyzed: 0
    };
  }
}

function calculateVolatility(marketCaps: number[]): number {
  if (marketCaps.length < 2) return 0;
  
  const changes: number[] = [];
  
  // Calculate percentage changes between consecutive data points
  for (let i = 1; i < marketCaps.length; i++) {
    const previous = marketCaps[i - 1];
    const current = marketCaps[i];
    
    if (previous > 0) {
      const change = Math.abs((current - previous) / previous) * 100;
      changes.push(change);
    }
  }
  
  if (changes.length === 0) return 0;
  
  const avgChange = changes.reduce((sum, change) => sum + change, 0) / changes.length;
  return Math.round(avgChange * 100) / 100;
}

function calculateDirection(marketCaps: number[]): 'up' | 'down' | 'stable' {
  if (marketCaps.length < 2) return 'stable';
  
  const first = marketCaps[0];
  const last = marketCaps[marketCaps.length - 1];
  
  const change = (last - first) / first;
  
  if (change > 0.05) return 'up';
  if (change < -0.05) return 'down';
  return 'stable';
}

function getCategory(volatility: number): string {
  if (volatility < 5) return 'low-risk';
  if (volatility < 15) return 'medium-risk';
  return 'high-risk';
}