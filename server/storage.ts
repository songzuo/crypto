import { 
  users, type User, type InsertUser,
  cryptocurrencies, type Cryptocurrency, type InsertCryptocurrency,
  blockchainExplorers, type BlockchainExplorer, type InsertBlockchainExplorer,
  metrics, type Metric, type InsertMetric,
  aiInsights, type AiInsight, type InsertAiInsight,
  crawlerStatus, type CrawlerStatus, type InsertCrawlerStatus,
  cryptoNews, type CryptoNews, type InsertCryptoNews,
  volumeToMarketCapRatios, type VolumeToMarketCapRatio, type InsertVolumeToMarketCapRatio,
  volumeToMarketCapBatches, type VolumeToMarketCapBatch, type InsertVolumeToMarketCapBatch,
  technicalAnalysisBatches, type TechnicalAnalysisBatch, type InsertTechnicalAnalysisBatch,
  technicalAnalysisEntries, type TechnicalAnalysisEntry, type InsertTechnicalAnalysisEntry,
  volatilityAnalysisBatches, type VolatilityAnalysisBatch, type InsertVolatilityAnalysisBatch,
  volatilityAnalysisEntries, type VolatilityAnalysisEntry, type InsertVolatilityAnalysisEntry
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
  deleteCryptocurrency(id: number): Promise<boolean>;
  
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
  
  // Enhanced crawler methods for improved parallelism
  getCryptocurrenciesWithExplorers(limit: number): Promise<{ cryptocurrencyId: number, url: string }[]>;
  getCryptocurrenciesWithExplorersNoMetrics(limit: number): Promise<{ cryptocurrencyId: number, url: string }[]>;
  getCryptocurrenciesWithMetrics(limit: number): Promise<number>;
  getRecentlyUpdatedCryptocurrencies(limit: number): Promise<Cryptocurrency[]>;
  
  // Cleanup fake data
  cleanupFakeData(): Promise<{ removedCount: number, remainingCount: number }>;
  
  // Completely purge all cryptocurrency data
  purgeAllCryptoData(): Promise<{ success: boolean, message: string }>;
  
  // Crypto News
  getCryptoNews(page: number, limit: number): Promise<{ data: CryptoNews[], total: number }>;
  createCryptoNews(news: InsertCryptoNews): Promise<CryptoNews>;
  deleteCryptoNews(id: number): Promise<boolean>;
  cleanupOldNews(maxNewsCount: number): Promise<number>;
  
  // 交易量市值比率相关方法
  getVolumeToMarketCapRatios(page: number, limit: number): Promise<{ data: VolumeToMarketCapRatio[], total: number }>;
  getVolumeToMarketCapRatiosByBatchId(batchId: number): Promise<VolumeToMarketCapRatio[]>;
  createVolumeToMarketCapRatio(ratio: InsertVolumeToMarketCapRatio): Promise<VolumeToMarketCapRatio>;
  
  // 交易量市值比率批次相关方法
  getVolumeToMarketCapBatches(page: number, limit: number): Promise<{ data: VolumeToMarketCapBatch[], total: number }>;
  getLatestVolumeToMarketCapBatch(): Promise<VolumeToMarketCapBatch | undefined>;
  getVolumeToMarketCapBatch(id: number): Promise<VolumeToMarketCapBatch | undefined>;
  createVolumeToMarketCapBatch(batch: InsertVolumeToMarketCapBatch): Promise<VolumeToMarketCapBatch>;
  
  // 技术分析批次相关方法
  getTechnicalAnalysisBatches(page: number, limit: number): Promise<{ data: TechnicalAnalysisBatch[], total: number }>;
  getLatestTechnicalAnalysisBatch(): Promise<TechnicalAnalysisBatch | undefined>;
  getTechnicalAnalysisBatch(id: number): Promise<TechnicalAnalysisBatch | undefined>;
  createTechnicalAnalysisBatch(batch: InsertTechnicalAnalysisBatch): Promise<TechnicalAnalysisBatch>;
  
  // 技术分析条目相关方法
  getTechnicalAnalysisResults(signal?: string): Promise<{ batch: TechnicalAnalysisBatch, entries: TechnicalAnalysisEntry[] }>;
  getTechnicalAnalysisResultsByBatchId(batchId: number, signal?: string): Promise<{ batch: TechnicalAnalysisBatch, entries: TechnicalAnalysisEntry[] }>;
  createTechnicalAnalysisEntry(entry: InsertTechnicalAnalysisEntry): Promise<TechnicalAnalysisEntry>;
  
  // 波动性分析批次相关方法
  getVolatilityAnalysisBatches(page: number, limit: number): Promise<{ data: VolatilityAnalysisBatch[], total: number }>;
  getLatestVolatilityAnalysisBatch(timeframe?: string): Promise<VolatilityAnalysisBatch | undefined>;
  getVolatilityAnalysisBatch(id: number): Promise<VolatilityAnalysisBatch | undefined>;
  createVolatilityAnalysisBatch(batch: InsertVolatilityAnalysisBatch): Promise<VolatilityAnalysisBatch>;
  
  // 波动性分析条目相关方法
  getVolatilityAnalysisResults(volatilityDirection?: string, volatilityCategory?: string): Promise<{ batch: VolatilityAnalysisBatch, entries: VolatilityAnalysisEntry[] }>;
  getVolatilityAnalysisResultsByBatchId(batchId: number, volatilityDirection?: string, volatilityCategory?: string): Promise<VolatilityAnalysisEntry[]>;
  createVolatilityAnalysisEntry(entry: InsertVolatilityAnalysisEntry): Promise<VolatilityAnalysisEntry>;
}

export class MemStorage implements IStorage {
  private users: Map<number, User>;
  private cryptocurrencies: Map<number, Cryptocurrency>;
  private blockchainExplorers: Map<number, BlockchainExplorer>;
  private metrics: Map<number, Metric>;
  private aiInsights: Map<number, AiInsight>;
  private cryptoNews: Map<number, CryptoNews>;
  private crawlerStatus: CrawlerStatus | undefined;
  private volumeToMarketCapRatios: Map<number, VolumeToMarketCapRatio>;
  private volumeToMarketCapBatches: Map<number, VolumeToMarketCapBatch>;
  
  userCurrentId: number;
  cryptoCurrentId: number;
  explorerCurrentId: number;
  metricCurrentId: number;
  insightCurrentId: number;
  newsCurrentId: number;
  ratioCurrentId: number;
  batchCurrentId: number;
  
  constructor() {
    this.users = new Map();
    this.cryptocurrencies = new Map();
    this.blockchainExplorers = new Map();
    this.metrics = new Map();
    this.aiInsights = new Map();
    this.cryptoNews = new Map();
    this.volumeToMarketCapRatios = new Map();
    this.volumeToMarketCapBatches = new Map();
    
    this.userCurrentId = 1;
    this.cryptoCurrentId = 1;
    this.explorerCurrentId = 1;
    this.metricCurrentId = 1;
    this.insightCurrentId = 1;
    this.newsCurrentId = 1;
    this.ratioCurrentId = 1;
    this.batchCurrentId = 1;
    
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

  // Implementation of purgeAllCryptoData for MemStorage
  async purgeAllCryptoData(): Promise<{ success: boolean, message: string }> {
    try {
      console.log("Purging all cryptocurrency data from memory storage...");
      
      // Count before purge
      const countBefore = this.cryptocurrencies.size;
      
      // Clear all cryptocurrency-related data
      this.cryptocurrencies.clear();
      this.blockchainExplorers.clear();
      this.metrics.clear();
      this.aiInsights.clear();
      
      // Reset IDs
      this.cryptoCurrentId = 1;
      this.explorerCurrentId = 1;
      this.metricCurrentId = 1;
      this.insightCurrentId = 1;
      
      console.log(`All cryptocurrency data has been purged. Removed ${countBefore} cryptocurrencies and related data.`);
      
      return {
        success: true,
        message: `All cryptocurrency data has been purged from the database.`
      };
    } catch (error) {
      console.error("Failed to purge cryptocurrency data:", error);
      return {
        success: false,
        message: `Failed to purge cryptocurrency data: ${(error as Error).message}`
      };
    }
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
  
  async getCryptocurrenciesWithExplorers(limit: number): Promise<{ cryptocurrencyId: number, url: string }[]> {
    const results: { cryptocurrencyId: number, url: string }[] = [];
    
    // Check all cryptocurrencies to find those with explorers
    for (const crypto of this.cryptocurrencies.values()) {
      // Get explorers for this cryptocurrency
      const explorers = await this.getBlockchainExplorers(crypto.id);
      
      // If there's at least one explorer, add it to the results
      if (explorers && explorers.length > 0) {
        results.push({
          cryptocurrencyId: crypto.id,
          url: explorers[0].url
        });
        
        // If we've reached the limit, stop
        if (results.length >= limit) {
          break;
        }
      }
    }
    
    return results;
  }
  
  async getCryptocurrenciesWithExplorersNoMetrics(limit: number): Promise<{ cryptocurrencyId: number, url: string }[]> {
    const results: { cryptocurrencyId: number, url: string }[] = [];
    
    // 1. 获取所有带有区块链浏览器的加密货币
    const allWithExplorers = await this.getCryptocurrenciesWithExplorers(500); // 获取足够多
    
    // 2. 对于每个加密货币，检查是否已有指标数据
    for (const item of allWithExplorers) {
      const hasMetrics = await this.getMetrics(item.cryptocurrencyId);
      
      // 3. 如果没有指标数据，添加到结果中
      if (!hasMetrics) {
        results.push(item);
        
        // 如果我们已经达到限制，停止
        if (results.length >= limit) {
          break;
        }
      }
    }
    
    return results;
  }
  
  async getCryptocurrenciesWithMetrics(limit: number): Promise<number> {
    // Count cryptocurrencies that have metrics
    let count = 0;
    
    // Check all cryptocurrencies
    for (const crypto of this.cryptocurrencies.values()) {
      // Check if this cryptocurrency has metrics
      const metrics = await this.getMetrics(crypto.id);
      
      // If it has metrics, increment the count
      if (metrics) {
        count++;
        
        // If we've reached the limit and limit is greater than 0, stop
        if (limit > 0 && count >= limit) {
          break;
        }
      }
    }
    
    return count;
  }
  
  async getRecentlyUpdatedCryptocurrencies(limit: number): Promise<Cryptocurrency[]> {
    // Get cryptocurrencies sorted by lastUpdated
    const cryptos = Array.from(this.cryptocurrencies.values());
    
    // Sort by lastUpdated in descending order (most recent first)
    const sortedCryptos = cryptos.sort((a, b) => {
      const aDate = a.lastUpdated ? new Date(a.lastUpdated).getTime() : 0;
      const bDate = b.lastUpdated ? new Date(b.lastUpdated).getTime() : 0;
      return bDate - aDate;
    });
    
    // Return the first 'limit' cryptocurrencies
    return sortedCryptos.slice(0, limit);
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
  
  // Crypto News Methods
  async getCryptoNews(page: number, limit: number): Promise<{ data: CryptoNews[], total: number }> {
    const offset = (page - 1) * limit;
    const allNews = Array.from(this.cryptoNews.values())
      .sort((a, b) => (b.fetchedAt?.getTime() || 0) - (a.fetchedAt?.getTime() || 0));
    
    return {
      data: allNews.slice(offset, offset + limit),
      total: allNews.length
    };
  }
  
  async createCryptoNews(news: InsertCryptoNews): Promise<CryptoNews> {
    const id = this.newsCurrentId++;
    const createdNews: CryptoNews = {
      ...news,
      id,
      fetchedAt: new Date()
    };
    
    this.cryptoNews.set(id, createdNews);
    return createdNews;
  }
  
  async deleteCryptoNews(id: number): Promise<boolean> {
    return this.cryptoNews.delete(id);
  }
  
  async cleanupOldNews(maxNewsCount: number): Promise<number> {
    console.log(`检查内存中新闻数量: 当前 ${this.cryptoNews.size} 条，最大允许 ${maxNewsCount} 条`);
    
    if (this.cryptoNews.size <= maxNewsCount) {
      console.log(`当前新闻数量 ${this.cryptoNews.size} 未超过最大限制 ${maxNewsCount}，无需清理`);
      return 0;
    }
    
    const allNews = Array.from(this.cryptoNews.values())
      .sort((a, b) => (a.fetchedAt?.getTime() || 0) - (b.fetchedAt?.getTime() || 0));
    
    const deleteCount = this.cryptoNews.size - maxNewsCount;
    console.log(`需要删除 ${deleteCount} 条旧新闻`);
    
    const toDelete = allNews.slice(0, deleteCount);
    
    for (const news of toDelete) {
      this.cryptoNews.delete(news.id);
    }
    
    console.log(`已删除 ${toDelete.length} 条旧新闻，保持在 ${maxNewsCount} 条限制之内`);
    return toDelete.length;
  }
  
  // Missing method required by IStorage
  async deleteCryptocurrency(id: number): Promise<boolean> {
    return this.cryptocurrencies.delete(id);
  }
  
  // 交易量市值比率相关方法
  async getVolumeToMarketCapRatios(page: number, limit: number): Promise<{ data: VolumeToMarketCapRatio[], total: number }> {
    const offset = (page - 1) * limit;
    const allRatios = Array.from(this.volumeToMarketCapRatios.values())
      .sort((a, b) => a.rank - b.rank);
    
    return {
      data: allRatios.slice(offset, offset + limit),
      total: allRatios.length
    };
  }

  async getVolumeToMarketCapRatiosByBatchId(batchId: number): Promise<VolumeToMarketCapRatio[]> {
    return Array.from(this.volumeToMarketCapRatios.values())
      .filter(ratio => ratio.batchId === batchId)
      .sort((a, b) => a.rank - b.rank);
  }

  async createVolumeToMarketCapRatio(insertRatio: InsertVolumeToMarketCapRatio): Promise<VolumeToMarketCapRatio> {
    const id = this.ratioCurrentId++;
    const createdAt = new Date();
    
    const ratio: VolumeToMarketCapRatio = {
      id,
      cryptocurrencyId: insertRatio.cryptocurrencyId,
      name: insertRatio.name,
      symbol: insertRatio.symbol,
      volume7d: insertRatio.volume7d,
      marketCap: insertRatio.marketCap,
      volumeToMarketCapRatio: insertRatio.volumeToMarketCapRatio,
      includesFutures: insertRatio.includesFutures,
      rank: insertRatio.rank,
      batchId: insertRatio.batchId,
      createdAt
    };
    
    this.volumeToMarketCapRatios.set(id, ratio);
    return ratio;
  }
  
  // 交易量市值比率批次相关方法
  async getVolumeToMarketCapBatches(page: number, limit: number): Promise<{ data: VolumeToMarketCapBatch[], total: number }> {
    const offset = (page - 1) * limit;
    const allBatches = Array.from(this.volumeToMarketCapBatches.values())
      .sort((a, b) => (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0));
    
    return {
      data: allBatches.slice(offset, offset + limit),
      total: allBatches.length
    };
  }

  async getLatestVolumeToMarketCapBatch(): Promise<VolumeToMarketCapBatch | undefined> {
    const allBatches = Array.from(this.volumeToMarketCapBatches.values())
      .sort((a, b) => (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0));
    
    return allBatches.length > 0 ? allBatches[0] : undefined;
  }

  async getVolumeToMarketCapBatch(id: number): Promise<VolumeToMarketCapBatch | undefined> {
    return this.volumeToMarketCapBatches.get(id);
  }

  async createVolumeToMarketCapBatch(insertBatch: InsertVolumeToMarketCapBatch): Promise<VolumeToMarketCapBatch> {
    const id = this.batchCurrentId++;
    const createdAt = new Date();
    
    const batch: VolumeToMarketCapBatch = {
      id,
      entriesCount: insertBatch.entriesCount,
      hasChanges: insertBatch.hasChanges,
      previousBatchId: insertBatch.previousBatchId,
      createdAt
    };
    
    this.volumeToMarketCapBatches.set(id, batch);
    return batch;
  }
}

import { db } from "./db";
import { eq, and, like, desc, asc, sql } from "drizzle-orm";

// Database Storage implementation
export class DatabaseStorage implements IStorage {
  // 技术分析批次相关方法
  async getTechnicalAnalysisBatches(page: number, limit: number): Promise<{ data: TechnicalAnalysisBatch[], total: number }> {
    try {
      const offset = (page - 1) * limit;
      
      const batches = await db
        .select()
        .from(technicalAnalysisBatches)
        .orderBy(desc(technicalAnalysisBatches.createdAt))
        .limit(limit)
        .offset(offset);
      
      // 获取批次总数
      const countResult = await db
        .select({
          value: sql`count(${technicalAnalysisBatches.id})`
        })
        .from(technicalAnalysisBatches);
        
      const total = countResult[0] ? Number(countResult[0].value) || 0 : 0;
        
      return {
        data: batches,
        total
      };
    } catch (error) {
      console.error("获取技术分析批次列表时出错:", error);
      return { data: [], total: 0 };
    }
  }
  
  // 获取最新的技术分析批次
  async getLatestTechnicalAnalysisBatch(): Promise<TechnicalAnalysisBatch | undefined> {
    try {
      const [batch] = await db
        .select()
        .from(technicalAnalysisBatches)
        .orderBy(desc(technicalAnalysisBatches.createdAt))
        .limit(1);
      
      return batch;
    } catch (error) {
      console.error("获取最新技术分析批次时出错:", error);
      return undefined;
    }
  }
  
  // 获取指定ID的技术分析批次
  async getTechnicalAnalysisBatch(id: number): Promise<TechnicalAnalysisBatch | undefined> {
    try {
      const [batch] = await db
        .select()
        .from(technicalAnalysisBatches)
        .where(eq(technicalAnalysisBatches.id, id));
      
      return batch;
    } catch (error) {
      console.error(`获取技术分析批次${id}时出错:`, error);
      return undefined;
    }
  }
  
  // 创建技术分析批次
  async createTechnicalAnalysisBatch(insertBatch: InsertTechnicalAnalysisBatch): Promise<TechnicalAnalysisBatch> {
    try {
      const [batch] = await db
        .insert(technicalAnalysisBatches)
        .values(insertBatch)
        .returning();
      
      return batch;
    } catch (error) {
      console.error("创建技术分析批次时出错:", error);
      throw error;
    }
  }
  
  // 技术分析结果相关方法
  // 获取最新的技术分析结果
  async getTechnicalAnalysisResults(signal?: string): Promise<{ batch: TechnicalAnalysisBatch, entries: TechnicalAnalysisEntry[] }> {
    try {
      // 获取最新批次
      const batch = await this.getLatestTechnicalAnalysisBatch();
      
      if (!batch) {
        return { batch: {} as TechnicalAnalysisBatch, entries: [] };
      }
      
      // 获取该批次的分析结果
      return this.getTechnicalAnalysisResultsByBatchId(batch.id, signal);
    } catch (error) {
      console.error("获取最新技术分析结果时出错:", error);
      return { batch: {} as TechnicalAnalysisBatch, entries: [] };
    }
  }
  
  // 获取指定批次的技术分析结果
  async getTechnicalAnalysisResultsByBatchId(batchId: number, signal?: string): Promise<{ batch: TechnicalAnalysisBatch, entries: TechnicalAnalysisEntry[] }> {
    try {
      // 获取批次信息
      const batch = await this.getTechnicalAnalysisBatch(batchId);
      
      if (!batch) {
        return { batch: {} as TechnicalAnalysisBatch, entries: [] };
      }
      
      // 构建查询条件
      let conditions = [eq(technicalAnalysisEntries.batchId, batchId)];
      
      // 如果指定了信号类型，添加过滤条件
      if (signal) {
        if (signal === 'any_buy') {
          conditions.push(sql`${technicalAnalysisEntries.combinedSignal} IN ('buy', 'strong_buy')`);
        } else if (signal === 'any_sell') {
          conditions.push(sql`${technicalAnalysisEntries.combinedSignal} IN ('sell', 'strong_sell')`);
        } else if (signal !== 'all') {
          conditions.push(eq(technicalAnalysisEntries.combinedSignal, signal));
        }
      }
      
      // 使用and组合所有条件
      let query = db
        .select()
        .from(technicalAnalysisEntries)
        .where(and(...conditions));
      
      // 按信号强度排序
      const entries = await query.orderBy(desc(technicalAnalysisEntries.signalStrength));
      
      return { batch, entries };
    } catch (error) {
      console.error(`获取批次${batchId}的技术分析结果时出错:`, error);
      return { batch: {} as TechnicalAnalysisBatch, entries: [] };
    }
  }
  
  // 创建技术分析结果条目
  async createTechnicalAnalysisEntry(entry: InsertTechnicalAnalysisEntry): Promise<TechnicalAnalysisEntry> {
    try {
      const [result] = await db
        .insert(technicalAnalysisEntries)
        .values(entry)
        .returning();
      
      return result;
    } catch (error) {
      console.error("创建技术分析结果条目时出错:", error);
      throw error;
    }
  }
  async deleteCryptocurrency(id: number): Promise<boolean> {
    try {
      // 1. 先删除相关的区块链浏览器记录
      await db
        .delete(blockchainExplorers)
        .where(eq(blockchainExplorers.cryptocurrencyId, id));
      
      // 2. 删除相关的指标记录
      await db
        .delete(metrics)
        .where(eq(metrics.cryptocurrencyId, id));
      
      // 3. 删除相关的AI洞察记录
      await db
        .delete(aiInsights)
        .where(eq(aiInsights.cryptocurrencyId, id));
      
      // 4. 最后删除加密货币记录
      const result = await db
        .delete(cryptocurrencies)
        .where(eq(cryptocurrencies.id, id));
      
      console.log(`成功彻底删除币种ID ${id} 及其所有相关数据`);
      return true;
    } catch (error) {
      console.error(`删除币种ID ${id} 时出错:`, error);
      return false;
    }
  }
  
  async getCryptocurrenciesWithExplorers(limit: number): Promise<{ cryptocurrencyId: number, url: string }[]> {
    try {
      // Get cryptocurrencies with existing blockchain explorers
      const results = await db.select({
        cryptocurrencyId: blockchainExplorers.cryptocurrencyId,
        url: blockchainExplorers.url
      })
      .from(blockchainExplorers)
      .limit(limit);
      
      return results;
    } catch (error) {
      console.error("Error getting cryptocurrencies with explorers:", error);
      return [];
    }
  }
  
  async getCryptocurrenciesWithExplorersNoMetrics(limit: number): Promise<{ cryptocurrencyId: number, url: string }[]> {
    try {
      // 使用 SQL 查询获取具有区块链浏览器但没有指标数据的加密货币
      // 这使用 NOT EXISTS 子查询来检查 metrics 表中不存在匹配的记录
      const results = await db.execute<{ cryptocurrencyId: number, url: string }>(sql`
        SELECT 
          be.cryptocurrency_id as "cryptocurrencyId", 
          be.url as "url"
        FROM 
          blockchain_explorers be
        WHERE 
          NOT EXISTS (
            SELECT 1 FROM metrics m 
            WHERE m.cryptocurrency_id = be.cryptocurrency_id
          )
        LIMIT ${limit}
      `);
      
      return results.rows;
    } catch (error) {
      console.error("Error getting cryptocurrencies with explorers but no metrics:", error);
      return [];
    }
  }
  
  async getCryptocurrenciesWithMetrics(limit: number): Promise<number> {
    try {
      // Count cryptocurrencies with metrics
      const result = await db.select({ count: sql`count(DISTINCT cryptocurrency_id)` })
        .from(metrics);
      
      // Return the count
      return Number(result[0].count);
    } catch (error) {
      console.error("Error counting cryptocurrencies with metrics:", error);
      return 0;
    }
  }
  
  async getRecentlyUpdatedCryptocurrencies(limit: number): Promise<Cryptocurrency[]> {
    try {
      // Get most recently updated cryptocurrencies (using lastUpdated field)
      const results = await db.select()
        .from(cryptocurrencies)
        .orderBy(desc(cryptocurrencies.lastUpdated))
        .limit(limit);
      
      return results;
    } catch (error) {
      console.error("Error getting recently updated cryptocurrencies:", error);
      return [];
    }
  }
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
  
  // Completely purge all cryptocurrency data
  async purgeAllCryptoData(): Promise<{ success: boolean, message: string }> {
    try {
      console.log("Purging all cryptocurrency data from database...");
      
      // Delete from ai_insights first (has foreign key constraints)
      await db.execute(sql`DELETE FROM ai_insights`);
      
      // Delete from metrics
      await db.execute(sql`DELETE FROM metrics`);
      
      // Delete from blockchain_explorers
      await db.execute(sql`DELETE FROM blockchain_explorers`);
      
      // Finally delete from cryptocurrencies
      await db.execute(sql`DELETE FROM cryptocurrencies`);
      
      // Reset sequence for primary keys (optional, but helps keep IDs consistent)
      await db.execute(sql`ALTER SEQUENCE cryptocurrencies_id_seq RESTART WITH 1`);
      await db.execute(sql`ALTER SEQUENCE blockchain_explorers_id_seq RESTART WITH 1`);
      await db.execute(sql`ALTER SEQUENCE metrics_id_seq RESTART WITH 1`);
      await db.execute(sql`ALTER SEQUENCE ai_insights_id_seq RESTART WITH 1`);
      
      console.log("All cryptocurrency data has been successfully purged from the database.");
      
      return {
        success: true,
        message: "All cryptocurrency data has been purged from the database."
      };
    } catch (error) {
      console.error("Error purging cryptocurrency data:", error);
      return {
        success: false,
        message: `Failed to purge data: ${(error as Error).message}`
      };
    }
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
  // Crypto News Methods
  async getCryptoNews(page: number, limit: number): Promise<{ data: CryptoNews[], total: number }> {
    const offset = (page - 1) * limit;
    
    const newsQuery = await db
      .select()
      .from(cryptoNews)
      .orderBy(desc(cryptoNews.fetchedAt))
      .limit(limit)
      .offset(offset);
    
    const countQuery = await db
      .select({ count: sql<number>`count(*)` })
      .from(cryptoNews);
    
    return {
      data: newsQuery,
      total: countQuery[0].count
    };
  }
  
  async createCryptoNews(news: InsertCryptoNews): Promise<CryptoNews> {
    const [result] = await db
      .insert(cryptoNews)
      .values(news)
      .returning();
    
    return result;
  }
  
  async deleteCryptoNews(id: number): Promise<boolean> {
    try {
      await db.delete(cryptoNews).where(eq(cryptoNews.id, id));
      return true;
    } catch (e) {
      console.error('Error deleting crypto news:', e);
      return false;
    }
  }
  
  async cleanupOldNews(maxNewsCount: number): Promise<number> {
    try {
      // 获取当前新闻总数
      const countResult = await db
        .select({ count: sql<number>`count(*)` })
        .from(cryptoNews);
      
      const currentCount = countResult[0].count;
      
      // 确保使用传入的maxNewsCount（400）而不是固定值
      console.log(`检查新闻数量: 当前 ${currentCount} 条，最大允许 ${maxNewsCount} 条`);
      
      // 如果当前新闻数量超过最大限制
      if (currentCount > maxNewsCount) {
        // 计算需要删除的数量
        const deleteCount = currentCount - maxNewsCount;
        console.log(`需要删除 ${deleteCount} 条旧新闻`);
        
        // 获取最旧的新闻ID列表
        const oldestNews = await db
          .select()
          .from(cryptoNews)
          .orderBy(asc(cryptoNews.fetchedAt))
          .limit(deleteCount);
        
        // 如果有需要删除的新闻
        if (oldestNews.length > 0) {
          const oldestIds = oldestNews.map(news => news.id);
          
          // 删除这些旧新闻
          await db
            .delete(cryptoNews)
            .where(inArray(cryptoNews.id, oldestIds));
          
          console.log(`已删除 ${oldestIds.length} 条旧新闻，保持在 ${maxNewsCount} 条限制之内`);
          return oldestIds.length;
        }
      } else {
        console.log(`当前新闻数量 ${currentCount} 未超过最大限制 ${maxNewsCount}，无需清理`);
      }
      
      return 0; // 没有需要删除的新闻
    } catch (e) {
      console.error('Error cleaning up old news:', e);
      return 0;
    }
  }
  
  // 交易量市值比率相关方法
  async getVolumeToMarketCapRatios(page: number, limit: number): Promise<{ data: VolumeToMarketCapRatio[], total: number }> {
    try {
      // 获取最新批次ID
      const batches = await db
        .select()
        .from(volumeToMarketCapBatches)
        .orderBy(desc(volumeToMarketCapBatches.createdAt))
        .limit(1);
      
      const latestBatchId = batches.length > 0 ? batches[0].id : null;
      if (!latestBatchId) {
        return { data: [], total: 0 };
      }
      
      const offset = (page - 1) * limit;
      
      // 选择最新批次中的数据，按交易量市值比率降序排序
      const ratiosQuery = await db
        .select()
        .from(volumeToMarketCapRatios)
        .where(eq(volumeToMarketCapRatios.batchId, latestBatchId))
        .orderBy(desc(volumeToMarketCapRatios.volumeToMarketCapRatio))
        .limit(limit)
        .offset(offset);
      
      // 计算最新批次中的总记录数
      const countQuery = await db
        .select({ count: sql<number>`count(*)` })
        .from(volumeToMarketCapRatios)
        .where(eq(volumeToMarketCapRatios.batchId, latestBatchId));
      
      return {
        data: ratiosQuery,
        total: countQuery[0].count
      };
    } catch (error) {
      console.error('Error fetching volume to market cap ratios:', error);
      return { data: [], total: 0 };
    }
  }

  async getVolumeToMarketCapRatiosByBatchId(batchId: number): Promise<VolumeToMarketCapRatio[]> {
    try {
      const ratiosQuery = await db
        .select()
        .from(volumeToMarketCapRatios)
        .where(eq(volumeToMarketCapRatios.batchId, batchId))
        .orderBy(desc(volumeToMarketCapRatios.volumeToMarketCapRatio));
      
      return ratiosQuery;
    } catch (error) {
      console.error('Error fetching volume to market cap ratios by batch ID:', error);
      return [];
    }
  }

  async createVolumeToMarketCapRatio(insertRatio: InsertVolumeToMarketCapRatio): Promise<VolumeToMarketCapRatio> {
    try {
      const [ratio] = await db
        .insert(volumeToMarketCapRatios)
        .values(insertRatio)
        .returning();
        
      return ratio;
    } catch (error) {
      console.error('Error creating volume to market cap ratio:', error);
      throw error;
    }
  }
  
  // 交易量市值比率批次相关方法
  async getVolumeToMarketCapBatches(page: number, limit: number): Promise<{ data: VolumeToMarketCapBatch[], total: number }> {
    try {
      const offset = (page - 1) * limit;
      
      const batchesQuery = await db
        .select()
        .from(volumeToMarketCapBatches)
        .orderBy(desc(volumeToMarketCapBatches.createdAt))
        .limit(limit)
        .offset(offset);
      
      const countQuery = await db
        .select({ count: sql<number>`count(*)` })
        .from(volumeToMarketCapBatches);
      
      return {
        data: batchesQuery,
        total: countQuery[0].count
      };
    } catch (error) {
      console.error('Error fetching volume to market cap batches:', error);
      return { data: [], total: 0 };
    }
  }

  async getLatestVolumeToMarketCapBatch(): Promise<VolumeToMarketCapBatch | undefined> {
    try {
      const [batch] = await db
        .select()
        .from(volumeToMarketCapBatches)
        .orderBy(desc(volumeToMarketCapBatches.createdAt))
        .limit(1);
      
      return batch;
    } catch (error) {
      console.error('Error fetching latest volume to market cap batch:', error);
      return undefined;
    }
  }

  async getVolumeToMarketCapBatch(id: number): Promise<VolumeToMarketCapBatch | undefined> {
    try {
      const [batch] = await db
        .select()
        .from(volumeToMarketCapBatches)
        .where(eq(volumeToMarketCapBatches.id, id))
        .limit(1);
      
      return batch;
    } catch (error) {
      console.error('Error fetching volume to market cap batch by ID:', error);
      return undefined;
    }
  }

  async createVolumeToMarketCapBatch(insertBatch: InsertVolumeToMarketCapBatch): Promise<VolumeToMarketCapBatch> {
    try {
      const [batch] = await db
        .insert(volumeToMarketCapBatches)
        .values(insertBatch)
        .returning();
        
      return batch;
    } catch (error) {
      console.error('Error creating volume to market cap batch:', error);
      throw error;
    }
  }

  // 波动性分析批次相关方法
  async getVolatilityAnalysisBatches(page: number, limit: number): Promise<{ data: VolatilityAnalysisBatch[], total: number }> {
    try {
      const offset = (page - 1) * limit;
      
      const batchesQuery = await db
        .select()
        .from(volatilityAnalysisBatches)
        .orderBy(desc(volatilityAnalysisBatches.createdAt))
        .limit(limit)
        .offset(offset);
      
      const countQuery = await db
        .select({ count: sql<number>`count(*)` })
        .from(volatilityAnalysisBatches);
      
      return {
        data: batchesQuery,
        total: countQuery[0].count
      };
    } catch (error) {
      console.error('Error fetching volatility analysis batches:', error);
      return { data: [], total: 0 };
    }
  }

  async getLatestVolatilityAnalysisBatch(): Promise<VolatilityAnalysisBatch | undefined> {
    try {
      const [batch] = await db
        .select()
        .from(volatilityAnalysisBatches)
        .orderBy(desc(volatilityAnalysisBatches.createdAt))
        .limit(1);
      
      return batch;
    } catch (error) {
      console.error('Error fetching latest volatility analysis batch:', error);
      return undefined;
    }
  }

  async getVolatilityAnalysisBatch(id: number): Promise<VolatilityAnalysisBatch | undefined> {
    try {
      const [batch] = await db
        .select()
        .from(volatilityAnalysisBatches)
        .where(eq(volatilityAnalysisBatches.id, id))
        .limit(1);
      
      return batch;
    } catch (error) {
      console.error('Error fetching volatility analysis batch by ID:', error);
      return undefined;
    }
  }

  async createVolatilityAnalysisBatch(batch: InsertVolatilityAnalysisBatch): Promise<VolatilityAnalysisBatch> {
    try {
      const [result] = await db
        .insert(volatilityAnalysisBatches)
        .values(batch)
        .returning();
        
      return result;
    } catch (error) {
      console.error('Error creating volatility analysis batch:', error);
      throw error;
    }
  }

  // 波动性分析条目相关方法
  async getVolatilityAnalysisResults(volatilityDirection?: string, volatilityCategory?: string): Promise<{ batch: VolatilityAnalysisBatch, entries: VolatilityAnalysisEntry[] }> {
    const latestBatch = await this.getLatestVolatilityAnalysisBatch();
    if (!latestBatch) {
      return { batch: {} as VolatilityAnalysisBatch, entries: [] };
    }

    const entries = await this.getVolatilityAnalysisResultsByBatchId(latestBatch.id, volatilityDirection, volatilityCategory);
    return { batch: latestBatch, entries };
  }

  async getVolatilityAnalysisResultsByBatchId(batchId: number, volatilityDirection?: string, volatilityCategory?: string): Promise<VolatilityAnalysisEntry[]> {
    try {
      let query = db.select()
        .from(volatilityAnalysisEntries)
        .where(eq(volatilityAnalysisEntries.batchId, batchId));

      if (volatilityDirection) {
        query = query.where(eq(volatilityAnalysisEntries.volatilityDirection, volatilityDirection));
      }

      if (volatilityCategory) {
        query = query.where(eq(volatilityAnalysisEntries.volatilityCategory, volatilityCategory));
      }

      return await query.orderBy(asc(volatilityAnalysisEntries.volatilityRank));
    } catch (error) {
      console.error('Error fetching volatility analysis results:', error);
      return [];
    }
  }

  async createVolatilityAnalysisEntry(entry: InsertVolatilityAnalysisEntry): Promise<VolatilityAnalysisEntry> {
    try {
      const [result] = await db
        .insert(volatilityAnalysisEntries)
        .values(entry)
        .returning();
        
      return result;
    } catch (error) {
      console.error('Error creating volatility analysis entry:', error);
      throw error;
    }
  }
}

// Import necessary functions after defining Database class
import { sql } from "drizzle-orm";
import { inArray, or, eq, desc, asc } from "drizzle-orm";

// Use DatabaseStorage
export const storage = new DatabaseStorage();
