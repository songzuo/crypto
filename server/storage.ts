import { 
  users, type User, type InsertUser,
  cryptocurrencies, type Cryptocurrency, type InsertCryptocurrency,
  blockchainExplorers, type BlockchainExplorer, type InsertBlockchainExplorer,
  metrics, type Metric, type InsertMetric,
  aiInsights, type AiInsight, type InsertAiInsight,
  crawlerStatus, type CrawlerStatus, type InsertCrawlerStatus
} from "@shared/schema";

export interface IStorage {
  // Users (inherited from template)
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
  // Cryptocurrencies
  getCryptocurrencies(page: number, limit: number, sort: string, order: string): Promise<{ data: Cryptocurrency[], total: number }>;
  getCryptocurrency(id: number): Promise<Cryptocurrency | undefined>;
  createCryptocurrency(cryptocurrency: InsertCryptocurrency): Promise<Cryptocurrency>;
  updateCryptocurrency(id: number, data: Partial<InsertCryptocurrency>): Promise<Cryptocurrency | undefined>;
  
  // Blockchain Explorers
  getBlockchainExplorers(cryptocurrencyId: number): Promise<BlockchainExplorer[]>;
  getRecentExplorers(limit: number): Promise<(BlockchainExplorer & { cryptocurrencyName: string })[]>;
  createBlockchainExplorer(explorer: InsertBlockchainExplorer): Promise<BlockchainExplorer>;
  
  // Metrics
  getMetrics(cryptocurrencyId: number): Promise<Metric | undefined>;
  createMetrics(metric: InsertMetric): Promise<Metric>;
  updateMetrics(id: number, data: Partial<InsertMetric>): Promise<Metric | undefined>;
  
  // AI Insights
  getAiInsights(limit: number): Promise<(AiInsight & { cryptocurrencyName: string })[]>;
  getAiInsightsForCrypto(cryptocurrencyId: number): Promise<AiInsight[]>;
  createAiInsight(insight: InsertAiInsight): Promise<AiInsight>;
  
  // Crawler Status
  getCrawlerStatus(): Promise<CrawlerStatus | undefined>;
  updateCrawlerStatus(data: Partial<InsertCrawlerStatus>): Promise<CrawlerStatus | undefined>;
  
  // Comparison
  compareCryptocurrencies(ids: number[]): Promise<Cryptocurrency[]>;
  
  // Search
  searchCryptocurrencies(query: string): Promise<Cryptocurrency[]>;
  
  // Autocomplete for fast prefix-based search
  autocompleteCryptocurrencies(prefix: string, limit?: number): Promise<Cryptocurrency[]>;
  
  // Cleanup fake data
  cleanupFakeData(): Promise<{ removedCount: number, remainingCount: number }>;
  
  // Completely purge all cryptocurrency data
  purgeAllCryptoData(): Promise<{ success: boolean, message: string }>;
}

export class MemStorage implements IStorage {
  private users: Map<number, User>;
  private cryptocurrencies: Map<number, Cryptocurrency>;
  private blockchainExplorers: Map<number, BlockchainExplorer>;
  private metrics: Map<number, Metric>;
  private aiInsights: Map<number, AiInsight>;
  private crawlerStatus: CrawlerStatus | undefined;
  
  userCurrentId: number;
  cryptoCurrentId: number;
  explorerCurrentId: number;
  metricCurrentId: number;
  insightCurrentId: number;
  
  constructor() {
    this.users = new Map();
    this.cryptocurrencies = new Map();
    this.blockchainExplorers = new Map();
    this.metrics = new Map();
    this.aiInsights = new Map();
    
    this.userCurrentId = 1;
    this.cryptoCurrentId = 1;
    this.explorerCurrentId = 1;
    this.metricCurrentId = 1;
    this.insightCurrentId = 1;
    
    // Initialize crawler status
    this.crawlerStatus = {
      id: 1,
      webCrawlerActive: false,
      aiProcessorActive: false,
      blockchainSyncActive: false,
      lastUpdate: new Date(),
      newEntriesCount: 0
    };
  }

  // User methods (inherited from template)
  async getUser(id: number): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = this.userCurrentId++;
    const user: User = { ...insertUser, id };
    this.users.set(id, user);
    return user;
  }
  
  // Cryptocurrency methods
  async getCryptocurrencies(page: number, limit: number, sort: string, order: string): Promise<{ data: Cryptocurrency[], total: number }> {
    const cryptocurrencies = Array.from(this.cryptocurrencies.values());
    
    // Apply sorting
    const sortedCryptocurrencies = cryptocurrencies.sort((a, b) => {
      if (sort === 'name') {
        return order === 'asc' ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name);
      } else if (sort === 'marketCap') {
        return order === 'asc' ? (a.marketCap || 0) - (b.marketCap || 0) : (b.marketCap || 0) - (a.marketCap || 0);
      } else if (sort === 'price') {
        return order === 'asc' ? (a.price || 0) - (b.price || 0) : (b.price || 0) - (a.price || 0);
      } else if (sort === 'volume24h') {
        return order === 'asc' ? (a.volume24h || 0) - (b.volume24h || 0) : (b.volume24h || 0) - (a.volume24h || 0);
      } else if (sort === 'priceChange24h') {
        return order === 'asc' ? (a.priceChange24h || 0) - (b.priceChange24h || 0) : (b.priceChange24h || 0) - (a.priceChange24h || 0);
      } else {
        // Default sort by rank
        return order === 'asc' ? (a.rank || Infinity) - (b.rank || Infinity) : (b.rank || Infinity) - (a.rank || Infinity);
      }
    });
    
    // Apply pagination
    const start = (page - 1) * limit;
    const end = start + limit;
    const paginatedData = sortedCryptocurrencies.slice(start, end);
    
    return {
      data: paginatedData,
      total: cryptocurrencies.length
    };
  }
  
  async getCryptocurrency(id: number): Promise<Cryptocurrency | undefined> {
    return this.cryptocurrencies.get(id);
  }
  
  async createCryptocurrency(insertCrypto: InsertCryptocurrency): Promise<Cryptocurrency> {
    const id = this.cryptoCurrentId++;
    const crypto: Cryptocurrency = { 
      ...insertCrypto, 
      id, 
      lastUpdated: new Date() 
    };
    this.cryptocurrencies.set(id, crypto);
    return crypto;
  }
  
  async updateCryptocurrency(id: number, data: Partial<InsertCryptocurrency>): Promise<Cryptocurrency | undefined> {
    const crypto = this.cryptocurrencies.get(id);
    
    if (!crypto) {
      return undefined;
    }
    
    const updatedCrypto = { 
      ...crypto, 
      ...data, 
      lastUpdated: new Date() 
    };
    
    this.cryptocurrencies.set(id, updatedCrypto);
    return updatedCrypto;
  }
  
  // Blockchain Explorer methods
  async getBlockchainExplorers(cryptocurrencyId: number): Promise<BlockchainExplorer[]> {
    return Array.from(this.blockchainExplorers.values())
      .filter(explorer => explorer.cryptocurrencyId === cryptocurrencyId);
  }
  
  async getRecentExplorers(limit: number): Promise<(BlockchainExplorer & { cryptocurrencyName: string })[]> {
    const explorers = Array.from(this.blockchainExplorers.values())
      .sort((a, b) => b.lastFetched.getTime() - a.lastFetched.getTime())
      .slice(0, limit);
    
    return explorers.map(explorer => {
      const crypto = this.cryptocurrencies.get(explorer.cryptocurrencyId);
      return {
        ...explorer,
        cryptocurrencyName: crypto ? crypto.name : 'Unknown'
      };
    });
  }
  
  async createBlockchainExplorer(insertExplorer: InsertBlockchainExplorer): Promise<BlockchainExplorer> {
    const id = this.explorerCurrentId++;
    const explorer: BlockchainExplorer = { 
      ...insertExplorer, 
      id, 
      lastFetched: new Date() 
    };
    this.blockchainExplorers.set(id, explorer);
    return explorer;
  }
  
  // Metrics methods
  async getMetrics(cryptocurrencyId: number): Promise<Metric | undefined> {
    return Array.from(this.metrics.values())
      .find(metric => metric.cryptocurrencyId === cryptocurrencyId);
  }
  
  async createMetrics(insertMetric: InsertMetric): Promise<Metric> {
    const id = this.metricCurrentId++;
    const metric: Metric = { 
      ...insertMetric, 
      id, 
      lastUpdated: new Date() 
    };
    this.metrics.set(id, metric);
    return metric;
  }
  
  async updateMetrics(id: number, data: Partial<InsertMetric>): Promise<Metric | undefined> {
    const metric = this.metrics.get(id);
    
    if (!metric) {
      return undefined;
    }
    
    const updatedMetric = { 
      ...metric, 
      ...data, 
      lastUpdated: new Date() 
    };
    
    this.metrics.set(id, updatedMetric);
    return updatedMetric;
  }
  
  // AI Insights methods
  async getAiInsights(limit: number): Promise<(AiInsight & { cryptocurrencyName: string })[]> {
    const insights = Array.from(this.aiInsights.values())
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit);
    
    return insights.map(insight => {
      const crypto = insight.cryptocurrencyId ? this.cryptocurrencies.get(insight.cryptocurrencyId) : undefined;
      return {
        ...insight,
        cryptocurrencyName: crypto ? crypto.name : 'General'
      };
    });
  }
  
  async getAiInsightsForCrypto(cryptocurrencyId: number): Promise<AiInsight[]> {
    return Array.from(this.aiInsights.values())
      .filter(insight => insight.cryptocurrencyId === cryptocurrencyId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }
  
  async createAiInsight(insertInsight: InsertAiInsight): Promise<AiInsight> {
    const id = this.insightCurrentId++;
    const insight: AiInsight = { 
      ...insertInsight, 
      id, 
      createdAt: new Date() 
    };
    this.aiInsights.set(id, insight);
    return insight;
  }
  
  // Crawler Status methods
  async getCrawlerStatus(): Promise<CrawlerStatus | undefined> {
    return this.crawlerStatus;
  }
  
  async updateCrawlerStatus(data: Partial<InsertCrawlerStatus>): Promise<CrawlerStatus | undefined> {
    if (!this.crawlerStatus) {
      return undefined;
    }
    
    this.crawlerStatus = { 
      ...this.crawlerStatus, 
      ...data, 
      lastUpdate: new Date() 
    };
    
    return this.crawlerStatus;
  }
  
  // Comparison method
  async compareCryptocurrencies(ids: number[]): Promise<Cryptocurrency[]> {
    return ids
      .map(id => this.cryptocurrencies.get(id))
      .filter((crypto): crypto is Cryptocurrency => crypto !== undefined);
  }
  
  // Search method
  async searchCryptocurrencies(query: string): Promise<Cryptocurrency[]> {
    const lowerQuery = query.toLowerCase();
    
    return Array.from(this.cryptocurrencies.values())
      .filter(crypto => 
        crypto.name.toLowerCase().includes(lowerQuery) || 
        crypto.symbol.toLowerCase().includes(lowerQuery)
      )
      .slice(0, 10);
  }
  
  // Autocomplete for prefix-based search
  async autocompleteCryptocurrencies(prefix: string, limit: number = 10): Promise<Cryptocurrency[]> {
    const lowerPrefix = prefix.toLowerCase();
    const cryptos = Array.from(this.cryptocurrencies.values());
    
    // First prioritize exact matches at the beginning of names/symbols
    const exactMatches = cryptos.filter(crypto => 
      crypto.name.toLowerCase().startsWith(lowerPrefix) || 
      crypto.symbol.toLowerCase().startsWith(lowerPrefix)
    );
    
    // Then add matches that contain the prefix elsewhere
    const partialMatches = cryptos.filter(crypto => 
      !exactMatches.includes(crypto) && (
        crypto.name.toLowerCase().includes(lowerPrefix) || 
        crypto.symbol.toLowerCase().includes(lowerPrefix)
      )
    );
    
    // Sort by rank for more relevant results
    const sortedResults = [...exactMatches, ...partialMatches]
      .sort((a, b) => (a.rank || Infinity) - (b.rank || Infinity));
    
    return sortedResults.slice(0, limit);
  }
  
  async cleanupFakeData(): Promise<{ removedCount: number, remainingCount: number }> {
    console.log("Starting fake data cleanup in MemStorage...");
    
    // Get count before cleanup
    const beforeCount = this.cryptocurrencies.size;
    
    // Find suspicious entries
    const idsToRemove: number[] = [];
    
    // Use Array.from instead of for...of with iterator
    Array.from(this.cryptocurrencies.values()).forEach(crypto => {
      // Check for suspicious fake data patterns
      const isSuspicious = 
        // No market data
        (!crypto.marketCap && !crypto.price) || 
        // Suspicious naming patterns
        (crypto.name.match(/Crypto\s*\d+/) !== null) || 
        (crypto.name.match(/Token\s*\d+/) !== null) || 
        (crypto.name.match(/Coin\s*\d+/) !== null) ||
        // Rank beyond our target range
        (crypto.rank && crypto.rank > 500);
      
      if (isSuspicious) {
        idsToRemove.push(crypto.id);
      }
    });
    
    // Remove suspicious entries (Array.forEach instead of for...of)
    idsToRemove.forEach(id => {
      this.cryptocurrencies.delete(id);
    });
    
    // Keep only top 500 if we still have more than 500
    if (this.cryptocurrencies.size > 500) {
      // Sort cryptocurrencies by rank and last updated
      const sortedCryptos = Array.from(this.cryptocurrencies.values())
        .sort((a, b) => {
          // Sort by rank first (if both have ranks)
          if (a.rank !== null && b.rank !== null) {
            return (a.rank || Infinity) - (b.rank || Infinity);
          }
          // Sort by lastUpdated if ranks are missing
          return (b.lastUpdated?.getTime() || 0) - (a.lastUpdated?.getTime() || 0);
        });
      
      // Keep only the top 500
      const cryptosToKeep = sortedCryptos.slice(0, 500);
      const idsToKeep = new Set(cryptosToKeep.map(c => c.id));
      
      // Delete all except the ones to keep - using Array.from to avoid iterator issues
      Array.from(this.cryptocurrencies.keys()).forEach(id => {
        if (!idsToKeep.has(id)) {
          this.cryptocurrencies.delete(id);
        }
      });
    }
    
    // Get count after cleanup
    const afterCount = this.cryptocurrencies.size;
    const removedCount = beforeCount - afterCount;
    
    console.log(`Cleanup complete. Removed ${removedCount} fake/irrelevant cryptocurrencies. ${afterCount} real entries remain.`);
    
    return {
      removedCount,
      remainingCount: afterCount
    };
  }
}

import { db } from "./db";
import { eq, and, like, desc, asc } from "drizzle-orm";

// Database Storage implementation
export class DatabaseStorage implements IStorage {
  // Users
  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user || undefined;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(insertUser)
      .returning();
    return user;
  }
  
  // Cryptocurrencies
  async getCryptocurrencies(page: number, limit: number, sort: string, order: string): Promise<{ data: Cryptocurrency[], total: number }> {
    const offset = (page - 1) * limit;
    
    // Determine sort column
    let sortColumn;
    switch (sort) {
      case 'rank':
        sortColumn = cryptocurrencies.rank;
        break;
      case 'price':
        sortColumn = cryptocurrencies.price;
        break;
      case 'marketCap':
        sortColumn = cryptocurrencies.marketCap;
        break;
      case 'volume24h':
        sortColumn = cryptocurrencies.volume24h;
        break;
      case 'priceChange24h':
        sortColumn = cryptocurrencies.priceChange24h;
        break;
      default:
        sortColumn = cryptocurrencies.rank;
    }
    
    // Get total count
    const [countResult] = await db
      .select({ count: sql`COUNT(*)` })
      .from(cryptocurrencies);
    
    // Get data with sorting and pagination
    const data = await db
      .select()
      .from(cryptocurrencies)
      .orderBy(order === 'asc' ? asc(sortColumn) : desc(sortColumn))
      .limit(limit)
      .offset(offset);
    
    return {
      data,
      total: Number(countResult?.count || 0)
    };
  }

  async getCryptocurrency(id: number): Promise<Cryptocurrency | undefined> {
    const [crypto] = await db
      .select()
      .from(cryptocurrencies)
      .where(eq(cryptocurrencies.id, id));
    
    return crypto || undefined;
  }

  async createCryptocurrency(insertCrypto: InsertCryptocurrency): Promise<Cryptocurrency> {
    const [crypto] = await db
      .insert(cryptocurrencies)
      .values(insertCrypto)
      .returning();
    
    return crypto;
  }

  async updateCryptocurrency(id: number, data: Partial<InsertCryptocurrency>): Promise<Cryptocurrency | undefined> {
    const [updated] = await db
      .update(cryptocurrencies)
      .set(data)
      .where(eq(cryptocurrencies.id, id))
      .returning();
    
    return updated || undefined;
  }
  
  // Blockchain Explorers
  async getBlockchainExplorers(cryptocurrencyId: number): Promise<BlockchainExplorer[]> {
    return await db
      .select()
      .from(blockchainExplorers)
      .where(eq(blockchainExplorers.cryptocurrencyId, cryptocurrencyId));
  }

  async getRecentExplorers(limit: number): Promise<(BlockchainExplorer & { cryptocurrencyName: string })[]> {
    const result = await db
      .select({
        ...blockchainExplorers,
        cryptocurrencyName: cryptocurrencies.name
      })
      .from(blockchainExplorers)
      .innerJoin(cryptocurrencies, eq(blockchainExplorers.cryptocurrencyId, cryptocurrencies.id))
      .orderBy(desc(blockchainExplorers.id))
      .limit(limit);
    
    return result;
  }

  async createBlockchainExplorer(insertExplorer: InsertBlockchainExplorer): Promise<BlockchainExplorer> {
    const [explorer] = await db
      .insert(blockchainExplorers)
      .values(insertExplorer)
      .returning();
    
    return explorer;
  }
  
  // Metrics
  async getMetrics(cryptocurrencyId: number): Promise<Metric | undefined> {
    const [metric] = await db
      .select()
      .from(metrics)
      .where(eq(metrics.cryptocurrencyId, cryptocurrencyId));
    
    return metric || undefined;
  }

  async createMetrics(insertMetric: InsertMetric): Promise<Metric> {
    const [metric] = await db
      .insert(metrics)
      .values(insertMetric)
      .returning();
    
    return metric;
  }

  async updateMetrics(id: number, data: Partial<InsertMetric>): Promise<Metric | undefined> {
    const [updated] = await db
      .update(metrics)
      .set(data)
      .where(eq(metrics.id, id))
      .returning();
    
    return updated || undefined;
  }
  
  // AI Insights
  async getAiInsights(limit: number): Promise<(AiInsight & { cryptocurrencyName: string })[]> {
    const result = await db
      .select({
        ...aiInsights,
        cryptocurrencyName: cryptocurrencies.name
      })
      .from(aiInsights)
      .innerJoin(cryptocurrencies, eq(aiInsights.cryptocurrencyId, cryptocurrencies.id))
      .orderBy(desc(aiInsights.id))
      .limit(limit);
    
    return result;
  }

  async getAiInsightsForCrypto(cryptocurrencyId: number): Promise<AiInsight[]> {
    return await db
      .select()
      .from(aiInsights)
      .where(eq(aiInsights.cryptocurrencyId, cryptocurrencyId))
      .orderBy(desc(aiInsights.id));
  }

  async createAiInsight(insertInsight: InsertAiInsight): Promise<AiInsight> {
    const [insight] = await db
      .insert(aiInsights)
      .values(insertInsight)
      .returning();
    
    return insight;
  }
  
  // Crawler Status
  async getCrawlerStatus(): Promise<CrawlerStatus | undefined> {
    const [status] = await db
      .select()
      .from(crawlerStatus)
      .limit(1);
    
    return status || undefined;
  }

  async updateCrawlerStatus(data: Partial<InsertCrawlerStatus>): Promise<CrawlerStatus | undefined> {
    // First check if any status exists
    const existingStatus = await this.getCrawlerStatus();
    
    if (existingStatus) {
      // Update existing status
      const [updated] = await db
        .update(crawlerStatus)
        .set(data)
        .where(eq(crawlerStatus.id, existingStatus.id))
        .returning();
      
      return updated || undefined;
    } else {
      // Create new status
      const insertData: InsertCrawlerStatus = {
        webCrawlerActive: data.webCrawlerActive ?? false,
        aiProcessorActive: data.aiProcessorActive ?? false,
        blockchainSyncActive: data.blockchainSyncActive ?? false,
        lastUpdate: data.lastUpdate ?? new Date(),
        newEntriesCount: data.newEntriesCount ?? 0
      };
      
      const [created] = await db
        .insert(crawlerStatus)
        .values(insertData)
        .returning();
      
      return created;
    }
  }
  
  // Comparison
  async compareCryptocurrencies(ids: number[]): Promise<Cryptocurrency[]> {
    if (ids.length === 0) {
      return [];
    }
    
    return await db
      .select()
      .from(cryptocurrencies)
      .where(inArray(cryptocurrencies.id, ids));
  }
  
  // Search
  async searchCryptocurrencies(query: string): Promise<Cryptocurrency[]> {
    const searchPattern = `%${query}%`;
    
    return await db
      .select()
      .from(cryptocurrencies)
      .where(
        or(
          like(cryptocurrencies.name, searchPattern),
          like(cryptocurrencies.symbol, searchPattern),
          like(cryptocurrencies.slug, searchPattern)
        )
      )
      .limit(20);
  }
  
  async autocompleteCryptocurrencies(prefix: string, limit: number = 10): Promise<Cryptocurrency[]> {
    // Handle empty prefix - return top ranked coins
    if (!prefix) {
      return await db
        .select()
        .from(cryptocurrencies)
        .orderBy(asc(cryptocurrencies.rank))
        .limit(limit);
    }
    
    const prefixPattern = `${prefix}%`;
    const containsPattern = `%${prefix}%`;
    
    // Get all matches in two separate queries for better compatibility
    // 1. First get exact prefix matches (starts with) - highest priority
    const exactPrefixMatches = await db
      .select()
      .from(cryptocurrencies)
      .where(
        or(
          like(cryptocurrencies.name, prefixPattern),
          like(cryptocurrencies.symbol, prefixPattern)
        )
      )
      .orderBy(asc(cryptocurrencies.rank))
      .limit(limit);
    
    // If we have enough prefix matches, return them
    if (exactPrefixMatches.length >= limit) {
      return exactPrefixMatches;
    }
    
    // 2. Then get partial matches (contains) but exclude the ones we already have
    const exactIds = exactPrefixMatches.map(crypto => crypto.id);
    
    const partialMatches = await db
      .select()
      .from(cryptocurrencies)
      .where(
        and(
          or(
            like(cryptocurrencies.name, containsPattern),
            like(cryptocurrencies.symbol, containsPattern),
            like(cryptocurrencies.slug, containsPattern)
          ),
          // Exclude the exact prefix matches we already have
          exactIds.length > 0 
            ? sql`${cryptocurrencies.id} NOT IN (${exactIds.join(',')})` 
            : sql`1=1` // No-op condition when exactIds is empty
        )
      )
      .orderBy(asc(cryptocurrencies.rank))
      .limit(limit - exactPrefixMatches.length);
    
    // Combine results with prefix matches first, then partial matches
    return [...exactPrefixMatches, ...partialMatches];
  }
  
  async cleanupFakeData(): Promise<{ removedCount: number, remainingCount: number }> {
    console.log("Starting fake data cleanup process...");
    
    try {
      // 1. First count all current cryptocurrencies
      const countResult = await db.select({ count: sql`count(*)` }).from(cryptocurrencies);
      const beforeCount = Number(countResult[0].count);
      console.log(`Current database has ${beforeCount} cryptocurrency entries.`);
      
      // 2. Find suspicious entries that are likely fake
      // - Entries without price, marketCap, or volume data
      // - Entries with suspicious naming patterns (like sequential numbers)
      // - Entries that haven't been updated recently from an API
      const threeMonthsAgo = new Date();
      threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
      
      // Use raw SQL for more complex deletion criteria to avoid parameter size limitations
      // Using correct column names (market_cap instead of marketCap) 
      await db.execute(sql`
        DELETE FROM cryptocurrencies 
        WHERE 
          name SIMILAR TO '%(Crypto|Token|Coin)\\s*[0-9]+%'
          OR (market_cap IS NULL AND price IS NULL)
          OR (last_updated < ${threeMonthsAgo.toISOString()})
          OR (rank > 500)
      `);
      
      // 3. Keep only the top 500 cryptocurrencies if we have more than 500
      // Get count after initial cleanup
      const midCountResult = await db.select({ count: sql`count(*)` }).from(cryptocurrencies);
      const midCount = Number(midCountResult[0].count);
      
      if (midCount > 500) {
        console.log(`Still have ${midCount} cryptocurrencies after initial cleanup. Limiting to top 500...`);
        
        // Find IDs of cryptocurrencies to keep (top 500 by rank or recently updated)
        const topCryptos = await db
          .select()
          .from(cryptocurrencies)
          .orderBy(asc(cryptocurrencies.rank), desc(cryptocurrencies.lastUpdated))
          .limit(500);
        
        // Get total count again
        const countBeforeFinal = await db.select({ count: sql`count(*)` }).from(cryptocurrencies);
        const totalBeforeFinal = Number(countBeforeFinal[0].count);
        
        // If we have more than 500, we'll need to trim down
        if (totalBeforeFinal > 500 && topCryptos.length > 0) {
          console.log(`Need to trim down from ${totalBeforeFinal} to 500 cryptocurrencies`);
          
          // Create a temporary table with IDs to keep
          await db.execute(sql`CREATE TEMPORARY TABLE IF NOT EXISTS crypto_ids_to_keep (id INTEGER PRIMARY KEY)`);
          await db.execute(sql`TRUNCATE TABLE crypto_ids_to_keep`);
          
          // Insert in batches to avoid parameter length issues
          const batchSize = 50;
          for (let i = 0; i < topCryptos.length; i += batchSize) {
            const batch = topCryptos.slice(i, i + batchSize);
            const values = batch.map(c => `(${c.id})`).join(',');
            if (values.length > 0) {
              await db.execute(sql`INSERT INTO crypto_ids_to_keep (id) VALUES ${sql.raw(values)}`);
            }
          }
          
          // Delete cryptocurrencies not in the keep list
          await db.execute(sql`DELETE FROM cryptocurrencies WHERE id NOT IN (SELECT id FROM crypto_ids_to_keep)`);
          
          // Drop the temporary table
          await db.execute(sql`DROP TABLE IF EXISTS crypto_ids_to_keep`);
        }
      }
      
      // 4. Get final count to determine how many were removed
      const afterCountResult = await db.select({ count: sql`count(*)` }).from(cryptocurrencies);
      const afterCount = Number(afterCountResult[0].count);
      const removedCount = beforeCount - afterCount;
      
      console.log(`Cleanup complete. Removed ${removedCount} fake/irrelevant cryptocurrencies. ${afterCount} real entries remain.`);
      
      return {
        removedCount,
        remainingCount: afterCount
      };
    } catch (error) {
      console.error("Error cleaning up fake data:", error);
      throw error;
    }
  }
}

// Import necessary functions after defining Database class
import { sql } from "drizzle-orm";
import { inArray, or } from "drizzle-orm";

// Use DatabaseStorage
export const storage = new DatabaseStorage();
