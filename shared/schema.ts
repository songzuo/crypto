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
  })
}));
