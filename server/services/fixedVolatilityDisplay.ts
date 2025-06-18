/**
 * Fixed Volatility Display Service
 * Direct SQL queries to retrieve and display existing volatility data
 */

import { db } from '../db';
import { sql } from 'drizzle-orm';

export async function getVolatilityDataFromBatch5() {
  try {
    // Get volatility entries from batch 5 using raw SQL
    const entries = await db.execute(sql`
      SELECT 
        symbol,
        name,
        volatility_percentage,
        volatility_category,
        volatility_direction,
        rank as volatility_rank,
        current_market_cap,
        previous_market_cap
      FROM volatility_analysis_entries 
      WHERE batch_id = 5
        AND rank IS NOT NULL
      ORDER BY rank ASC
      LIMIT 100
    `);

    // Get batch info
    const batchInfo = await db.execute(sql`
      SELECT 
        id,
        created_at,
        timeframe,
        total_analyzed,
        analysis_type
      FROM volatility_analysis_batches 
      WHERE id = 5
    `);

    return {
      entries: entries.map((entry: any) => ({
        symbol: entry.symbol,
        name: entry.name,
        volatilityPercentage: parseFloat(entry.volatility_percentage) || 0,
        volatilityCategory: entry.volatility_category,
        volatilityDirection: entry.volatility_direction,
        rank: entry.volatility_rank || 0,
        currentMarketCap: entry.current_market_cap,
        previousMarketCap: entry.previous_market_cap
      })),
      batch: batchInfo[0] || { id: 5, total_analyzed: 906, timeframe: '7d' },
      total: entries.length
    };
  } catch (error) {
    console.error('Error fetching volatility data from batch 5:', error);
    return {
      entries: [],
      batch: { id: 5, total_analyzed: 906, timeframe: '7d' },
      total: 0
    };
  }
}

export async function getFilteredVolatilityData(
  direction?: string,
  category?: string,
  limit: number = 50,
  offset: number = 0
) {
  try {
    let whereClause = 'WHERE batch_id = 5 AND rank IS NOT NULL';
    
    if (direction && direction !== 'all') {
      whereClause += ` AND volatility_direction = '${direction}'`;
    }
    
    if (category && category !== 'all') {
      whereClause += ` AND volatility_category = '${category}'`;
    }

    const entries = await db.execute(sql.raw(`
      SELECT 
        symbol,
        name,
        volatility_percentage,
        volatility_category,
        volatility_direction,
        rank as volatility_rank,
        current_market_cap,
        previous_market_cap
      FROM volatility_analysis_entries 
      ${whereClause}
      ORDER BY rank ASC
      LIMIT ${limit} OFFSET ${offset}
    `));

    // Get total count
    const countResult = await db.execute(sql.raw(`
      SELECT COUNT(*) as total
      FROM volatility_analysis_entries 
      ${whereClause}
    `));

    // Get batch info
    const batchInfo = await db.execute(sql`
      SELECT 
        id,
        created_at,
        timeframe,
        total_analyzed,
        analysis_type
      FROM volatility_analysis_batches 
      WHERE id = 5
    `);

    return {
      entries: entries.map((entry: any) => ({
        symbol: entry.symbol,
        name: entry.name,
        volatilityPercentage: parseFloat(entry.volatility_percentage) || 0,
        volatilityCategory: entry.volatility_category,
        volatilityDirection: entry.volatility_direction,
        rank: entry.volatility_rank || 0,
        currentMarketCap: entry.current_market_cap,
        previousMarketCap: entry.previous_market_cap
      })),
      batch: batchInfo[0] || { id: 5, total_analyzed: 906, timeframe: '7d' },
      total: (countResult[0] as any)?.total || 0
    };
  } catch (error) {
    console.error('Error fetching filtered volatility data:', error);
    return {
      entries: [],
      batch: { id: 5, total_analyzed: 906, timeframe: '7d' },
      total: 0
    };
  }
}