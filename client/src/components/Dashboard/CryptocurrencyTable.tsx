import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

const CryptocurrencyTable: React.FC = () => {
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState("marketCap");
  const [order, setOrder] = useState("desc"); // Changed to market cap descending
  const [limit] = useState(50);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: [`/api/cryptocurrencies?page=${page}&limit=${limit}&sort=${sort}&order=${order}`],
  });

  const getPriceChangeClass = (priceChange?: number) => {
    if (!priceChange) return "text-slate-500";
    return priceChange >= 0 ? "text-emerald-500" : "text-red-500";
  };

  const formatMarketCap = (marketCap?: number) => {
    if (!marketCap) return "N/A";
    if (marketCap >= 1e12) return `$${(marketCap / 1e12).toFixed(1)}T`;
    if (marketCap >= 1e9) return `$${(marketCap / 1e9).toFixed(1)}B`;
    if (marketCap >= 1e6) return `$${(marketCap / 1e6).toFixed(1)}M`;
    return `$${marketCap.toFixed(0)}`;
  };

  const formatPrice = (price?: number) => {
    if (!price) return "N/A";
    if (price < 0.01) return `$${price.toFixed(6)}`;
    if (price < 1) return `$${price.toFixed(4)}`;
    if (price < 1000) return `$${price.toFixed(2)}`;
    return `$${price.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
  };

  const handleSortChange = (value: string) => {
    setSort(value);
  };

  const totalPages = data?.total ? Math.ceil(data.total / limit) : 1;

  return (
    <div className="xl:col-span-2 bg-white dark:bg-slate-900 rounded-xl shadow-sm overflow-hidden">
      <div className="p-6 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center">
        <h2 className="text-xl font-semibold">Top Cryptocurrencies</h2>
        <div className="flex items-center">
          <div className="relative mr-2">
            <Select value={sort} onValueChange={handleSortChange}>
              <SelectTrigger className="w-[160px] bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg">
                <SelectValue placeholder="Sort by" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="rank">Market Cap Rank</SelectItem>
                <SelectItem value="name">Name</SelectItem>
                <SelectItem value="price">Price</SelectItem>
                <SelectItem value="priceChange24h">24h %</SelectItem>
                <SelectItem value="marketCap">Market Cap</SelectItem>
                <SelectItem value="volume24h">Volume 24h</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button
            variant="outline"
            size="icon"
            onClick={() => refetch()}
            className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-1.5"
          >
            <i className="ri-refresh-line text-slate-600 dark:text-slate-300"></i>
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400 text-xs uppercase">
            <tr>
              <th className="px-6 py-3 text-left tracking-wider">#</th>
              <th className="px-6 py-3 text-left tracking-wider">Name</th>
              <th className="px-6 py-3 text-right tracking-wider">Price</th>
              <th className="px-6 py-3 text-right tracking-wider">24h %</th>
              <th className="px-6 py-3 text-right tracking-wider">Market Cap</th>
              <th className="px-6 py-3 text-right tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
            {isLoading ? (
              // Skeleton loading state
              Array(5)
                .fill(0)
                .map((_, i) => (
                  <tr key={i}>
                    <td className="px-6 py-4">
                      <Skeleton className="h-4 w-4" />
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center">
                        <Skeleton className="h-8 w-8 rounded-full mr-3" />
                        <div>
                          <Skeleton className="h-4 w-24 mb-1" />
                          <Skeleton className="h-3 w-10" />
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <Skeleton className="h-4 w-20 ml-auto mb-1" />
                      <Skeleton className="h-3 w-16 ml-auto" />
                    </td>
                    <td className="px-6 py-4 text-right">
                      <Skeleton className="h-4 w-12 ml-auto" />
                    </td>
                    <td className="px-6 py-4 text-right">
                      <Skeleton className="h-4 w-16 ml-auto" />
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex justify-end space-x-2">
                        <Skeleton className="h-4 w-4" />
                        <Skeleton className="h-4 w-4" />
                      </div>
                    </td>
                  </tr>
                ))
            ) : isError ? (
              <tr>
                <td colSpan={6} className="px-6 py-4 text-center text-red-500">
                  Error loading cryptocurrency data. Please try again later.
                </td>
              </tr>
            ) : data && data.data.length > 0 ? (
              data.data.map((crypto: any, index: number) => (
                <tr
                  key={crypto.id}
                  className="hover:bg-slate-50 dark:hover:bg-slate-800/60"
                >
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    {crypto.rank || ((page - 1) * limit + index + 1)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <div className={`w-8 h-8 rounded-full bg-${getCryptoColor(crypto.symbol)}-100 flex items-center justify-center mr-3`}>
                        <span className={`text-${getCryptoColor(crypto.symbol)}-600 font-bold text-xs`}>
                          {crypto.symbol.substring(0, 3)}
                        </span>
                      </div>
                      <div>
                        <div className="font-medium">
                          <Link to={`/explorer/${crypto.id}`} className="hover:text-blue-600 transition-colors">
                            {crypto.name}
                          </Link>
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">
                          {crypto.symbol}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right">
                    <div className="font-medium">{formatPrice(crypto.price)}</div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">
                      {crypto.ethPrice || ""}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right">
                    <div className={getPriceChangeClass(crypto.priceChange24h)}>
                      {crypto.priceChange24h !== undefined && crypto.priceChange24h !== null
                        ? `${crypto.priceChange24h >= 0 ? "+" : ""}${crypto.priceChange24h.toFixed(1)}%`
                        : "N/A"}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right">
                    <div className="font-medium">
                      {formatMarketCap(crypto.marketCap)}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right space-x-2">
                    <a
                      href={crypto.officialWebsite || "#"}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:text-primary-dark"
                    >
                      <i className="ri-external-link-line"></i>
                    </a>
                    <button className="text-slate-500 hover:text-primary">
                      <i className="ri-add-line"></i>
                    </button>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={6} className="px-6 py-4 text-center">
                  No cryptocurrencies found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="p-4 border-t border-slate-200 dark:border-slate-700 flex justify-between items-center">
        <div className="text-sm text-slate-500 dark:text-slate-400">
          {data ? `Showing ${(page - 1) * limit + 1}-${Math.min(page * limit, data.total)} of ${data.total} cryptocurrencies` : "Loading..."}
        </div>
        <div className="flex space-x-1">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
            className="px-3 py-1 rounded border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <i className="ri-arrow-left-s-line"></i>
          </Button>
          
          {Array.from({ length: Math.min(3, totalPages) }, (_, i) => {
            const pageNum = i + 1;
            return (
              <Button
                key={pageNum}
                variant={pageNum === page ? "default" : "outline"}
                size="sm"
                onClick={() => setPage(pageNum)}
                className={pageNum === page 
                  ? "px-3 py-1 rounded bg-primary text-white hover:bg-primary-dark" 
                  : "px-3 py-1 rounded border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800"
                }
              >
                {pageNum}
              </Button>
            );
          })}
          
          {totalPages > 3 && (
            <Button
              variant="outline"
              size="sm"
              className="px-3 py-1 rounded border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              ...
            </Button>
          )}
          
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => setPage(page + 1)}
            className="px-3 py-1 rounded border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <i className="ri-arrow-right-s-line"></i>
          </Button>
        </div>
      </div>
    </div>
  );
};

// Helper function to get consistent colors for crypto symbols
function getCryptoColor(symbol: string): string {
  const colors = ["amber", "blue", "purple", "green", "yellow", "red", "indigo", "pink", "teal"];
  
  // Sum of character codes to get a consistent index
  const sum = symbol.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return colors[sum % colors.length];
}

export default CryptocurrencyTable;
