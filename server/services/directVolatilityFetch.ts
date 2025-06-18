/**
 * Direct Volatility Data Fetch Service
 * Simple service to fetch volatility data from batch 5
 */

import { db } from '../db';
import { sql } from 'drizzle-orm';

export async function getVolatilityEntriesFromBatch5(
  direction?: string,
  category?: string,
  limit: number = 30,
  offset: number = 0
) {
  try {
    console.log(`Fetching volatility data: direction=${direction}, category=${category}, limit=${limit}, offset=${offset}`);

    let whereClause = 'WHERE batch_id = 5 AND volatility_rank IS NOT NULL';
    
    if (direction && direction !== 'all') {
      whereClause += ` AND volatility_direction = '${direction}'`;
    }
    
    if (category && category !== 'all') {
      whereClause += ` AND volatility_category = '${category}'`;
    }

    // Get entries with correct snake_case column names
    const entriesQuery = `
      SELECT 
        symbol,
        name,
        volatility_percentage,
        volatility_category, 
        volatility_direction,
        volatility_rank,
        price_change_24h,
        market_cap_change_24h
      FROM volatility_analysis_entries 
      ${whereClause}
      ORDER BY volatility_rank ASC
      LIMIT ${limit} OFFSET ${offset}
    `;

    console.log('Executing query:', entriesQuery);
    const entriesResult = await db.execute(sql.raw(entriesQuery));
    const entries = Array.from(entriesResult) as any[];
    console.log(`Query returned ${entries.length} entries`);

    // Get total count
    const countQuery = `
      SELECT COUNT(*) as total
      FROM volatility_analysis_entries 
      ${whereClause}
    `;

    const countResult = await db.execute(sql.raw(countQuery));
    const countRows = Array.from(countResult) as any[];
    const total = countRows[0]?.total || 0;
    console.log(`Total entries matching criteria: ${total}`);

    return {
      entries: entries,
      total: total,
      batchId: 5
    };
  } catch (error) {
    console.error('Error fetching volatility data:', error);
    return {
      entries: [],
      total: 0,
      batchId: 5
    };
  }
}