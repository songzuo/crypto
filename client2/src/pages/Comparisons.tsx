import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar
} from "recharts";
import { comparisonMetrics, timeframes } from "@/lib/constants";

const Comparisons: React.FC = () => {
  const [selectedCryptos, setSelectedCryptos] = useState<number[]>([1, 2, 3]); // Default select first 3 cryptos
  const [searchTerm, setSearchTerm] = useState("");
  const [chartType, setChartType] = useState("bar");
  const [selectedMetric, setSelectedMetric] = useState("marketCap");
  const [selectedTimeframe, setSelectedTimeframe] = useState("7d");

  // Get top cryptocurrencies to choose from
  const { data: topCryptos, isLoading: isLoadingTopCryptos } = useQuery({
    queryKey: ["/api/cryptocurrencies?limit=50"],
  });

  // Get comparison data for selected cryptocurrencies
  const { data: comparisonData, isLoading: isLoadingComparison } = useQuery({
    queryKey: [`/api/compare?ids=${selectedCryptos.join(',')}`],
    enabled: selectedCryptos.length > 0,
  });

  // Find cryptocurrency by ID
  const findCryptoById = (id: number) => {
    if (!topCryptos?.data) return null;
    return topCryptos?.data?.find((crypto: any) => crypto.id === id);
  };

  // Handle adding a cryptocurrency to comparison
  const addCrypto = (id: number) => {
    if (selectedCryptos.includes(id) || selectedCryptos.length >= 5) return;
    setSelectedCryptos([...selectedCryptos, id]);
  };

  // Handle removing a cryptocurrency from comparison
  const removeCrypto = (id: number) => {
    setSelectedCryptos(selectedCryptos.filter(cryptoId => cryptoId !== id));
  };

  // Get cryptocurrency color based on symbol
  const getCryptoColor = (symbol: string) => {
    const colors = ["#2563eb", "#7c3aed", "#f59e0b", "#10b981", "#ef4444", "#8b5cf6", "#ec4899", "#14b8a6"];
    const sum = symbol.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return colors[sum % colors.length];
  };
  
  // Prepare data for different chart types
  const prepareChartData = () => {
    if (!comparisonData) return [];
    
    if (chartType === "radar") {
      // For radar chart, we need to transform data to put metrics as labels
      const metrics = ["marketCap", "volume24h", "priceChange24h"];
      
      return metrics.map(metric => {
        const dataPoint: any = { metric: metric === "marketCap" ? "Market Cap" : metric === "volume24h" ? "Volume" : "Price Change" };
        
        comparisonData.forEach((crypto: any) => {
          // Normalize values for radar chart
          if (metric === "marketCap") {
            dataPoint[crypto.symbol] = Math.log10(crypto[metric] || 1);
          } else if (metric === "volume24h") {
            dataPoint[crypto.symbol] = Math.log10(crypto[metric] || 1);
          } else {
            dataPoint[crypto.symbol] = crypto[metric] || 0;
          }
        });
        
        return dataPoint;
      });
    } else if (chartType === "pie") {
      // For pie chart, only look at selected metric
      return comparisonData.map((crypto: any) => ({
        name: crypto.symbol,
        value: crypto[selectedMetric] || 0
      }));
    } else {
      // For bar and line charts
      const metricData: any = { name: comparisonMetrics.find(m => m.id === selectedMetric)?.label || selectedMetric };
      
      comparisonData.forEach((crypto: any) => {
        metricData[crypto.symbol] = crypto[selectedMetric] || 0;
      });
      
      return [metricData];
    }
  };

  // Filter cryptocurrencies based on search term
  const filteredCryptos = topCryptos?.data?.filter((crypto: any) => 
    crypto.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    crypto.symbol.toLowerCase().includes(searchTerm.toLowerCase())
  ) || [];

  return (
    <div className="p-6">
      {/* Page Title */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Cryptocurrency Comparisons</h1>
        <p className="text-slate-500 dark:text-slate-400">
          Compare metrics and performance between different cryptocurrencies
        </p>
      </div>

      {/* Comparison Tool */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 mb-6">
        {/* Left Side - Cryptocurrency Selection */}
        <div className="lg:col-span-1">
          <Card>
            <CardHeader>
              <CardTitle>Add Cryptocurrencies</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <Input
                    placeholder="Search cryptocurrencies..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
                
                <div className="max-h-[300px] overflow-y-auto border rounded-md border-slate-200 dark:border-slate-700">
                  {isLoadingTopCryptos ? (
                    Array(5).fill(0).map((_, i) => (
                      <div key={i} className="p-2 border-b border-slate-200 dark:border-slate-700 last:border-0">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center">
                            <Skeleton className="h-8 w-8 rounded-full mr-2" />
                            <div>
                              <Skeleton className="h-4 w-20 mb-1" />
                              <Skeleton className="h-3 w-10" />
                            </div>
                          </div>
                          <Skeleton className="h-8 w-8 rounded" />
                        </div>
                      </div>
                    ))
                  ) : filteredCryptos.length > 0 ? (
                    filteredCryptos.map((crypto: any) => (
                      <div key={crypto.id} className="p-2 border-b border-slate-200 dark:border-slate-700 last:border-0 hover:bg-slate-50 dark:hover:bg-slate-800">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center">
                            <div className="w-8 h-8 rounded-full flex items-center justify-center mr-2" style={{ backgroundColor: `${getCryptoColor(crypto.symbol)}20` }}>
                              <span className="font-bold text-xs" style={{ color: getCryptoColor(crypto.symbol) }}>
                                {crypto.symbol.substring(0, 3)}
                              </span>
                            </div>
                            <div>
                              <div className="font-medium text-sm">{crypto.name}</div>
                              <div className="text-xs text-slate-500 dark:text-slate-400">
                                {crypto.symbol}
                              </div>
                            </div>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => addCrypto(crypto.id)}
                            disabled={selectedCryptos.includes(crypto.id) || selectedCryptos.length >= 5}
                          >
                            <i className={`ri-${selectedCryptos.includes(crypto.id) ? 'check-line text-green-500' : 'add-line'}`}></i>
                          </Button>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="p-4 text-center text-slate-500 dark:text-slate-400">
                      No cryptocurrencies found matching your search.
                    </div>
                  )}
                </div>

                <div className="text-sm text-slate-500 dark:text-slate-400">
                  {selectedCryptos.length}/5 cryptocurrencies selected
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right Side - Comparison Area */}
        <div className="lg:col-span-3">
          <Card>
            <CardHeader className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <CardTitle>Comparison</CardTitle>
              <div className="flex flex-wrap gap-2">
                <Select value={chartType} onValueChange={setChartType}>
                  <SelectTrigger className="w-[120px]">
                    <SelectValue placeholder="Chart Type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bar">Bar Chart</SelectItem>
                    <SelectItem value="line">Line Chart</SelectItem>
                    <SelectItem value="pie">Pie Chart</SelectItem>
                    <SelectItem value="radar">Radar Chart</SelectItem>
                  </SelectContent>
                </Select>
                
                <Select value={selectedMetric} onValueChange={setSelectedMetric}>
                  <SelectTrigger className="w-[150px]">
                    <SelectValue placeholder="Metric" />
                  </SelectTrigger>
                  <SelectContent>
                    {comparisonMetrics.map(metric => (
                      <SelectItem key={metric.id} value={metric.id}>
                        {metric.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                
                <Select value={selectedTimeframe} onValueChange={setSelectedTimeframe}>
                  <SelectTrigger className="w-[100px]">
                    <SelectValue placeholder="Timeframe" />
                  </SelectTrigger>
                  <SelectContent>
                    {timeframes.map(timeframe => (
                      <SelectItem key={timeframe.value} value={timeframe.value}>
                        {timeframe.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent>
              {isLoadingComparison || selectedCryptos.length === 0 ? (
                <div className="min-h-[300px] flex items-center justify-center">
                  {isLoadingComparison ? (
                    <Skeleton className="h-[300px] w-full" />
                  ) : (
                    <div className="text-center text-slate-500 dark:text-slate-400">
                      Select cryptocurrencies to compare
                    </div>
                  )}
                </div>
              ) : comparisonData && comparisonData.length > 0 ? (
                <>
                  {/* Selected Cryptocurrencies */}
                  <div className="mb-6 flex flex-wrap gap-2">
                    {comparisonData.map((crypto: any) => (
                      <div
                        key={crypto.id}
                        className="flex items-center bg-slate-100 dark:bg-slate-800 rounded-full px-3 py-1"
                      >
                        <div
                          className="w-5 h-5 rounded-full flex items-center justify-center mr-2"
                          style={{ backgroundColor: `${getCryptoColor(crypto.symbol)}20`, color: getCryptoColor(crypto.symbol) }}
                        >
                          <span className="font-bold text-xs">{crypto.symbol.substring(0, 2)}</span>
                        </div>
                        <span className="mr-2">{crypto.name}</span>
                        <button
                          className="text-slate-400 hover:text-red-500"
                          onClick={() => removeCrypto(crypto.id)}
                        >
                          <i className="ri-close-line"></i>
                        </button>
                      </div>
                    ))}
                  </div>

                  {/* Chart */}
                  <div className="h-[400px]">
                    <ResponsiveContainer width="100%" height="100%">
                      {chartType === "bar" && (
                        <BarChart data={prepareChartData()}>
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
                      )}
                      
                      {chartType === "line" && (
                        <LineChart data={prepareChartData()}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="name" />
                          <YAxis />
                          <Tooltip />
                          <Legend />
                          {comparisonData.map((crypto: any) => (
                            <Line
                              key={crypto.id}
                              type="monotone"
                              dataKey={crypto.symbol}
                              name={crypto.name}
                              stroke={getCryptoColor(crypto.symbol)}
                              activeDot={{ r: 8 }}
                            />
                          ))}
                        </LineChart>
                      )}
                      
                      {chartType === "pie" && (
                        <PieChart>
                          <Pie
                            data={prepareChartData()}
                            dataKey="value"
                            nameKey="name"
                            cx="50%"
                            cy="50%"
                            outerRadius={150}
                            fill="#8884d8"
                            label={(entry) => entry.name}
                          >
                            {prepareChartData().map((entry: any, index: number) => (
                              <Cell
                                key={`cell-${index}`}
                                fill={getCryptoColor(entry.name)}
                              />
                            ))}
                          </Pie>
                          <Tooltip
                            formatter={(value: any) => {
                              const formatter = comparisonMetrics.find(m => m.id === selectedMetric)?.formatter;
                              return formatter ? formatter(value) : value;
                            }}
                          />
                          <Legend />
                        </PieChart>
                      )}
                      
                      {chartType === "radar" && (
                        <RadarChart cx="50%" cy="50%" outerRadius={150} data={prepareChartData()}>
                          <PolarGrid />
                          <PolarAngleAxis dataKey="metric" />
                          <PolarRadiusAxis />
                          {comparisonData.map((crypto: any) => (
                            <Radar
                              key={crypto.id}
                              name={crypto.name}
                              dataKey={crypto.symbol}
                              stroke={getCryptoColor(crypto.symbol)}
                              fill={getCryptoColor(crypto.symbol)}
                              fillOpacity={0.2}
                            />
                          ))}
                          <Legend />
                          <Tooltip />
                        </RadarChart>
                      )}
                    </ResponsiveContainer>
                  </div>
                </>
              ) : (
                <div className="min-h-[300px] flex items-center justify-center text-slate-500 dark:text-slate-400">
                  No data available for selected cryptocurrencies
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Comparison Details */}
      {comparisonData && comparisonData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Detailed Comparison</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-700">
                    <th className="text-left p-2">Metric</th>
                    {comparisonData.map((crypto: any) => (
                      <th key={crypto.id} className="text-right p-2">
                        <div className="flex items-center justify-end">
                          <div
                            className="w-5 h-5 rounded-full flex items-center justify-center mr-2"
                            style={{ backgroundColor: `${getCryptoColor(crypto.symbol)}20`, color: getCryptoColor(crypto.symbol) }}
                          >
                            <span className="font-bold text-xs">{crypto.symbol.substring(0, 2)}</span>
                          </div>
                          {crypto.name}
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {comparisonMetrics.map(metric => (
                    <tr key={metric.id} className="border-b border-slate-200 dark:border-slate-700">
                      <td className="p-2 text-slate-600 dark:text-slate-300">{metric.label}</td>
                      {comparisonData.map((crypto: any) => {
                        const value = crypto[metric.id];
                        return (
                          <td key={`${crypto.id}-${metric.id}`} className="text-right p-2">
                            {value !== undefined && value !== null
                              ? metric.formatter(value)
                              : "N/A"}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default Comparisons;
