// Navigation items for the sidebar
export const navItems = [
  {
    label: "Dashboard",
    path: "/",
    icon: "ri-dashboard-line"
  },
  {
    label: "Markets",
    path: "/markets",
    icon: "ri-line-chart-line"
  },
  {
    label: "Comparisons",
    path: "/comparisons",
    icon: "ri-bar-chart-grouped-line"
  },
  {
    label: "Explorer",
    path: "/explorer",
    icon: "ri-search-line"
  },
  {
    label: "AI Insights",
    path: "/ai-insights",
    icon: "ri-robot-line"
  },
  {
    label: "News",
    path: "/news",
    icon: "ri-newspaper-line"
  },
  {
    label: "Trends",
    path: "/trends",
    icon: "ri-trending-up-line"
  },
  {
    label: "Volume Ratio",
    path: "/volume-ratio",
    icon: "ri-scales-3-line"
  },
  {
    label: "Technical Analysis",
    path: "/technical-analysis",
    icon: "ri-bar-chart-line"
  },
  {
    label: "Volatility Analysis",
    path: "/volatility-analysis",
    icon: "ri-pulse-line"
  },
  {
    label: "30天独立分析",
    path: "/30day-analysis",
    icon: "ri-calendar-line"
  },
  {
    label: "完整波动性结果",
    path: "/all-volatility-results",
    icon: "ri-list-check-line"
  }
];

// Common crypto symbols with their corresponding colors
export const cryptoColors: Record<string, string> = {
  BTC: "#f59e0b",  // amber-500
  ETH: "#3b82f6",  // blue-500
  BNB: "#facc15",  // yellow-400
  SOL: "#8b5cf6",  // violet-500
  XRP: "#64748b",  // slate-500
  ADA: "#14b8a6",  // teal-500
  DOGE: "#fbbf24", // amber-400
  DOT: "#ec4899",  // pink-500
  AVAX: "#ef4444", // red-500
  MATIC: "#6366f1", // indigo-500
  // 添加更多加密货币颜色
  USDT: "#2DD4BF", // teal-400
  USDC: "#3B82F6", // blue-500
  LINK: "#38BDF8", // sky-400
  LTC: "#94A3B8", // slate-400
  XLM: "#22D3EE", // cyan-400
  ATOM: "#F43F5E", // rose-500
  FIL: "#10B981", // emerald-500
  XMR: "#F97316", // orange-500
  SHIB: "#F59E0B", // amber-500
  UNI: "#EC4899", // pink-500
};

// Default metrics for comparison
export const comparisonMetrics = [
  { id: "marketCap", label: "Market Cap", formatter: (value: number) => `$${(value / 1e9).toFixed(2)}B` },
  { id: "volume24h", label: "24h Volume", formatter: (value: number) => `$${(value / 1e6).toFixed(2)}M` },
  { id: "price", label: "Price", formatter: (value: number) => `$${value < 1 ? value.toFixed(6) : value.toFixed(2)}` },
  { id: "priceChange24h", label: "24h Change", formatter: (value: number) => `${value > 0 ? "+" : ""}${value.toFixed(2)}%` },
  { id: "activeAddresses", label: "Active Addresses", formatter: (value: number) => value.toLocaleString() },
  { id: "transactionsPerSecond", label: "TPS", formatter: (value: number) => value.toFixed(2) }
];

// Timeframes for chart data
export const timeframes = [
  { value: "24h", label: "24h" },
  { value: "7d", label: "7d" },
  { value: "30d", label: "30d" },
  { value: "90d", label: "90d" },
  { value: "1y", label: "1y" },
  { value: "all", label: "All" }
];
