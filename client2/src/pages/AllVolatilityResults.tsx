import React, { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts';
import { TrendingUp, TrendingDown, BarChart3, Activity } from 'lucide-react';

interface VolatilityEntry {
  symbol: string;
  name: string;
  volatilityPercentage: number;
  category: string;
  priceChange24h: number;
  volumeChange24h: number;
  marketCapChange24h: number;
  volatilityDirection: string;
  riskLevel: string;
  volatilityRank: number;
  analysisTime: string;
}

interface VolatilityStats {
  category: string;
  count: number;
  avgVolatility: number;
  minVolatility: number;
  maxVolatility: number;
}

interface VolatilityData {
  entries: VolatilityEntry[];
  stats: VolatilityStats[];
  total: number;
  batchId: number;
  algorithm: {
    name: string;
    description: string;
    dataPoints: string;
    calculation: string;
  };
}

const AllVolatilityResults: React.FC = () => {
  const [selectedPeriod, setSelectedPeriod] = useState('all');
  
  const { data: volatilityData, isLoading, error, refetch } = useQuery<{ success: boolean; data: VolatilityData }>({
    queryKey: ['all-volatility-results', selectedPeriod],
    queryFn: async () => {
      const response = await fetch(`/api/volatility-analysis/all-results?period=${selectedPeriod}&limit=1000`);
      if (!response.ok) {
        throw new Error('Failed to fetch volatility results');
      }
      return response.json();
    },
    refetchInterval: 10000, // 每10秒刷新一次
  });

  // 查询统一分析进度
  const { data: progressData } = useQuery<any>({
    queryKey: ['unified-analysis-progress'],
    queryFn: async () => {
      const response = await fetch('/api/volatility-analysis/unified-progress');
      if (!response.ok) {
        throw new Error('Failed to fetch progress');
      }
      return response.json();
    },
    refetchInterval: 5000, // 每5秒刷新一次
  });

  // 查询简化统一分析进度
  const { data: simpleProgressData } = useQuery<any>({
    queryKey: ['simple-unified-analysis-progress'],
    queryFn: async () => {
      const response = await fetch('/api/volatility-analysis/simple-unified-progress');
      if (!response.ok) {
        throw new Error('Failed to fetch simple progress');
      }
      return response.json();
    },
    refetchInterval: 3000, // 每3秒刷新一次
  });

  const handleCorrectVolatilityTrigger = async () => {
    try {
      const response = await fetch('/api/volatility-analysis/correct-trigger', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      if (response.ok) {
        const result = await response.json();
        alert('7天波动性重新计算已启动！将使用正确的标准差算法分析所有加密货币。');
        // 延迟几秒后刷新数据
        setTimeout(() => {
          refetch();
        }, 5000);
      } else {
        throw new Error('启动失败');
      }
    } catch (error) {
      alert('启动7天波动性计算失败：' + error.message);
    }
  };

  const handleCorrect30DayTrigger = async () => {
    try {
      const response = await fetch('/api/volatility-analysis/correct-30day-trigger', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      if (response.ok) {
        const result = await response.json();
        alert('30天波动性重新计算已启动！将使用正确的标准差算法分析所有加密货币。');
        // 延迟几秒后刷新数据
        setTimeout(() => {
          refetch();
        }, 5000);
      } else {
        throw new Error('启动失败');
      }
    } catch (error) {
      alert('启动30天波动性计算失败：' + error.message);
    }
  };

  const handleUnifiedAnalysisTrigger = async () => {
    try {
      const response = await fetch('/api/volatility-analysis/unified-trigger', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      if (response.ok) {
        const result = await response.json();
        alert('统一波动性分析已启动！将合并三个栏目，分析所有3496个加密货币，支持断点续传。');
        // 延迟几秒后刷新数据
        setTimeout(() => {
          refetch();
        }, 5000);
      } else {
        throw new Error('启动失败');
      }
    } catch (error) {
      alert('启动统一波动性分析失败：' + error.message);
    }
  };

  const data = volatilityData?.data;

  const getVolatilityColor = (volatility: number) => {
    if (volatility < 0.01) return 'text-green-600';
    if (volatility < 0.02) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getVolatilityBadge = (volatility: number) => {
    if (volatility < 0.01) return <Badge variant="secondary" className="bg-green-100 text-green-800">低</Badge>;
    if (volatility < 0.02) return <Badge variant="secondary" className="bg-yellow-100 text-yellow-800">中</Badge>;
    return <Badge variant="secondary" className="bg-red-100 text-red-800">高</Badge>;
  };

  const formatVolatility = (value: number) => {
    return `${(value * 100).toFixed(4)}%`;
  };

  const formatNumber = (value: number) => {
    return value.toFixed(6);
  };

  if (isLoading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-lg">加载波动性分析结果...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-red-600 mb-4">加载失败: {error.message}</p>
              <Button onClick={() => refetch()}>重试</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardContent className="pt-6">
            <p className="text-center text-gray-500">没有找到波动性分析数据</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // 修正后的数据处理 - 所有数据都来自修正后的批次104
  const entries7d = data?.entries || []; // 现在所有数据都是基于修正后的算法
  const entries30d = []; // 暂时为空，因为30天数据需要单独的实现
  const stats7d = {
    count: data?.total || 0,
    avgVolatility: data?.stats ? data.stats.reduce((sum, stat) => sum + stat.avgVolatility * stat.count, 0) / (data.total || 1) : 0,
    minVolatility: data?.stats ? Math.min(...data.stats.map(s => s.minVolatility)) : 0,
    maxVolatility: data?.stats ? Math.max(...data.stats.map(s => s.maxVolatility)) : 0
  };
  const stats30d = null; // 暂时为空

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">完整波动性分析结果</h1>
          <p className="text-gray-600 mt-2">
            基于修正后的算法，使用symbol标识符分析所有加密货币的波动性
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => refetch()}>
            <Activity className="h-4 w-4 mr-2" />
            刷新数据
          </Button>
          <Button onClick={handleUnifiedAnalysisTrigger} variant="default">
            <BarChart3 className="h-4 w-4 mr-2" />
            启动统一波动性分析
          </Button>
          <Button 
            onClick={() => {
              fetch('/api/volatility-analysis/simple-unified-trigger', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
              })
              .then(response => response.json())
              .then(data => {
                console.log('简化统一波动性分析已启动:', data);
                refetch();
              })
              .catch(error => {
                console.error('启动简化统一波动性分析失败:', error);
              });
            }}
            variant="outline"
            className="bg-purple-50 border-purple-200 text-purple-700 hover:bg-purple-100"
          >
            <BarChart3 className="h-4 w-4 mr-2" />
            简化统一分析
          </Button>
          <Button onClick={handleCorrectVolatilityTrigger} variant="outline">
            <BarChart3 className="h-4 w-4 mr-2" />
            重新计算7天波动性
          </Button>
          <Button onClick={handleCorrect30DayTrigger} variant="outline">
            <BarChart3 className="h-4 w-4 mr-2" />
            重新计算30天波动性
          </Button>
        </div>
      </div>

      {/* 统一分析进度显示 */}
      {progressData && progressData.status === 'running' && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-lg">统一波动性分析进度</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span>分析进度</span>
                <span>{progressData.processed || 0} / {progressData.total || 0} ({progressData.percentage || 0}%)</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div 
                  className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${progressData.percentage || 0}%` }}
                />
              </div>
              <div className="text-sm text-gray-600">
                还有 {progressData.remaining || 0} 个加密货币待分析
              </div>
              <div className="text-xs text-gray-500">
                批次ID: {progressData.batchId} | 开始时间: {progressData.startTime ? new Intl.DateTimeFormat('zh-CN', {
                  year: 'numeric',
                  month: '2-digit',
                  day: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit',
                  hour12: false
                }).format(new Date(progressData.startTime)) : ''}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 简化统一分析进度显示 */}
      {simpleProgressData && simpleProgressData.status === 'running' && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-lg text-purple-700">简化统一波动性分析进度</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span>分析进度</span>
                <span>{simpleProgressData.processed || 0} / {simpleProgressData.total || 0} ({simpleProgressData.progress || 0}%)</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div 
                  className="bg-purple-500 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${simpleProgressData.progress || 0}%` }}
                />
              </div>
              <div className="text-sm text-gray-600">
                还有 {simpleProgressData.remaining || 0} 个加密货币待分析
              </div>
              <div className="text-xs text-gray-500">
                批次ID: {simpleProgressData.batchId} | 开始时间: {simpleProgressData.startTime ? new Intl.DateTimeFormat('zh-CN', {
                  year: 'numeric',
                  month: '2-digit',
                  day: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit',
                  hour12: false
                }).format(new Date(simpleProgressData.startTime)) : ''}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 算法信息 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            算法详情
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <h3 className="font-semibold text-lg">{data?.algorithm?.name || '未知算法'}</h3>
              <p className="text-gray-600 mt-1">{data?.algorithm?.description || '暂无描述'}</p>
            </div>
            <div>
              <h4 className="font-medium">数据规模</h4>
              <p className="text-sm text-gray-600">{data?.algorithm?.dataPoints || '未知'}</p>
              <h4 className="font-medium mt-2">计算方法</h4>
              <p className="text-sm text-gray-600">{data?.algorithm?.calculation || '未知'}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 统计概览 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {stats7d && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-blue-600" />
                7天波动性分析
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">分析数量:</span>
                  <span className="font-medium">{stats7d.count} 个加密货币</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">平均波动性:</span>
                  <span className="font-medium">{formatVolatility(stats7d.avgVolatility)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">最低波动性:</span>
                  <span className="font-medium text-green-600">{formatVolatility(stats7d.minVolatility)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">最高波动性:</span>
                  <span className="font-medium text-red-600">{formatVolatility(stats7d.maxVolatility)}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {stats30d && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingDown className="h-5 w-5 text-purple-600" />
                30天波动性分析
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">分析数量:</span>
                  <span className="font-medium">{stats30d.count} 个加密货币</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">平均波动性:</span>
                  <span className="font-medium">{formatVolatility(stats30d.avgVolatility)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">最低波动性:</span>
                  <span className="font-medium text-green-600">{formatVolatility(stats30d.minVolatility)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">最高波动性:</span>
                  <span className="font-medium text-red-600">{formatVolatility(stats30d.maxVolatility)}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* 详细结果 */}
      <Tabs defaultValue="7d" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="7d">7天分析 ({entries7d.length})</TabsTrigger>
          <TabsTrigger value="30d">30天分析 ({entries30d.length})</TabsTrigger>
          <TabsTrigger value="all">全部结果 ({data?.total || 0})</TabsTrigger>
        </TabsList>

        <TabsContent value="7d" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>7天波动性分析结果</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-2">排名</th>
                      <th className="text-left p-2">代币</th>
                      <th className="text-left p-2">名称</th>
                      <th className="text-left p-2">波动性</th>
                      <th className="text-left p-2">等级</th>
                      <th className="text-left p-2">风险等级</th>
                      <th className="text-left p-2">方向</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entries7d.map((entry, index) => (
                      <tr key={`${entry.symbol}-${index}`} className="border-b hover:bg-gray-50">
                        <td className="p-2 font-medium">{entry.volatilityRank || index + 1}</td>
                        <td className="p-2 font-mono font-bold">{entry.symbol}</td>
                        <td className="p-2">{entry.name}</td>
                        <td className={`p-2 font-medium ${getVolatilityColor(entry.volatilityPercentage)}`}>
                          {formatVolatility(entry.volatilityPercentage)}
                        </td>
                        <td className="p-2">{getVolatilityBadge(entry.volatilityPercentage)}</td>
                        <td className="p-2">
                          <Badge variant={entry.riskLevel === '高风险' ? 'destructive' : entry.riskLevel === '中风险' ? 'secondary' : 'outline'}>
                            {entry.riskLevel || '未知'}
                          </Badge>
                        </td>
                        <td className="p-2">
                          <span className={`flex items-center ${entry.volatilityDirection === 'up' ? 'text-green-600' : entry.volatilityDirection === 'down' ? 'text-red-600' : 'text-gray-600'}`}>
                            {entry.volatilityDirection === 'up' ? <TrendingUp className="h-4 w-4 mr-1" /> : entry.volatilityDirection === 'down' ? <TrendingDown className="h-4 w-4 mr-1" /> : null}
                            {entry.volatilityDirection || '稳定'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="30d" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>30天波动性分析结果</CardTitle>
            </CardHeader>
            <CardContent>
              {entries30d.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left p-2">排名</th>
                        <th className="text-left p-2">代币</th>
                        <th className="text-left p-2">名称</th>
                        <th className="text-left p-2">波动性</th>
                        <th className="text-left p-2">等级</th>
                        <th className="text-left p-2">数据点</th>
                        <th className="text-left p-2">比较次数</th>
                      </tr>
                    </thead>
                    <tbody>
                      {entries30d.map((entry, index) => (
                        <tr key={`${entry.symbol}-${entry.period}`} className="border-b hover:bg-gray-50">
                          <td className="p-2 font-medium">{index + 1}</td>
                          <td className="p-2 font-mono font-bold">{entry.symbol}</td>
                          <td className="p-2">{entry.name}</td>
                          <td className={`p-2 font-medium ${getVolatilityColor(entry.volatilityPercentage)}`}>
                            {formatVolatility(entry.volatilityPercentage)}
                          </td>
                          <td className="p-2">{getVolatilityBadge(entry.volatilityPercentage)}</td>
                          <td className="p-2">{entry.dataPoints}</td>
                          <td className="p-2">{entry.comparisons}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-center py-8">
                  <p className="text-gray-500">暂无30天波动性分析数据</p>
                  <p className="text-sm text-gray-400 mt-2">
                    30天分析需要31个数据点，目前系统正在收集足够的历史数据
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="all" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>全部波动性分析结果</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-2">排名</th>
                      <th className="text-left p-2">代币</th>
                      <th className="text-left p-2">名称</th>
                      <th className="text-left p-2">周期</th>
                      <th className="text-left p-2">波动性</th>
                      <th className="text-left p-2">等级</th>
                      <th className="text-left p-2">数据点</th>
                      <th className="text-left p-2">比较次数</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data?.entries || []).map((entry, index) => (
                      <tr key={`${entry.symbol}-${entry.period}`} className="border-b hover:bg-gray-50">
                        <td className="p-2 font-medium">{index + 1}</td>
                        <td className="p-2 font-mono font-bold">{entry.symbol}</td>
                        <td className="p-2">{entry.name}</td>
                        <td className="p-2">
                          <Badge variant={entry.period === '7d' ? 'default' : 'secondary'}>
                            {entry.period}
                          </Badge>
                        </td>
                        <td className={`p-2 font-medium ${getVolatilityColor(entry.volatilityPercentage)}`}>
                          {formatVolatility(entry.volatilityPercentage)}
                        </td>
                        <td className="p-2">{getVolatilityBadge(entry.volatilityPercentage)}</td>
                        <td className="p-2">{entry.dataPoints}</td>
                        <td className="p-2">{entry.comparisons}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default AllVolatilityResults;