import { pgTable, text, serial, integer, boolean, timestamp, jsonb, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

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
});

export const insertCrawlerStatusSchema = createInsertSchema(crawlerStatus).omit({
  id: true,
});

export type InsertCrawlerStatus = z.infer<typeof insertCrawlerStatusSchema>;
export type CrawlerStatus = typeof crawlerStatus.$inferSelect;
