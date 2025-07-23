import { db } from './db';
import { cryptocurrencies } from '@shared/schema';
import { sql, eq, asc } from 'drizzle-orm';

/**
 * 数据库去重脚本
 * 合并相同名称的加密货币，保留最新最完整的数据
 */
export async function deduplicateDatabase() {
  console.log('🔄 开始数据库去重处理...');
  
  try {
    // 第一步：获取所有重复的名称
    const duplicates = await db
      .select({
        name: cryptocurrencies.name,
        count: sql<number>`COUNT(*)`
      })
      .from(cryptocurrencies)
      .groupBy(cryptocurrencies.name)
      .having(sql`COUNT(*) > 1`)
      .orderBy(sql`COUNT(*) DESC`);

    console.log(`📊 发现 ${duplicates.length} 个重复名称需要处理`);
    
    let totalRemoved = 0;
    let processedCount = 0;

    // 第二步：逐个处理重复项
    for (const duplicate of duplicates) {
      const { name, count } = duplicate;
      processedCount++;
      
      console.log(`🔄 处理 "${name}" (${count} 个重复项) - 进度: ${processedCount}/${duplicates.length}`);
      
      // 获取这个名称的所有记录，按最后更新时间排序
      const records = await db
        .select()
        .from(cryptocurrencies)
        .where(eq(cryptocurrencies.name, name))
        .orderBy(asc(cryptocurrencies.lastUpdated));

      if (records.length <= 1) continue;

      // 选择最佳记录（最后更新且数据最完整的）
      const bestRecord = records.reduce((best, current) => {
        // 优先选择数据更完整的记录
        const bestScore = calculateCompletenessScore(best);
        const currentScore = calculateCompletenessScore(current);
        
        if (currentScore > bestScore) return current;
        if (currentScore === bestScore && current.lastUpdated && best.lastUpdated && current.lastUpdated > best.lastUpdated) return current;
        return best;
      });

      // 删除其他重复记录
      const toDelete = records.filter(record => record.id !== bestRecord.id);
      
      for (const record of toDelete) {
        await db
          .delete(cryptocurrencies)
          .where(eq(cryptocurrencies.id, record.id));
      }
      
      totalRemoved += toDelete.length;
      
      // 每50个处理一次输出进度
      if (processedCount % 50 === 0) {
        console.log(`📈 已处理 ${processedCount}/${duplicates.length}，已删除 ${totalRemoved} 条重复记录`);
      }
    }

    // 第三步：获取去重后的统计信息
    const finalCount = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(cryptocurrencies);
    
    const uniqueCount = await db
      .select({ count: sql<number>`COUNT(DISTINCT name)` })
      .from(cryptocurrencies);

    console.log('✅ 数据库去重完成！');
    console.log(`📊 处理了 ${duplicates.length} 个重复名称`);
    console.log(`🗑️ 删除了 ${totalRemoved} 条重复记录`);
    console.log(`📈 当前总记录数: ${finalCount[0].count}`);
    console.log(`🎯 唯一名称数: ${uniqueCount[0].count}`);
    
    return {
      processedDuplicates: duplicates.length,
      removedRecords: totalRemoved,
      finalCount: finalCount[0].count,
      uniqueNames: uniqueCount[0].count
    };

  } catch (error) {
    console.error('❌ 数据库去重失败:', error);
    throw error;
  }
}

/**
 * 计算记录完整性得分
 */
function calculateCompletenessScore(record: any): number {
  let score = 0;
  
  // 基础字段得分
  if (record.symbol) score += 1;
  if (record.price && record.price > 0) score += 2;
  if (record.marketCap && record.marketCap > 0) score += 2;
  if (record.volume24h && record.volume24h > 0) score += 1;
  if (record.priceChange24h !== null) score += 1;
  if (record.rank && record.rank > 0) score += 1;
  if (record.website) score += 1;
  if (record.description) score += 1;
  
  // 时间戳得分（更新时间越新得分越高）
  if (record.lastUpdated) {
    const now = new Date();
    const updated = new Date(record.lastUpdated);
    const hoursSinceUpdate = (now.getTime() - updated.getTime()) / (1000 * 60 * 60);
    
    // 越新的记录得分越高
    if (hoursSinceUpdate < 24) score += 3;
    else if (hoursSinceUpdate < 72) score += 2;
    else if (hoursSinceUpdate < 168) score += 1;
  }
  
  return score;
}

/**
 * 检查名称是否已存在
 */
export async function checkNameExists(name: string): Promise<boolean> {
  const existing = await db
    .select({ id: cryptocurrencies.id })
    .from(cryptocurrencies)
    .where(eq(cryptocurrencies.name, name))
    .limit(1);
    
  return existing.length > 0;
}

/**
 * 检查名称+符号组合是否已存在
 */
export async function checkNameSymbolExists(name: string, symbol?: string): Promise<boolean> {
  if (!symbol) {
    return checkNameExists(name);
  }
  
  const existing = await db
    .select({ id: cryptocurrencies.id })
    .from(cryptocurrencies)
    .where(sql`${cryptocurrencies.name} = ${name} AND ${cryptocurrencies.symbol} = ${symbol}`)
    .limit(1);
    
  return existing.length > 0;
}

// 如果直接运行此脚本
if (import.meta.url === `file://${process.argv[1]}`) {
  deduplicateDatabase()
    .then(() => {
      console.log('✅ 去重脚本执行完成');
      process.exit(0);
    })
    .catch(error => {
      console.error('❌ 去重脚本执行失败:', error);
      process.exit(1);
    });
}