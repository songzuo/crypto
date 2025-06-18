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

    let whereClause = 'WHERE batch_id = 5 AND "volatilityRank" IS NOT NULL';
    
    if (direction && direction !== 'all') {
      whereClause += ` AND "volatilityDirection" = '${direction}'`;
    }
    
    if (category && category !== 'all') {
      whereClause += ` AND "volatilityCategory" = '${category}'`;
    }

    // Get entries with correct column names
    const entriesQuery = `
      SELECT 
        symbol,
        name,
        "volatilityPercentage",
        "volatilityCategory", 
        "volatilityDirection",
        "volatilityRank",
        "priceChange24h",
        "marketCapChange24h"
      FROM volatility_analysis_entries 
      ${whereClause}
      ORDER BY "volatilityRank" ASC
      LIMIT ${limit} OFFSET ${offset}
    `;

    console.log('Executing query:', entriesQuery);
    const entries = await db.execute(sql.raw(entriesQuery));
    console.log(`Query returned ${entries.length} entries`);

    // Get total count
    const countQuery = `
      SELECT COUNT(*) as total
      FROM volatility_analysis_entries 
      ${whereClause}
    `;

    const countResult = await db.execute(sql.raw(countQuery));
    const total = (countResult as any[])[0]?.total || 0;
    console.log(`Total entries matching criteria: ${total}`);

    return {
      entries: entries as any[],
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