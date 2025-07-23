import { pgTable, text, serial, integer, boolean, timestamp, jsonb, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { relations } from "drizzle-orm";

// Users table (inherited from template, keeping it)
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

// Cryptocurrency table
export const cryptocurrencies = pgTable("cryptocurrencies", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  symbol: text("symbol").notNull(),
  slug: text("slug").notNull(),
  marketCap: real("market_cap"),
  price: real("price"),
  volume24h: real("volume_24h"),
  priceChange24h: real("price_change_24h"),
  rank: integer("rank"),
  officialWebsite: text("official_website"),
  logoUrl: text("logo_url"),
  lastUpdated: timestamp("last_updated").defaultNow(),
});

export const insertCryptocurrencySchema = createInsertSchema(cryptocurrencies).omit({
  id: true,
  lastUpdated: true,
});

export type InsertCryptocurrency = z.infer<typeof insertCryptocurrencySchema>;
export type Cryptocurrency = typeof cryptocurrencies.$inferSelect;

// Define cryptocurrency relations
export const cryptocurrenciesRelations = relations(cryptocurrencies, ({ many }) => ({
  blockchainExplorers: many(blockchainExplorers),
  metrics: many(metrics),
  aiInsights: many(aiInsights),
  volumeToMarketCapRatios: many(volumeToMarketCapRatios)
}));

// Blockchain Explorer table
export const blockchainExplorers = pgTable("blockchain_explorers", {
  id: serial("id").primaryKey(),
  cryptocurrencyId: integer("cryptocurrency_id").notNull(),
  url: text("url").notNull(),
  name: text("name").notNull(),
  lastFetched: timestamp("last_fetched").defaultNow(),
});

export const insertBlockchainExplorerSchema = createInsertSchema(blockchainExplorers).omit({
  id: true,
  lastFetched: true,
});

export type InsertBlockchainExplorer = z.infer<typeof insertBlockchainExplorerSchema>;
export type BlockchainExplorer = typeof blockchainExplorers.$inferSelect;

// Define blockchain explorer relations
export const blockchainExplorersRelations = relations(blockchainExplorers, ({ one }) => ({
  cryptocurrency: one(cryptocurrencies, {
    fields: [blockchainExplorers.cryptocurrencyId],
    references: [cryptocurrencies.id]
  })
}));

// Metrics table
export const metrics = pgTable("metrics", {
  id: serial("id").primaryKey(),
  cryptocurrencyId: integer("cryptocurrency_id").notNull(),
  activeAddresses: integer("active_addresses"),
  totalTransactions: integer("total_transactions"),
  averageTransactionValue: real("average_transaction_value"),
  hashrate: text("hashrate"),
  transactionsPerSecond: real("transactions_per_second"),
  metrics: jsonb("metrics"),
  lastUpdated: timestamp("last_updated").defaultNow(),
});

export const insertMetricSchema = createInsertSchema(metrics).omit({
  id: true,
  lastUpdated: true,
});

export type InsertMetric = z.infer<typeof insertMetricSchema>;
export type Metric = typeof metrics.$inferSelect;

// AI Insights
export const aiInsights = pgTable("ai_insights", {
  id: serial("id").primaryKey(),
  cryptocurrencyId: integer("cryptocurrency_id"),
  content: text("content").notNull(),
  confidence: real("confidence"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertAiInsightSchema = createInsertSchema(aiInsights).omit({
  id: true,
  createdAt: true,
});

export type InsertAiInsight = z.infer<typeof insertAiInsightSchema>;
export type AiInsight = typeof aiInsights.$inferSelect;

// Crawler status
export const crawlerStatus = pgTable("crawler_status", {
  id: serial("id").primaryKey(),
  webCrawlerActive: boolean("web_crawler_active").default(false),
  aiProcessorActive: boolean("ai_processor_active").default(false),
  blockchainSyncActive: boolean("blockchain_sync_active").default(false),
  lastUpdate: timestamp("last_update").defaultNow(),
  newEntriesCount: integer("new_entries_count").default(0),
  lastBreakthroughAttempt: timestamp("last_breakthrough_attempt"),
  breakthroughCount: integer("breakthrough_count").default(0),
  maxCryptoCount: integer("max_crypto_count").default(0),
});

export const insertCrawlerStatusSchema = createInsertSchema(crawlerStatus).omit({
  id: true,
});

export type InsertCrawlerStatus = z.infer<typeof insertCrawlerStatusSchema>;
export type CrawlerStatus = typeof crawlerStatus.$inferSelect;

// 加密货币新闻表
export const cryptoNews = pgTable("crypto_news", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  url: text("url").notNull(),
  summary: text("summary"),
  source: text("source"),
  publishedAt: timestamp("published_at").defaultNow(),
  fetchedAt: timestamp("fetched_at").defaultNow(),
});

export const insertCryptoNewsSchema = createInsertSchema(cryptoNews).omit({
  id: true,
  fetchedAt: true,
});

export type InsertCryptoNews = z.infer<typeof insertCryptoNewsSchema>;
export type CryptoNews = typeof cryptoNews.$inferSelect;

// 交易量市值比率表
export const volumeToMarketCapRatios = pgTable("volume_to_market_cap_ratios", {
  id: serial("id").primaryKey(),
  cryptocurrencyId: integer("cryptocurrency_id").notNull(),
  name: text("name").notNull(),          // 加密货币名称
  symbol: text("symbol").notNull(),       // 加密货币符号
  volume7d: real("volume_7d"),           // 7天累计交易量
  marketCap: real("market_cap"),         // 市值
  volumeToMarketCapRatio: real("volume_to_market_cap_ratio").notNull(), // 交易量/市值比率
  includesFutures: boolean("includes_futures").default(true), // 是否包含期货交易量
  rank: integer("rank"),                 // 排名
  timestamp: timestamp("timestamp").defaultNow(), // 记录时间戳
  batchId: integer("batch_id").notNull(), // 批次ID，一个批次包含同一天的30个记录
});

export const insertVolumeToMarketCapRatioSchema = createInsertSchema(volumeToMarketCapRatios).omit({
  id: true,
  timestamp: true,
});

export type InsertVolumeToMarketCapRatio = z.infer<typeof insertVolumeToMarketCapRatioSchema>;
export type VolumeToMarketCapRatio = typeof volumeToMarketCapRatios.$inferSelect;

// 交易量市值比率批次表 - 记录每次批量分析的元数据
export const volumeToMarketCapBatches = pgTable("volume_to_market_cap_batches", {
  id: serial("id").primaryKey(),
  createdAt: timestamp("created_at").defaultNow(), // 批次创建时间
  entriesCount: integer("entries_count").notNull(), // 此批次包含的记录数
  hasChanges: boolean("has_changes").default(true), // 是否与上一批次有变化
  previousBatchId: integer("previous_batch_id"),    // 上一个批次ID
});

export const insertVolumeToMarketCapBatchSchema = createInsertSchema(volumeToMarketCapBatches).omit({
  id: true,
  createdAt: true,
});

export type InsertVolumeToMarketCapBatch = z.infer<typeof insertVolumeToMarketCapBatchSchema>;
export type VolumeToMarketCapBatch = typeof volumeToMarketCapBatches.$inferSelect;

// 建立交易量市值比率关系
export const volumeToMarketCapRatiosRelations = relations(volumeToMarketCapRatios, ({ one }) => ({
  cryptocurrency: one(cryptocurrencies, {
    fields: [volumeToMarketCapRatios.cryptocurrencyId],
    references: [cryptocurrencies.id]
  }),
  batch: one(volumeToMarketCapBatches, {
    fields: [volumeToMarketCapRatios.batchId],
    references: [volumeToMarketCapBatches.id]
  })
}));

// 建立批次关系
export const volumeToMarketCapBatchesRelations = relations(volumeToMarketCapBatches, ({ many, one }) => ({
  ratios: many(volumeToMarketCapRatios),
  previousBatch: one(volumeToMarketCapBatches, {
    fields: [volumeToMarketCapBatches.previousBatchId],
    references: [volumeToMarketCapBatches.id]
  }),
  technicalAnalyses: many(technicalAnalysisBatches)
}));

// 技术分析批次表 - 记录每次技术分析的元数据
export const technicalAnalysisBatches = pgTable("technical_analysis_batches", {
  id: serial("id").primaryKey(),
  createdAt: timestamp("created_at").defaultNow(), // 批次创建时间
  entriesCount: integer("entries_count").notNull(), // 此批次包含的记录数
  timeframe: text("timeframe").notNull(), // 时间周期，例如 "1h", "4h", "1d"
  description: text("description"), // 此批次的说明
  volumeRatioBatchId: integer("volume_ratio_batch_id"), // 关联的交易量市值比率批次ID
});

export const insertTechnicalAnalysisBatchSchema = createInsertSchema(technicalAnalysisBatches).omit({
  id: true,
  createdAt: true,
});

export type InsertTechnicalAnalysisBatch = z.infer<typeof insertTechnicalAnalysisBatchSchema>;
export type TechnicalAnalysisBatch = typeof technicalAnalysisBatches.$inferSelect;

// 技术分析记录表 - 记录每个加密货币的技术分析结果
export const technicalAnalysisEntries = pgTable("technical_analysis_entries", {
  id: serial("id").primaryKey(),
  batchId: integer("batch_id").notNull(), // 关联的批次ID
  cryptocurrencyId: integer("cryptocurrency_id").notNull(), // 加密货币ID
  name: text("name").notNull(), // 加密货币名称
  symbol: text("symbol").notNull(), // 加密货币符号
  // 交易量市值比率分析
  volumeToMarketCapRatio: real("volume_to_market_cap_ratio"), // 交易量市值比率
  volumeRatioSignal: text("volume_ratio_signal"), // 交易量比率信号: "buy", "sell", "neutral"
  // RSI 分析
  rsiValue: real("rsi_value"), // RSI值
  rsiSignal: text("rsi_signal"), // RSI信号: "buy", "sell", "neutral"
  rsiDataStartTime: timestamp("rsi_data_start_time"), // RSI数据的最早时间
  rsiDataEndTime: timestamp("rsi_data_end_time"), // RSI数据的最晚时间
  // MACD 分析
  macdLine: real("macd_line"), // MACD快线
  signalLine: real("signal_line"), // MACD慢线
  histogram: real("histogram"), // MACD柱状图
  macdSignal: text("macd_signal"), // MACD信号: "buy", "sell", "neutral"
  // 均线分析
  shortEma: real("short_ema"), // 短期EMA
  longEma: real("long_ema"), // 长期EMA
  emaSignal: text("ema_signal"), // 均线信号: "buy", "sell", "neutral"
  // 综合信号
  combinedSignal: text("combined_signal").notNull(), // 综合信号: "strong_buy", "buy", "neutral", "sell", "strong_sell" 
  signalStrength: integer("signal_strength"), // 信号强度: 1-5
  recommendationType: text("recommendation_type"), // 推荐类型: "day_trade", "swing_trade", "position"
  analysisTime: timestamp("analysis_time").defaultNow(), // 分析时间
});

export const insertTechnicalAnalysisEntrySchema = createInsertSchema(technicalAnalysisEntries).omit({
  id: true,
  analysisTime: true,
});

export type InsertTechnicalAnalysisEntry = z.infer<typeof insertTechnicalAnalysisEntrySchema>;
export type TechnicalAnalysisEntry = typeof technicalAnalysisEntries.$inferSelect;

// 技术分析批次关系
export const technicalAnalysisBatchesRelations = relations(technicalAnalysisBatches, ({ many, one }) => ({
  entries: many(technicalAnalysisEntries),
  volumeRatioBatch: one(volumeToMarketCapBatches, {
    fields: [technicalAnalysisBatches.volumeRatioBatchId],
    references: [volumeToMarketCapBatches.id]
  })
}));

// 技术分析记录关系
export const technicalAnalysisEntriesRelations = relations(technicalAnalysisEntries, ({ one }) => ({
  batch: one(technicalAnalysisBatches, {
    fields: [technicalAnalysisEntries.batchId],
    references: [technicalAnalysisBatches.id]
  }),
  cryptocurrency: one(cryptocurrencies, {
    fields: [technicalAnalysisEntries.cryptocurrencyId],
    references: [cryptocurrencies.id]
  })
}));

// 波动性分析批次表
export const volatilityAnalysisBatches = pgTable("volatility_analysis_batches", {
  id: serial("id").primaryKey(),
  createdAt: timestamp("created_at").defaultNow(),
  timeframe: text("timeframe").notNull().default("24h"),
  totalAnalyzed: integer("total_analyzed").default(0),
  analysisType: text("analysis_type").default("volume_volatility"),
  baseVolumeRatioBatchId: integer("base_volume_ratio_batch_id"), // 基准批次ID
  comparisonVolumeRatioBatchId: integer("comparison_volume_ratio_batch_id"), // 对比批次ID
});

export const insertVolatilityAnalysisBatchSchema = createInsertSchema(volatilityAnalysisBatches).omit({
  id: true,
  createdAt: true,
});

export type InsertVolatilityAnalysisBatch = z.infer<typeof insertVolatilityAnalysisBatchSchema>;
export type VolatilityAnalysisBatch = typeof volatilityAnalysisBatches.$inferSelect;

// 波动性分析条目表
export const volatilityAnalysisEntries = pgTable("volatility_analysis_entries", {
  id: serial("id").primaryKey(),
  batchId: integer("batch_id").notNull(),
  cryptocurrencyId: integer("cryptocurrency_id").notNull(),
  name: text("name").notNull(),
  symbol: text("symbol").notNull(),
  // 交易量市值比率数据
  currentVolumeRatio: real("current_volume_ratio"), // 当前交易量市值比率
  previousVolumeRatio: real("previous_volume_ratio"), // 之前交易量市值比率
  // 波动性指标
  volatilityScore: real("volatility_score"), // 波动性评分 (0-100)
  volatilityPercentage: real("volatility_percentage"), // 波动性百分比
  volatilityDirection: text("volatility_direction"), // "up", "down", "stable"
  volatilityRank: integer("volatility_rank"), // 波动性排名
  // 价格和交易量变化
  priceChange24h: real("price_change_24h"), // 24小时价格变化百分比
  volumeChange24h: real("volume_change_24h"), // 24小时交易量变化百分比
  marketCapChange24h: real("market_cap_change_24h"), // 24小时市值变化百分比
  // 波动性分类
  volatilityCategory: text("volatility_category"), // "极高", "高", "中", "低", "极低"
  riskLevel: text("risk_level"), // "高风险", "中风险", "低风险"
  analysisTime: timestamp("analysis_time").defaultNow(),
});

export const insertVolatilityAnalysisEntrySchema = createInsertSchema(volatilityAnalysisEntries).omit({
  id: true,
  analysisTime: true,
});

export type InsertVolatilityAnalysisEntry = z.infer<typeof insertVolatilityAnalysisEntrySchema>;
export type VolatilityAnalysisEntry = typeof volatilityAnalysisEntries.$inferSelect;

// 波动性分析批次关系
export const volatilityAnalysisBatchesRelations = relations(volatilityAnalysisBatches, ({ many, one }) => ({
  entries: many(volatilityAnalysisEntries),
  baseVolumeRatioBatch: one(volumeToMarketCapBatches, {
    fields: [volatilityAnalysisBatches.baseVolumeRatioBatchId],
    references: [volumeToMarketCapBatches.id]
  }),
  comparisonVolumeRatioBatch: one(volumeToMarketCapBatches, {
    fields: [volatilityAnalysisBatches.comparisonVolumeRatioBatchId],
    references: [volumeToMarketCapBatches.id]
  })
}));

// 波动性分析条目关系
export const volatilityAnalysisEntriesRelations = relations(volatilityAnalysisEntries, ({ one }) => ({
  batch: one(volatilityAnalysisBatches, {
    fields: [volatilityAnalysisEntries.batchId],
    references: [volatilityAnalysisBatches.id]
  }),
  cryptocurrency: one(cryptocurrencies, {
    fields: [volatilityAnalysisEntries.cryptocurrencyId],
    references: [cryptocurrencies.id]
  })
}));

// Dashboard configuration table
export const dashboardConfigs = pgTable('dashboard_configs', {
  id: serial('id').primaryKey(),
  userId: text('user_id').notNull().default('default'), // For future user system
  name: text('name').notNull().default('Default Dashboard'),
  isDefault: boolean('is_default').default(false),
  layout: jsonb('layout').$type<DashboardLayout>(),
  widgets: jsonb('widgets').$type<DashboardWidget[]>().default([]),
  preferences: jsonb('preferences').$type<DashboardPreferences>(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Widget types and configurations
export interface DashboardWidget {
  id: string;
  type: WidgetType;
  title: string;
  position: { x: number; y: number; w: number; h: number };
  config: WidgetConfig;
  isVisible: boolean;
}

export type WidgetType = 
  | 'market_overview'
  | 'price_chart'
  | 'trending_coins'
  | 'portfolio_summary'
  | 'news_feed'
  | 'technical_indicators'
  | 'volatility_analysis'
  | 'volume_ratios'
  | 'ai_insights'
  | 'watchlist'
  | 'quick_stats';

export interface WidgetConfig {
  // Common config
  refreshInterval?: number; // in seconds
  showHeader?: boolean;
  
  // Specific configs per widget type
  cryptocurrencyIds?: number[];
  symbols?: string[];
  timeframe?: '1h' | '4h' | '1d' | '7d' | '30d';
  chartType?: 'line' | 'candlestick' | 'area';
  indicators?: string[];
  maxItems?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  
  // Color and styling
  colorScheme?: 'default' | 'green-red' | 'blue-orange' | 'custom';
  customColors?: {
    primary?: string;
    secondary?: string;
    positive?: string;
    negative?: string;
  };
}

export interface DashboardLayout {
  columns: number;
  rowHeight: number;
  margin: [number, number];
  padding: [number, number];
  responsive: boolean;
}

export interface DashboardPreferences {
  theme: 'light' | 'dark' | 'system';
  currency: 'USD' | 'EUR' | 'BTC' | 'ETH';
  numberFormat: 'standard' | 'compact' | 'scientific';
  dateFormat: 'relative' | 'absolute' | 'short';
  autoRefresh: boolean;
  refreshInterval: number; // global refresh interval in seconds
  animations: boolean;
  soundAlerts: boolean;
  
  // Data preferences
  defaultTimeframe: '1h' | '4h' | '1d' | '7d' | '30d';
  defaultSortBy: 'market_cap' | 'price' | 'volume' | 'change_24h';
  showZeroBalances: boolean;
  compactMode: boolean;
  
  // Notification preferences
  priceAlerts: boolean;
  volatilityAlerts: boolean;
  newsAlerts: boolean;
}

// Default configurations
export const DEFAULT_DASHBOARD_LAYOUT: DashboardLayout = {
  columns: 12,
  rowHeight: 120,
  margin: [16, 16],
  padding: [16, 16],
  responsive: true,
};

export const DEFAULT_DASHBOARD_PREFERENCES: DashboardPreferences = {
  theme: 'system',
  currency: 'USD',
  numberFormat: 'compact',
  dateFormat: 'relative',
  autoRefresh: true,
  refreshInterval: 30,
  animations: true,
  soundAlerts: false,
  defaultTimeframe: '1d',
  defaultSortBy: 'market_cap',
  showZeroBalances: false,
  compactMode: false,
  priceAlerts: true,
  volatilityAlerts: true,
  newsAlerts: false,
};

export const DEFAULT_WIDGETS: DashboardWidget[] = [
  {
    id: 'market-overview-1',
    type: 'market_overview',
    title: 'Market Overview',
    position: { x: 0, y: 0, w: 6, h: 2 },
    config: { maxItems: 10, refreshInterval: 30 },
    isVisible: true,
  },
  {
    id: 'trending-coins-1',
    type: 'trending_coins',
    title: 'Trending Cryptocurrencies',
    position: { x: 6, y: 0, w: 6, h: 2 },
    config: { maxItems: 5, sortBy: 'volume_change_24h', refreshInterval: 60 },
    isVisible: true,
  },
  {
    id: 'price-chart-1',
    type: 'price_chart',
    title: 'Bitcoin Price Chart',
    position: { x: 0, y: 2, w: 8, h: 3 },
    config: { 
      symbols: ['BTC'], 
      timeframe: '1d', 
      chartType: 'line',
      refreshInterval: 30 
    },
    isVisible: true,
  },
  {
    id: 'quick-stats-1',
    type: 'quick_stats',
    title: 'Quick Stats',
    position: { x: 8, y: 2, w: 4, h: 3 },
    config: { refreshInterval: 30 },
    isVisible: true,
  },
  {
    id: 'news-feed-1',
    type: 'news_feed',
    title: 'Latest News',
    position: { x: 0, y: 5, w: 12, h: 2 },
    config: { maxItems: 6, refreshInterval: 300 },
    isVisible: true,
  },
];

// Zod schemas
export const insertDashboardConfigSchema = createInsertSchema(dashboardConfigs).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertDashboardConfig = z.infer<typeof insertDashboardConfigSchema>;
export type DashboardConfig = typeof dashboardConfigs.$inferSelect;
