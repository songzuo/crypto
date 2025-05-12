import React, { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useRoute } from "wouter";

interface ExplorerDetailProps {
  cryptocurrencyId: number;
}

const ExplorerDetail: React.FC<ExplorerDetailProps> = ({ cryptocurrencyId }) => {
  // Get cryptocurrency details
  const { data: crypto, isLoading: isLoadingCrypto } = useQuery({
    queryKey: [`/api/cryptocurrencies/${cryptocurrencyId}`],
    enabled: !!cryptocurrencyId,
  });

  // Get blockchain explorers
  const { data: explorers, isLoading: isLoadingExplorers } = useQuery({
    queryKey: [`/api/cryptocurrencies/${cryptocurrencyId}/explorers`],
    enabled: !!cryptocurrencyId,
  });

  // Get metrics
  const { data: metrics, isLoading: isLoadingMetrics } = useQuery({
    queryKey: [`/api/cryptocurrencies/${cryptocurrencyId}/metrics`],
    enabled: !!cryptocurrencyId,
  });

  // Get AI insights
  const { data: insights, isLoading: isLoadingInsights } = useQuery({
    queryKey: [`/api/cryptocurrencies/${cryptocurrencyId}/ai-insights`],
    enabled: !!cryptocurrencyId,
  });

  // Format time ago
  const formatTimeAgo = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);
    
    if (diffInSeconds < 60) return `${diffInSeconds} seconds ago`;
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)} minutes ago`;
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)} hours ago`;
    return `${Math.floor(diffInSeconds / 86400)} days ago`;
  };

  // Format cryptocurrency price
  const formatPrice = (price?: number) => {
    if (!price) return "N/A";
    if (price < 0.01) return `$${price.toFixed(6)}`;
    if (price < 1) return `$${price.toFixed(4)}`;
    if (price < 1000) return `$${price.toFixed(2)}`;
    return `$${price.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
  };

  // Get cryptocurrency color based on symbol
  const getCryptoColor = (symbol: string) => {
    const colors = ["amber", "blue", "purple", "green", "yellow", "red", "indigo", "pink", "teal"];
    const sum = symbol?.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0) || 0;
    return colors[sum % colors.length];
  };

  return (
    <div>
      {isLoadingCrypto ? (
        <div className="space-y-4">
          <div className="flex items-center">
            <Skeleton className="h-16 w-16 rounded-full mr-4" />
            <div>
              <Skeleton className="h-6 w-48 mb-2" />
              <Skeleton className="h-4 w-32" />
            </div>
          </div>
          <Skeleton className="h-32 w-full" />
        </div>
      ) : crypto ? (
        <>
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-6">
            <div className="flex items-center mb-4 md:mb-0">
              <div className={`w-16 h-16 rounded-full bg-${getCryptoColor(crypto.symbol)}-100 flex items-center justify-center mr-4`}>
                <span className={`text-${getCryptoColor(crypto.symbol)}-600 font-bold text-xl`}>
                  {crypto.symbol.substring(0, 3)}
                </span>
              </div>
              <div>
                <h2 className="text-2xl font-bold">{crypto.name}</h2>
                <div className="flex items-center text-slate-500 dark:text-slate-400">
                  <span className="mr-2">{crypto.symbol}</span>
                  <Badge variant="outline">Rank #{crypto.rank || "N/A"}</Badge>
                </div>
              </div>
            </div>
            <div className="flex flex-col items-end">
              <div className="text-3xl font-bold">{formatPrice(crypto.price)}</div>
              <div className={crypto.priceChange24h >= 0 ? "text-emerald-500" : "text-red-500"}>
                {crypto.priceChange24h !== undefined && crypto.priceChange24h !== null
                  ? `${crypto.priceChange24h >= 0 ? "+" : ""}${crypto.priceChange24h.toFixed(2)}%`
                  : "N/A"}
              </div>
            </div>
          </div>

          <Tabs defaultValue="overview">
            <TabsList className="mb-4">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="explorers">Blockchain Explorers</TabsTrigger>
              <TabsTrigger value="metrics">Metrics</TabsTrigger>
              <TabsTrigger value="insights">AI Insights</TabsTrigger>
            </TabsList>
            
            <TabsContent value="overview">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Market Data</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <dl className="space-y-2">
                      <div className="flex justify-between">
                        <dt className="text-slate-500 dark:text-slate-400">Market Cap</dt>
                        <dd className="font-medium">
                          {crypto.marketCap
                            ? `$${crypto.marketCap >= 1e9
                                ? (crypto.marketCap / 1e9).toFixed(2) + "B"
                                : (crypto.marketCap / 1e6).toFixed(2) + "M"}`
                            : "N/A"}
                        </dd>
                      </div>
                      <div className="flex justify-between">
                        <dt className="text-slate-500 dark:text-slate-400">24h Trading Volume</dt>
                        <dd className="font-medium">
                          {crypto.volume24h
                            ? `$${crypto.volume24h >= 1e9
                                ? (crypto.volume24h / 1e9).toFixed(2) + "B"
                                : (crypto.volume24h / 1e6).toFixed(2) + "M"}`
                            : "N/A"}
                        </dd>
                      </div>
                      <div className="flex justify-between">
                        <dt className="text-slate-500 dark:text-slate-400">Price Change (24h)</dt>
                        <dd className={crypto.priceChange24h >= 0 ? "text-emerald-500 font-medium" : "text-red-500 font-medium"}>
                          {crypto.priceChange24h !== undefined && crypto.priceChange24h !== null
                            ? `${crypto.priceChange24h >= 0 ? "+" : ""}${crypto.priceChange24h.toFixed(2)}%`
                            : "N/A"}
                        </dd>
                      </div>
                      <div className="flex justify-between">
                        <dt className="text-slate-500 dark:text-slate-400">Last Updated</dt>
                        <dd className="font-medium">
                          {crypto.lastUpdated ? formatTimeAgo(crypto.lastUpdated) : "N/A"}
                        </dd>
                      </div>
                    </dl>
                  </CardContent>
                </Card>
                
                <Card>
                  <CardHeader>
                    <CardTitle>Links & Resources</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {crypto.officialWebsite ? (
                      <a 
                        href={crypto.officialWebsite}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center text-primary hover:underline"
                      >
                        <i className="ri-global-line mr-2"></i>
                        Official Website
                      </a>
                    ) : (
                      <div className="text-slate-500 dark:text-slate-400">
                        <i className="ri-global-line mr-2"></i>
                        Official Website: Not available
                      </div>
                    )}
                    
                    {isLoadingExplorers ? (
                      <Skeleton className="h-6 w-full" />
                    ) : explorers && explorers.length > 0 ? (
                      explorers.map((explorer: any) => (
                        <a 
                          key={explorer.id}
                          href={explorer.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center text-primary hover:underline"
                        >
                          <i className="ri-radar-line mr-2"></i>
                          {explorer.name}
                        </a>
                      ))
                    ) : (
                      <div className="text-slate-500 dark:text-slate-400">
                        <i className="ri-radar-line mr-2"></i>
                        Blockchain Explorer: Not available
                      </div>
                    )}
                    
                    <a 
                      href={`https://www.google.com/search?q=${encodeURIComponent(crypto.name + " cryptocurrency")}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center text-primary hover:underline"
                    >
                      <i className="ri-search-line mr-2"></i>
                      Search on Google
                    </a>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
            
            <TabsContent value="explorers">
              <Card>
                <CardHeader>
                  <CardTitle>Blockchain Explorers</CardTitle>
                </CardHeader>
                <CardContent>
                  {isLoadingExplorers ? (
                    <div className="space-y-4">
                      {Array(3).fill(0).map((_, i) => (
                        <Skeleton key={i} className="h-16 w-full" />
                      ))}
                    </div>
                  ) : explorers && explorers.length > 0 ? (
                    <div className="space-y-4">
                      {explorers.map((explorer: any) => (
                        <div 
                          key={explorer.id}
                          className="p-4 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800"
                        >
                          <a 
                            href={explorer.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex flex-col md:flex-row md:items-center justify-between"
                          >
                            <div className="flex items-center mb-2 md:mb-0">
                              <div className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center mr-3">
                                <i className="ri-radar-line text-primary"></i>
                              </div>
                              <div>
                                <div className="font-medium">{explorer.name}</div>
                                <div className="text-xs text-slate-500 dark:text-slate-400">
                                  Last fetched: {formatTimeAgo(explorer.lastFetched)}
                                </div>
                              </div>
                            </div>
                            <Button variant="outline" size="sm" className="ml-auto">
                              <i className="ri-external-link-line mr-1"></i>
                              Visit
                            </Button>
                          </a>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-slate-500 dark:text-slate-400">
                      <i className="ri-radar-line text-4xl mb-2"></i>
                      <p>No blockchain explorers found for this cryptocurrency.</p>
                      <p className="text-sm mt-2">Our crawler will attempt to find explorers soon.</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
            
            <TabsContent value="metrics">
              <Card>
                <CardHeader>
                  <CardTitle>On-Chain Metrics</CardTitle>
                </CardHeader>
                <CardContent>
                  {isLoadingMetrics ? (
                    <div className="space-y-4">
                      {Array(5).fill(0).map((_, i) => (
                        <div key={i} className="flex justify-between items-center">
                          <Skeleton className="h-4 w-40" />
                          <Skeleton className="h-4 w-24" />
                        </div>
                      ))}
                    </div>
                  ) : metrics ? (
                    <>
                      <dl className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                        <div className="bg-slate-50 dark:bg-slate-800 rounded-lg p-4">
                          <dt className="text-sm text-slate-500 dark:text-slate-400 mb-1">Active Addresses</dt>
                          <dd className="text-xl font-semibold">
                            {metrics.activeAddresses ? metrics.activeAddresses.toLocaleString() : "N/A"}
                          </dd>
                        </div>
                        <div className="bg-slate-50 dark:bg-slate-800 rounded-lg p-4">
                          <dt className="text-sm text-slate-500 dark:text-slate-400 mb-1">Total Transactions</dt>
                          <dd className="text-xl font-semibold">
                            {metrics.totalTransactions ? metrics.totalTransactions.toLocaleString() : "N/A"}
                          </dd>
                        </div>
                        <div className="bg-slate-50 dark:bg-slate-800 rounded-lg p-4">
                          <dt className="text-sm text-slate-500 dark:text-slate-400 mb-1">Transactions Per Second</dt>
                          <dd className="text-xl font-semibold">
                            {metrics.transactionsPerSecond ? metrics.transactionsPerSecond.toFixed(2) : "N/A"}
                          </dd>
                        </div>
                        <div className="bg-slate-50 dark:bg-slate-800 rounded-lg p-4">
                          <dt className="text-sm text-slate-500 dark:text-slate-400 mb-1">Average Transaction Value</dt>
                          <dd className="text-xl font-semibold">
                            {metrics.averageTransactionValue 
                              ? `$${metrics.averageTransactionValue.toLocaleString(undefined, {maximumFractionDigits: 2})}` 
                              : "N/A"}
                          </dd>
                        </div>
                      </dl>
                      
                      {metrics.metrics && Object.keys(metrics.metrics).length > 0 && (
                        <>
                          <h3 className="text-lg font-medium mb-3">Additional Metrics</h3>
                          <div className="bg-slate-50 dark:bg-slate-800 rounded-lg p-4">
                            <ScrollArea className="h-64">
                              <table className="w-full">
                                <tbody>
                                  {Object.entries(metrics.metrics).map(([key, value]) => (
                                    <tr key={key} className="border-b border-slate-200 dark:border-slate-700 last:border-0">
                                      <td className="py-2 pr-4 text-slate-600 dark:text-slate-300 capitalize">
                                        {key.replace(/_/g, ' ')}
                                      </td>
                                      <td className="py-2 text-right font-medium">{value as string}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </ScrollArea>
                          </div>
                        </>
                      )}
                    </>
                  ) : (
                    <div className="text-center py-8 text-slate-500 dark:text-slate-400">
                      <i className="ri-bar-chart-line text-4xl mb-2"></i>
                      <p>No on-chain metrics available for this cryptocurrency.</p>
                      <p className="text-sm mt-2">Our crawler will attempt to gather metrics soon.</p>
                    </div>
                  )}
                  
                  <div className="mt-4 text-sm text-slate-500 dark:text-slate-400">
                    <i className="ri-information-line mr-1"></i>
                    Data shown is extracted from blockchain explorers and may not be complete.
                    <br />
                    Last updated: {metrics ? formatTimeAgo(metrics.lastUpdated) : "N/A"}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
            
            <TabsContent value="insights">
              <Card>
                <CardHeader>
                  <CardTitle>AI-Generated Insights</CardTitle>
                </CardHeader>
                <CardContent>
                  {isLoadingInsights ? (
                    <div className="space-y-4">
                      <Skeleton className="h-32 w-full" />
                      <Skeleton className="h-4 w-40" />
                    </div>
                  ) : insights && insights.length > 0 ? (
                    <div className="space-y-6">
                      {insights.map((insight: any) => (
                        <div 
                          key={insight.id} 
                          className="bg-slate-50 dark:bg-slate-800 rounded-lg p-4 border-l-4 border-secondary"
                        >
                          <p className="mb-3 text-slate-600 dark:text-slate-300">
                            {insight.content}
                          </p>
                          <div className="flex justify-between items-center">
                            <span className="text-xs text-slate-500 dark:text-slate-400">
                              Generated {formatTimeAgo(insight.createdAt)}
                            </span>
                            <Badge variant="outline">
                              Confidence: {Math.round(insight.confidence * 100)}%
                            </Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-slate-500 dark:text-slate-400">
                      <i className="ri-robot-line text-4xl mb-2"></i>
                      <p>No AI insights available for this cryptocurrency.</p>
                      <p className="text-sm mt-2">Check back later for analysis generated by our AI.</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </>
      ) : (
        <div className="text-center py-8 text-slate-500 dark:text-slate-400">
          <i className="ri-error-warning-line text-4xl mb-2"></i>
          <p>Cryptocurrency not found or error loading data.</p>
          <Button variant="outline" className="mt-4" onClick={() => window.history.back()}>
            Go Back
          </Button>
        </div>
      )}
    </div>
  );
};

const Explorer: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCrypto, setSelectedCrypto] = useState<number | null>(null);
  
  // Get route params
  const [, params] = useRoute("/explorer/:id");
  
  // Get all cryptocurrencies for search
  const { data, isLoading } = useQuery({
    queryKey: ["/api/cryptocurrencies?limit=500"],
  });
  
  // Check for ID in URL params
  useEffect(() => {
    if (params && params.id) {
      const numericId = parseInt(params.id, 10);
      if (!isNaN(numericId)) {
        setSelectedCrypto(numericId);
        console.log("Setting cryptocurrency ID to:", numericId);
      } else {
        console.log("Invalid cryptocurrency ID:", params.id);
      }
    } else {
      console.log("No cryptocurrency ID found in URL", params);
    }
  }, [params]);

  // Handle search form submit
  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!data?.data) return;
    
    const found = data.data.find((crypto: any) => 
      crypto.name.toLowerCase() === searchQuery.toLowerCase() || 
      crypto.symbol.toLowerCase() === searchQuery.toLowerCase()
    );
    
    if (found) {
      setSelectedCrypto(found.id);
      // Update URL without refreshing page
      window.history.pushState({}, "", `/explorer/${found.id}`);
    }
  };

  return (
    <div className="p-6">
      {/* Page Title */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Blockchain Explorer</h1>
        <p className="text-slate-500 dark:text-slate-400">
          Explore on-chain data, metrics, and insights for cryptocurrencies
        </p>
      </div>

      {/* Search Bar */}
      <Card className="mb-6">
        <CardContent className="pt-6">
          <form onSubmit={handleSearch} className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <Input
                type="text"
                placeholder="Search by cryptocurrency name or symbol"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full"
              />
            </div>
            <Button type="submit" disabled={searchQuery.length < 2}>
              <i className="ri-search-line mr-2"></i>
              Search
            </Button>
          </form>
          
          {isLoading ? (
            <Skeleton className="h-8 w-full mt-4" />
          ) : data?.data && (
            <div className="mt-4 flex flex-wrap gap-2">
              <span className="text-sm text-slate-500 dark:text-slate-400 mr-2">Popular:</span>
              {data.data.slice(0, 8).map((crypto: any) => (
                <Badge 
                  key={crypto.id}
                  variant="outline"
                  className="cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800"
                  onClick={() => {
                    setSearchQuery(crypto.name);
                    setSelectedCrypto(crypto.id);
                  }}
                >
                  {crypto.name} ({crypto.symbol})
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Explorer Content */}
      {selectedCrypto ? (
        <ExplorerDetail cryptocurrencyId={selectedCrypto} />
      ) : (
        <Card className="bg-slate-50 dark:bg-slate-800 border-dashed border-2 border-slate-200 dark:border-slate-700">
          <CardContent className="py-12 text-center">
            <div className="flex justify-center mb-4">
              <i className="ri-radar-line text-6xl text-slate-400 dark:text-slate-500"></i>
            </div>
            <h3 className="text-xl font-medium mb-2">Search for a Cryptocurrency</h3>
            <p className="text-slate-500 dark:text-slate-400 max-w-lg mx-auto">
              Enter a cryptocurrency name or symbol above to explore on-chain data, metrics, and AI-generated insights.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default Explorer;
