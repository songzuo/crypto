import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from "recharts";

const Markets: React.FC = () => {
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [sort, setSort] = useState("rank");
  const [order, setOrder] = useState("asc");
  const [searchQuery, setSearchQuery] = useState("");
  const [timeframe, setTimeframe] = useState("7d");

  // Get cryptocurrency data
  const { data, isLoading, isError } = useQuery({
    queryKey: [`/api/cryptocurrencies?page=${page}&limit=${limit}&sort=${sort}&order=${order}`],
  });

  // Generate mock chart data based on the change percentage
  const generateChartData = (priceChange: number, basePrice: number) => {
    const dataPoints = 24;
    const volatility = Math.abs(priceChange) / 2;
    const direction = priceChange >= 0 ? 1 : -1;
    
    return Array.from({ length: dataPoints }, (_, i) => {
      const random = Math.sin(i / (dataPoints / (Math.PI * 2))) * volatility * 0.5;
      const trend = (i / dataPoints) * priceChange;
      const value = basePrice * (1 + (trend + random * Math.random()) / 100 * direction);
      
      return {
        time: `${i}h`,
        price: value
      };
    });
  };

  // Filter cryptocurrencies based on search query
  const filteredData = data?.data.filter((crypto: any) => 
    !searchQuery || 
    crypto.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
    crypto.symbol.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleSort = (value: string) => {
    if (value === sort) {
      setOrder(order === "asc" ? "desc" : "asc");
    } else {
      setSort(value);
      setOrder("asc");
    }
  };

  // Helper function to get crypto color
  const getCryptoColor = (symbol: string): string => {
    const colors = ["amber", "blue", "purple", "green", "yellow", "red", "indigo", "pink", "teal"];
    const sum = symbol.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return colors[sum % colors.length];
  };

  return (
    <div className="p-6">
      {/* Page Title */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Cryptocurrency Markets</h1>
        <p className="text-slate-500 dark:text-slate-400">
          Track prices, volume, and market capitalization for top cryptocurrencies
        </p>
      </div>

      {/* Market Overview Card */}
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4">Market Overview</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-slate-50 dark:bg-slate-800 rounded-lg p-4">
            <p className="text-sm text-slate-500 dark:text-slate-400">Global Market Cap</p>
            <h3 className="text-xl font-semibold mt-1">$1.26T</h3>
            <div className="flex items-center mt-1 text-emerald-500 text-sm">
              <i className="ri-arrow-up-line mr-1"></i>
              <span>2.4%</span>
              <span className="text-slate-500 dark:text-slate-400 ml-1">24h</span>
            </div>
          </div>
          <div className="bg-slate-50 dark:bg-slate-800 rounded-lg p-4">
            <p className="text-sm text-slate-500 dark:text-slate-400">24h Volume</p>
            <h3 className="text-xl font-semibold mt-1">$48.7B</h3>
            <div className="flex items-center mt-1 text-red-500 text-sm">
              <i className="ri-arrow-down-line mr-1"></i>
              <span>1.3%</span>
              <span className="text-slate-500 dark:text-slate-400 ml-1">24h</span>
            </div>
          </div>
          <div className="bg-slate-50 dark:bg-slate-800 rounded-lg p-4">
            <p className="text-sm text-slate-500 dark:text-slate-400">BTC Dominance</p>
            <h3 className="text-xl font-semibold mt-1">48.2%</h3>
            <div className="flex items-center mt-1 text-emerald-500 text-sm">
              <i className="ri-arrow-up-line mr-1"></i>
              <span>0.3%</span>
              <span className="text-slate-500 dark:text-slate-400 ml-1">24h</span>
            </div>
          </div>
          <div className="bg-slate-50 dark:bg-slate-800 rounded-lg p-4">
            <p className="text-sm text-slate-500 dark:text-slate-400">Active Cryptocurrencies</p>
            <h3 className="text-xl font-semibold mt-1">578</h3>
            <div className="flex items-center mt-1 text-slate-500 dark:text-slate-400 text-sm">
              <span>Last updated 5min ago</span>
            </div>
          </div>
        </div>
      </div>

      {/* Filters and Search */}
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm p-6 mb-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-4">
          <div className="w-full md:w-auto">
            <Input
              type="text"
              placeholder="Search cryptocurrencies..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="max-w-sm"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Select value={sort} onValueChange={handleSort}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Sort by" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="rank">Rank</SelectItem>
                <SelectItem value="name">Name</SelectItem>
                <SelectItem value="price">Price</SelectItem>
                <SelectItem value="priceChange24h">24h %</SelectItem>
                <SelectItem value="marketCap">Market Cap</SelectItem>
                <SelectItem value="volume24h">Volume</SelectItem>
              </SelectContent>
            </Select>
            <Button 
              variant="outline"
              onClick={() => setOrder(order === "asc" ? "desc" : "asc")}
            >
              {order === "asc" ? (
                <i className="ri-sort-asc"></i>
              ) : (
                <i className="ri-sort-desc"></i>
              )}
            </Button>
            <Select value={limit.toString()} onValueChange={(value) => setLimit(parseInt(value))}>
              <SelectTrigger className="w-[80px]">
                <SelectValue placeholder="Show" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="10">10</SelectItem>
                <SelectItem value="20">20</SelectItem>
                <SelectItem value="50">50</SelectItem>
                <SelectItem value="100">100</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Cryptocurrency Table */}
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400 text-xs uppercase">
              <tr>
                <th className="px-4 py-3 text-left tracking-wider">#</th>
                <th className="px-4 py-3 text-left tracking-wider">Name</th>
                <th className="px-4 py-3 text-right tracking-wider">Price</th>
                <th className="px-4 py-3 text-right tracking-wider">24h %</th>
                <th className="px-4 py-3 text-right tracking-wider">7d %</th>
                <th className="px-4 py-3 text-right tracking-wider">Market Cap</th>
                <th className="px-4 py-3 text-right tracking-wider">Volume (24h)</th>
                <th className="px-4 py-3 text-right tracking-wider">Chart (7d)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
              {isLoading ? (
                // Skeleton loading state
                Array(limit)
                  .fill(0)
                  .map((_, i) => (
                    <tr key={i}>
                      <td className="px-4 py-4">
                        <Skeleton className="h-4 w-4" />
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex items-center">
                          <Skeleton className="h-8 w-8 rounded-full mr-3" />
                          <div>
                            <Skeleton className="h-4 w-24 mb-1" />
                            <Skeleton className="h-3 w-10" />
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4 text-right">
                        <Skeleton className="h-4 w-20 ml-auto" />
                      </td>
                      <td className="px-4 py-4 text-right">
                        <Skeleton className="h-4 w-12 ml-auto" />
                      </td>
                      <td className="px-4 py-4 text-right">
                        <Skeleton className="h-4 w-12 ml-auto" />
                      </td>
                      <td className="px-4 py-4 text-right">
                        <Skeleton className="h-4 w-20 ml-auto" />
                      </td>
                      <td className="px-4 py-4 text-right">
                        <Skeleton className="h-4 w-20 ml-auto" />
                      </td>
                      <td className="px-4 py-4 text-right">
                        <Skeleton className="h-10 w-24 ml-auto" />
                      </td>
                    </tr>
                  ))
              ) : isError ? (
                <tr>
                  <td colSpan={8} className="px-4 py-4 text-center text-red-500">
                    Error loading cryptocurrency data. Please try again later.
                  </td>
                </tr>
              ) : filteredData && filteredData.length > 0 ? (
                filteredData.map((crypto: any, index: number) => {
                  const chartData = generateChartData(crypto.priceChange24h || 0, crypto.price || 1);
                  const lineColor = crypto.priceChange24h >= 0 ? "#10b981" : "#ef4444";
                  
                  return (
                    <tr
                      key={crypto.id}
                      className="hover:bg-slate-50 dark:hover:bg-slate-800/60"
                    >
                      <td className="px-4 py-4 whitespace-nowrap text-sm">
                        {crypto.rank || (page - 1) * limit + index + 1}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <div className={`w-8 h-8 rounded-full bg-${getCryptoColor(crypto.symbol)}-100 flex items-center justify-center mr-3`}>
                            <span className={`text-${getCryptoColor(crypto.symbol)}-600 font-bold text-xs`}>
                              {crypto.symbol.substring(0, 3)}
                            </span>
                          </div>
                          <div>
                            <div className="font-medium">{crypto.name}</div>
                            <div className="text-xs text-slate-500 dark:text-slate-400">
                              {crypto.symbol}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-right">
                        <div className="font-medium">
                          {crypto.price ? `$${crypto.price < 1 ? crypto.price.toFixed(6) : crypto.price.toFixed(2)}` : 'N/A'}
                        </div>
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-right">
                        <div className={crypto.priceChange24h >= 0 ? "text-emerald-500" : "text-red-500"}>
                          {crypto.priceChange24h !== undefined
                            ? `${crypto.priceChange24h >= 0 ? "+" : ""}${crypto.priceChange24h.toFixed(2)}%`
                            : "N/A"}
                        </div>
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-right">
                        <div className={Math.random() > 0.5 ? "text-emerald-500" : "text-red-500"}>
                          {`${Math.random() > 0.5 ? "+" : "-"}${(Math.random() * 10).toFixed(2)}%`}
                        </div>
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-right">
                        <div className="font-medium">
                          {crypto.marketCap
                            ? `$${crypto.marketCap >= 1e9
                                ? (crypto.marketCap / 1e9).toFixed(2) + "B"
                                : (crypto.marketCap / 1e6).toFixed(2) + "M"}`
                            : "N/A"}
                        </div>
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-right">
                        <div className="font-medium">
                          {crypto.volume24h
                            ? `$${crypto.volume24h >= 1e9
                                ? (crypto.volume24h / 1e9).toFixed(2) + "B"
                                : (crypto.volume24h / 1e6).toFixed(2) + "M"}`
                            : "N/A"}
                        </div>
                      </td>
                      <td className="px-4 py-4 text-right">
                        <div className="h-10 w-24 ml-auto">
                          <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={chartData}>
                              <Line
                                type="monotone"
                                dataKey="price"
                                stroke={lineColor}
                                strokeWidth={2}
                                dot={false}
                              />
                              <YAxis domain={['dataMin', 'dataMax']} hide={true} />
                            </LineChart>
                          </ResponsiveContainer>
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={8} className="px-4 py-4 text-center">
                    No cryptocurrencies found matching your search.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex justify-between items-center mt-4">
          <div className="text-sm text-slate-500 dark:text-slate-400">
            {data ? `Showing ${(page - 1) * limit + 1}-${Math.min(page * limit, data.total)} of ${data.total} cryptocurrencies` : "Loading..."}
          </div>
          <div className="flex space-x-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
            >
              <i className="ri-arrow-left-s-line mr-1"></i>
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={!data || page >= Math.ceil(data.total / limit)}
              onClick={() => setPage(page + 1)}
            >
              Next
              <i className="ri-arrow-right-s-line ml-1"></i>
            </Button>
          </div>
        </div>
      </div>

      {/* Market Insights */}
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm p-6">
        <h2 className="text-xl font-semibold mb-4">Market Insights</h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Top Gainers (24h)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {filteredData?.filter((crypto: any) => crypto.priceChange24h > 0)
                  .sort((a: any, b: any) => b.priceChange24h - a.priceChange24h)
                  .slice(0, 5)
                  .map((crypto: any) => (
                    <div key={`gainer-${crypto.id}`} className="flex items-center justify-between">
                      <div className="flex items-center">
                        <div className={`w-8 h-8 rounded-full bg-${getCryptoColor(crypto.symbol)}-100 flex items-center justify-center mr-3`}>
                          <span className={`text-${getCryptoColor(crypto.symbol)}-600 font-bold text-xs`}>
                            {crypto.symbol.substring(0, 3)}
                          </span>
                        </div>
                        <div>
                          <div className="font-medium">{crypto.name}</div>
                          <div className="text-xs text-slate-500 dark:text-slate-400">
                            {crypto.symbol}
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-medium">
                          ${crypto.price < 1 ? crypto.price.toFixed(6) : crypto.price.toFixed(2)}
                        </div>
                        <div className="text-emerald-500 text-sm">
                          +{crypto.priceChange24h.toFixed(2)}%
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Top Losers (24h)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {filteredData?.filter((crypto: any) => crypto.priceChange24h < 0)
                  .sort((a: any, b: any) => a.priceChange24h - b.priceChange24h)
                  .slice(0, 5)
                  .map((crypto: any) => (
                    <div key={`loser-${crypto.id}`} className="flex items-center justify-between">
                      <div className="flex items-center">
                        <div className={`w-8 h-8 rounded-full bg-${getCryptoColor(crypto.symbol)}-100 flex items-center justify-center mr-3`}>
                          <span className={`text-${getCryptoColor(crypto.symbol)}-600 font-bold text-xs`}>
                            {crypto.symbol.substring(0, 3)}
                          </span>
                        </div>
                        <div>
                          <div className="font-medium">{crypto.name}</div>
                          <div className="text-xs text-slate-500 dark:text-slate-400">
                            {crypto.symbol}
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-medium">
                          ${crypto.price < 1 ? crypto.price.toFixed(6) : crypto.price.toFixed(2)}
                        </div>
                        <div className="text-red-500 text-sm">
                          {crypto.priceChange24h.toFixed(2)}%
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default Markets;
