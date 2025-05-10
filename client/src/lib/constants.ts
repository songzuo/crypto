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
  }
];

// Common crypto symbols with their corresponding colors
export const cryptoColors = {
  BTC: "amber",
  ETH: "blue",
  BNB: "yellow",
  SOL: "purple",
  XRP: "slate",
  ADA: "teal",
  DOGE: "amber",
  DOT: "pink",
  AVAX: "red",
  MATIC: "indigo"
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
