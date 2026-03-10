import React, { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ResponsiveContainer
} from "recharts";

interface ComparisonCrypto {
  id: number;
  name: string;
  symbol: string;
  price: number;
  marketCap: number;
  volume24h: number;
  activeAddresses?: number;
}

const ComparisonTool: React.FC = () => {
  const [selectedCryptos, setSelectedCryptos] = useState<number[]>([1, 2, 3]); // Default select first 3 cryptos
  const [availableCryptos, setAvailableCryptos] = useState<ComparisonCrypto[]>([]);
  
  // Get top cryptocurrencies to choose from
  const { data: topCryptos, isLoading: isLoadingTopCryptos } = useQuery({
    queryKey: ["/api/cryptocurrencies?limit=20"],
  });
  
  // Get comparison data for selected cryptocurrencies
  const { data: comparisonData, isLoading: isLoadingComparison } = useQuery({
    queryKey: [`/api/compare?ids=${selectedCryptos.join(',')}`],
    enabled: selectedCryptos.length > 0,
  });
  
  // Prepare chart data
  const chartData = React.useMemo(() => {
    if (!comparisonData) return [];
    
    const metrics = [
      { name: "Market Cap", key: "marketCap", formatter: (value: number) => `$${(value / 1e9).toFixed(2)}B` },
      { name: "Volume 24h", key: "volume24h", formatter: (value: number) => `$${(value / 1e6).toFixed(2)}M` },
      { name: "Price", key: "price", formatter: (value: number) => `$${value.toFixed(2)}` },
    ];
    
    return metrics.map(metric => {
      const dataPoint: any = { name: metric.name };
      
      comparisonData.forEach((crypto: any) => {
        dataPoint[crypto.symbol] = crypto[metric.key];
      });
      
      return dataPoint;
    });
  }, [comparisonData]);
  
  // Update available cryptos when topCryptos is loaded
  useEffect(() => {
    if (topCryptos?.data) {
      setAvailableCryptos(topCryptos.data);
    }
  }, [topCryptos]);
  
  // Remove a cryptocurrency from comparison
  const removeCrypto = (id: number) => {
    setSelectedCryptos(selectedCryptos.filter(cryptoId => cryptoId !== id));
  };
  
  // Get crypto color based on symbol (for consistent colors)
  const getCryptoColor = (symbol: string) => {
    const colors = ["#2563eb", "#7c3aed", "#f59e0b", "#10b981", "#ef4444", "#8b5cf6", "#ec4899", "#14b8a6"];
    const sum = symbol.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return colors[sum % colors.length];
  };
  
  return (
    <div className="mt-6 bg-white dark:bg-slate-900 rounded-xl shadow-sm p-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-semibold">Cryptocurrency Comparison</h2>
        <Button variant="default" size="sm" className="bg-primary text-white rounded-lg hover:bg-primary/90">
          <i className="ri-bar-chart-horizontal-line mr-1"></i>
          Compare More
        </Button>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        {isLoadingComparison ? (
          // Loading state
          Array(3).fill(0).map((_, i) => (
            <div key={i} className="bg-slate-50 dark:bg-slate-800 rounded-lg p-4 border border-slate-200 dark:border-slate-700">
              <div className="flex justify-between items-start mb-4">
                <div className="flex items-center">
                  <Skeleton className="w-10 h-10 rounded-full mr-3" />
                  <div>
                    <Skeleton className="h-4 w-24 mb-1" />
                    <Skeleton className="h-3 w-12" />
                  </div>
                </div>
                <Skeleton className="w-6 h-6 rounded" />
              </div>
              
              {Array(4).fill(0).map((_, j) => (
                <div key={j} className="flex justify-between mb-2">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-4 w-16" />
                </div>
              ))}
              
              <div className="mt-4">
                <Skeleton className="h-4 w-32" />
              </div>
            </div>
          ))
        ) : comparisonData && comparisonData.length > 0 ? (
          // Crypto comparison cards
          comparisonData.map((crypto: any) => (
            <div key={crypto.id} className="bg-slate-50 dark:bg-slate-800 rounded-lg p-4 border border-slate-200 dark:border-slate-700">
              <div className="flex justify-between items-start mb-4">
                <div className="flex items-center">
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center mr-3`}
                    style={{ backgroundColor: `${getCryptoColor(crypto.symbol)}20`, color: getCryptoColor(crypto.symbol) }}
                  >
                    <span className="font-bold text-xs">{crypto.symbol}</span>
                  </div>
                  <div>
                    <div className="font-medium">{crypto.name}</div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">{crypto.symbol}</div>
                  </div>
                </div>
                <button 
                  className="text-slate-400 hover:text-red-500"
                  onClick={() => removeCrypto(crypto.id)}
                >
                  <i className="ri-close-line"></i>
                </button>
              </div>
              
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm text-slate-500 dark:text-slate-400">Price</span>
                  <span className="text-sm font-medium">
                    {crypto.price ? `$${crypto.price.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : 'N/A'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-slate-500 dark:text-slate-400">Market Cap</span>
                  <span className="text-sm font-medium">
                    {crypto.marketCap ? `$${(crypto.marketCap / 1e9).toFixed(1)}B` : 'N/A'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-slate-500 dark:text-slate-400">24h Volume</span>
                  <span className="text-sm font-medium">
                    {crypto.volume24h ? `$${(crypto.volume24h / 1e6).toFixed(1)}M` : 'N/A'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-slate-500 dark:text-slate-400">Active Addresses</span>
                  <span className="text-sm font-medium">
                    {crypto.activeAddresses ? crypto.activeAddresses.toLocaleString() : 'N/A'}
                  </span>
                </div>
              </div>
              
              <div className="mt-4">
                <a 
                  href="#" 
                  className="text-sm text-primary hover:underline flex items-center"
                  onClick={(e) => {
                    e.preventDefault();
                    window.open(`/explorer/${crypto.id}`, '_blank');
                  }}
                >
                  <i className="ri-external-link-line mr-1"></i>
                  View Explorer
                </a>
              </div>
            </div>
          ))
        ) : (
          <div className="col-span-3 text-center py-4 text-slate-500 dark:text-slate-400">
            No cryptocurrencies selected for comparison.
          </div>
        )}
      </div>
      
      <div className="mt-6">
        <h3 className="text-lg font-medium mb-4">Comparison Chart</h3>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-4 h-64">
          {isLoadingComparison ? (
            <div className="w-full h-full flex items-center justify-center">
              <Skeleton className="w-full h-full" />
            </div>
          ) : comparisonData && comparisonData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={chartData}
                margin={{
                  top: 20,
                  right: 30,
                  left: 20,
                  bottom: 5,
                }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Legend />
                {comparisonData.map((crypto: any) => (
                  <Bar 
                    key={crypto.id}
                    dataKey={crypto.symbol} 
                    name={crypto.name}
                    fill={getCryptoColor(crypto.symbol)} 
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="w-full h-full flex items-center justify-center text-slate-500 dark:text-slate-400">
              Select cryptocurrencies to compare
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ComparisonTool;
