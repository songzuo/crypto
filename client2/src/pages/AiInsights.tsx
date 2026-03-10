import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const AiInsights: React.FC = () => {
  const [selectedCrypto, setSelectedCrypto] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [timeframe, setTimeframe] = useState<string>("all");

  // Get all cryptocurrencies
  const { data: cryptos, isLoading: isLoadingCryptos } = useQuery({
    queryKey: ["/api/cryptocurrencies?limit=50"],
  });

  // Get AI insights
  const { data: insights, isLoading: isLoadingInsights } = useQuery({
    queryKey: ["/api/ai-insights"],
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

  // Filter insights based on selected cryptocurrency and search query
  const filteredInsights = insights?.filter((insight: any) => {
    const matchesCrypto = selectedCrypto === "all" || insight.cryptocurrencyId === parseInt(selectedCrypto);
    const matchesSearch = !searchQuery || insight.content.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCrypto && matchesSearch;
  });

  return (
    <div className="p-6">
      {/* Page Title */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold">AI Insights</h1>
        <p className="text-slate-500 dark:text-slate-400">
          AI-generated analysis and insights for cryptocurrency markets
        </p>
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm p-6 mb-6">
        <div className="flex flex-col sm:flex-row gap-4 mb-2">
          <div className="flex-1">
            <Select
              value={selectedCrypto}
              onValueChange={setSelectedCrypto}
              disabled={isLoadingCryptos}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select Cryptocurrency" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Cryptocurrencies</SelectItem>
                {cryptos?.data?.map((crypto: any) => (
                  <SelectItem key={crypto.id} value={crypto.id.toString()}>
                    {crypto.name} ({crypto.symbol})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex-1">
            <Input
              placeholder="Search insights..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <div>
            <Select value={timeframe} onValueChange={setTimeframe}>
              <SelectTrigger className="w-full sm:w-[180px]">
                <SelectValue placeholder="Timeframe" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Time</SelectItem>
                <SelectItem value="day">Last 24 Hours</SelectItem>
                <SelectItem value="week">Last Week</SelectItem>
                <SelectItem value="month">Last Month</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* AI Insights Tabs */}
      <Tabs defaultValue="market">
        <TabsList>
          <TabsTrigger value="market">Market Insights</TabsTrigger>
          <TabsTrigger value="technical">Technical Analysis</TabsTrigger>
          <TabsTrigger value="onchain">On-Chain Data</TabsTrigger>
        </TabsList>
        
        <TabsContent value="market" className="mt-6">
          <div className="grid grid-cols-1 gap-6">
            {isLoadingInsights ? (
              // Skeleton loading state
              Array(5)
                .fill(0)
                .map((_, i) => (
                  <Card key={i} className="border border-slate-200 dark:border-slate-700">
                    <CardHeader className="pb-2">
                      <div className="flex justify-between">
                        <Skeleton className="h-5 w-40" />
                        <Skeleton className="h-5 w-20" />
                      </div>
                    </CardHeader>
                    <CardContent>
                      <Skeleton className="h-24 w-full mb-2" />
                      <div className="flex justify-between mt-4">
                        <Skeleton className="h-4 w-32" />
                        <Skeleton className="h-4 w-24" />
                      </div>
                    </CardContent>
                  </Card>
                ))
            ) : filteredInsights && filteredInsights.length > 0 ? (
              filteredInsights.map((insight: any) => (
                <Card 
                  key={insight.id} 
                  className="border border-slate-200 dark:border-slate-700 hover:border-primary transition-colors"
                >
                  <CardHeader className="pb-2">
                    <div className="flex justify-between items-center">
                      <Badge variant="outline" className="px-2 py-0">
                        {insight.cryptocurrencyName}
                      </Badge>
                      <span className="text-sm text-slate-500 dark:text-slate-400">
                        {formatTimeAgo(insight.createdAt)}
                      </span>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-slate-700 dark:text-slate-300">
                      {insight.content}
                    </p>
                    <div className="flex justify-between items-center mt-4">
                      <div className="flex items-center">
                        <Badge variant="secondary" className="mr-2">
                          <i className="ri-robot-line mr-1"></i>
                          AI Generated
                        </Badge>
                        <Badge variant={insight.confidence > 0.7 ? "default" : "outline"}>
                          Confidence: {Math.round(insight.confidence * 100)}%
                        </Badge>
                      </div>
                      <Button variant="ghost" size="sm">
                        <i className="ri-share-line mr-1"></i>
                        Share
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))
            ) : (
              <div className="text-center p-12 bg-slate-50 dark:bg-slate-800 rounded-lg border border-dashed border-slate-300 dark:border-slate-600">
                <div className="text-4xl mb-4">🔍</div>
                <h3 className="text-lg font-medium mb-2">No insights found</h3>
                <p className="text-slate-500 dark:text-slate-400">
                  {searchQuery
                    ? "Try adjusting your search query or filters."
                    : "There are no AI insights available for the selected cryptocurrency."}
                </p>
                {searchQuery && (
                  <Button
                    variant="outline"
                    className="mt-4"
                    onClick={() => setSearchQuery("")}
                  >
                    Clear Search
                  </Button>
                )}
              </div>
            )}
          </div>
        </TabsContent>
        
        <TabsContent value="technical" className="mt-6">
          <div className="text-center p-12 bg-slate-50 dark:bg-slate-800 rounded-lg border border-dashed border-slate-300 dark:border-slate-600">
            <div className="text-4xl mb-4">📊</div>
            <h3 className="text-lg font-medium mb-2">Technical Analysis</h3>
            <p className="text-slate-500 dark:text-slate-400">
              AI-powered technical analysis is coming soon.
            </p>
            <p className="text-slate-400 dark:text-slate-500 text-sm mt-2">
              Our platform will analyze price patterns, indicators, and market trends to provide technical analysis insights.
            </p>
          </div>
        </TabsContent>
        
        <TabsContent value="onchain" className="mt-6">
          <div className="text-center p-12 bg-slate-50 dark:bg-slate-800 rounded-lg border border-dashed border-slate-300 dark:border-slate-600">
            <div className="text-4xl mb-4">⛓️</div>
            <h3 className="text-lg font-medium mb-2">On-Chain Data Analysis</h3>
            <p className="text-slate-500 dark:text-slate-400">
              Blockchain data analysis is coming soon.
            </p>
            <p className="text-slate-400 dark:text-slate-500 text-sm mt-2">
              Our AI will analyze on-chain metrics like transaction volumes, active addresses, and whale movements.
            </p>
          </div>
        </TabsContent>
      </Tabs>

      {/* How AI Insights Work */}
      <Card className="mt-8">
        <CardHeader>
          <CardTitle>How AI Insights Work</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-center">
            <div className="p-4">
              <div className="w-12 h-12 rounded-full bg-blue-100 dark:bg-blue-900/20 text-primary flex items-center justify-center mx-auto mb-4">
                <i className="ri-robot-line text-xl"></i>
              </div>
              <h3 className="font-medium mb-2">AI Data Processing</h3>
              <p className="text-slate-500 dark:text-slate-400 text-sm">
                Our AI continuously analyzes cryptocurrency data from multiple sources, including price feeds, blockchain explorers, and news.
              </p>
            </div>
            
            <div className="p-4">
              <div className="w-12 h-12 rounded-full bg-purple-100 dark:bg-purple-900/20 text-secondary flex items-center justify-center mx-auto mb-4">
                <i className="ri-radar-line text-xl"></i>
              </div>
              <h3 className="font-medium mb-2">Pattern Recognition</h3>
              <p className="text-slate-500 dark:text-slate-400 text-sm">
                Advanced algorithms detect patterns, correlations, and anomalies in the data that might not be obvious to human analysts.
              </p>
            </div>
            
            <div className="p-4">
              <div className="w-12 h-12 rounded-full bg-amber-100 dark:bg-amber-900/20 text-amber-600 flex items-center justify-center mx-auto mb-4">
                <i className="ri-file-text-line text-xl"></i>
              </div>
              <h3 className="font-medium mb-2">Insight Generation</h3>
              <p className="text-slate-500 dark:text-slate-400 text-sm">
                The platform generates human-readable insights with confidence scores to help you understand market trends and on-chain activity.
              </p>
            </div>
          </div>
          
          <div className="mt-6 p-4 bg-slate-50 dark:bg-slate-800 rounded-md border-l-4 border-primary">
            <p className="text-sm text-slate-600 dark:text-slate-300">
              <strong>Note:</strong> AI insights are generated based on available data and should be used as one of many research tools, not as financial advice. Always perform your own research before making investment decisions.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default AiInsights;
