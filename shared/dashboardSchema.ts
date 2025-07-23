import { pgTable, serial, text, json, timestamp, boolean, integer } from 'drizzle-orm/pg-core';
import { createInsertSchema } from 'drizzle-zod';
import { z } from 'zod';

// Dashboard configuration table
export const dashboardConfigs = pgTable('dashboard_configs', {
  id: serial('id').primaryKey(),
  userId: text('user_id').notNull(), // For future user system
  name: text('name').notNull().default('Default Dashboard'),
  isDefault: boolean('is_default').default(false),
  layout: json('layout').$type<DashboardLayout>(),
  widgets: json('widgets').$type<DashboardWidget[]>().default([]),
  preferences: json('preferences').$type<DashboardPreferences>(),
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
  defaultTimeframe: '24h',
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
export const insertDashboardConfigSchema = createInsertSchema(dashboardConfigs);
export type InsertDashboardConfig = z.infer<typeof insertDashboardConfigSchema>;
export type DashboardConfig = typeof dashboardConfigs.$inferSelect;