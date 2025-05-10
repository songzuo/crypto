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
}

export const storage = new MemStorage();
