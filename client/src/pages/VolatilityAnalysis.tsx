import React, { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TrendingUp, TrendingDown, ArrowRight, BarChart3, AlertTriangle, CheckCircle, RefreshCw, PlayCircle, StopCircle, Database, Clock } from 'lucide-react';
import { queryClient } from '@/lib/queryClient';

interface VolatilityBatch {
  id: number;
  createdAt: string;
  timeframe: string;
  totalAnalyzed: number;
  analysisType: string;
}

interface VolatilityEntry {
  symbol: string;
  name: string;
  period: '7d' | '30d';
  volatilityPercentage: number;
  direction: 'up' | 'down' | 'stable';
  category: string;
  rank: number;
  dataPoints: number;
  comparisons: number;
  averageMarketCap: number;
  marketCapChange: number;
}

interface AnalysisProgress {
  batchId: string | null;
  totalCryptocurrencies: number;
  processedCount: number;
  completedCount: number;
  isComplete: boolean;
  progressPercentage: number;
  startTime: string | null;
  estimatedEndTime?: string | null;
}

const VolatilityAnalysis = () => {
  console.log('波动性分析页面加载，显示历史数据');
  
  const [selectedDirection, setSelectedDirection] = useState<string>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedPeriod, setSelectedPeriod] = useState<'7d' | '30d'>('7d');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(100);
  const [isRunningAnalysis, setIsRunningAnalysis] = useState(false);
  
  // 获取分析进度
  const { data: progressData, refetch: refetchProgress } = useQuery({
    queryKey: ['/api/volatility-analysis/progress'],
    queryFn: async () => {
      const response = await fetch('/api/volatility-analysis/progress');
      if (!response.ok) throw new Error('获取分析进度失败');
      return response.json();
    },
    refetchInterval: 2000, // 每2秒更新一次进度
    enabled: true, // 始终启用，不依赖于isRunningAnalysis状态
    retry: 3
  });

  // 获取波动性分析批次
  const { data: batchesData } = useQuery({
    queryKey: ['/api/volatility-analysis/batches'],
    queryFn: async () => {
      const response = await fetch('/api/volatility-analysis/batches?limit=5');
      if (!response.ok) throw new Error('获取批次数据失败');
      return response.json();
    }
  });

  // 获取波动性分析结果
  const { data: resultsData, isLoading, refetch } = useQuery({
    queryKey: ['/api/volatility-analysis/results', selectedDirection, selectedCategory, selectedPeriod, currentPage, pageSize],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: currentPage.toString(),
        limit: pageSize.toString()
      });
      
      if (selectedDirection) params.append('direction', selectedDirection);
      if (selectedCategory) params.append('category', selectedCategory);
      params.append('period', selectedPeriod);
      
      const response = await fetch(`/api/volatility-analysis/results?${params}`);
      if (!response.ok) throw new Error('获取分析结果失败');
      const data = await response.json();
      
      // 处理数据结构 - 如果API返回数组，包装成预期格式
      if (Array.isArray(data)) {
        return {
          entries: data,
          total: data.length,
          page: currentPage,
          limit: 30
        };
      }
      
      // 如果已经是正确格式，直接返回
      return data;
    }
  });

  // 手动触发7天波动性分析
  const run7DayAnalysis = useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/volatility-analysis/trigger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ period: '7d' })
      });
      if (!response.ok) throw new Error('启动7天分析失败');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/volatility-analysis'] });
      refetch();
      refetchProgress();
    }
  });

  // 手动触发30天波动性分析
  const run30DayAnalysis = useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/volatility-analysis/trigger-30day', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      if (!response.ok) throw new Error('启动30天分析失败');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/volatility-analysis'] });
      refetch();
      refetchProgress();
    }
  });

  // 运行修正后的波动性分析
  const runCorrectedAnalysis = useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/volatility-analysis/run-corrected', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      if (!response.ok) throw new Error('启动修正分析失败');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/volatility-analysis'] });
      refetch();
      refetchProgress();
    }
  });

  // 检查调度器状态
  const { data: schedulerStatus } = useQuery({
    queryKey: ['/api/volatility-analysis/scheduler-status'],
    queryFn: async () => {
      const response = await fetch('/api/volatility-analysis/scheduler-status');
      if (!response.ok) throw new Error('获取调度器状态失败');
      return response.json();
    },
    refetchInterval: 30000 // 每30秒检查一次
  });

  // 获取完整波动性结果
  const { data: allResults } = useQuery({
    queryKey: ['/api/volatility-analysis/all-results', selectedPeriod],
    queryFn: async () => {
      const response = await fetch(`/api/volatility-analysis/all-results?period=${selectedPeriod}&limit=1000`);
      if (!response.ok) throw new Error('获取完整结果失败');
      return response.json();
    }
  });

  // 手动触发波动性分析（保留兼容性）
  const runAnalysis = async () => {
    setIsRunningAnalysis(true);
    try {
      const response = await fetch('/api/volatility-analysis/trigger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      
      if (response.ok) {
        await queryClient.invalidateQueries({ queryKey: ['/api/volatility-analysis'] });
        refetch();
        refetchProgress(); // 开始监控进度
      }
    } catch (error) {
      console.error('触发波动性分析失败:', error);
    } finally {
      // 不要立即设置为false，让进度监控来处理
      // setIsRunningAnalysis(false);
    }
  };

  // 触发增强波动性分析
  const triggerEnhancedAnalysis = async () => {
    try {
      setIsRunningAnalysis(true);
      
      const response = await fetch('/api/volatility-analysis/trigger-enhanced', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        }
      });
      
      if (!response.ok) {
        throw new Error('触发增强分析失败');
      }
      
      const result = await response.json();
      console.log('增强分析已启动:', result);
      
      // 开始监控进度
      refetchProgress();
      
    } catch (error) {
      console.error('触发增强分析失败:', error);
      setIsRunningAnalysis(false);
    }
  };

  // 监听分析进度
  useEffect(() => {
    const progress = progressData?.progress;
    console.log('Progress data received:', progress);
    
    if (progress && progress.progressPercentage > 0 && progress.progressPercentage < 100) {
      setIsRunningAnalysis(true);
    } else if (progress && progress.progressPercentage >= 100) {
      setIsRunningAnalysis(false);
      // 刷新数据
      refetch();
      queryClient.invalidateQueries({ queryKey: ['/api/volatility-analysis/batches'] });
    }
  }, [progressData, refetch, queryClient]);

  const progress = progressData?.progress;
  const showProgress = progress && progress.progressPercentage > 0 && progress.progressPercentage < 100;

  const getVolatilityIcon = (direction: string) => {
    switch (direction) {
      case 'up': return <TrendingUp className="h-4 w-4 text-green-500" />;
      case 'down': return <TrendingDown className="h-4 w-4 text-red-500" />;
      default: return <ArrowRight className="h-4 w-4 text-gray-500" />;
    }
  };

  const getCategoryColor = (category: string) => {
    switch (category) {
      case '极高': return 'bg-red-100 text-red-800 border-red-200';
      case '高': return 'bg-orange-100 text-orange-800 border-orange-200';
      case '中': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case '低': return 'bg-blue-100 text-blue-800 border-blue-200';
      case '极低': return 'bg-gray-100 text-gray-800 border-gray-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getRiskIcon = (riskLevel: string) => {
    switch (riskLevel) {
      case '高风险': return <AlertTriangle className="h-4 w-4 text-red-500" />;
      case '中风险': return <BarChart3 className="h-4 w-4 text-yellow-500" />;
      case '低风险': return <CheckCircle className="h-4 w-4 text-green-500" />;
      default: return <BarChart3 className="h-4 w-4 text-gray-500" />;
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">波动性分析中心</h1>
          <p className="text-muted-foreground mt-2">
            全面的加密货币波动性分析、自动调度和数据挖掘系统
          </p>
        </div>
        <div className="flex gap-2">
          <Button 
            onClick={() => run7DayAnalysis.mutate()}
            disabled={run7DayAnalysis.isPending}
            variant="outline"
            className="flex items-center space-x-2"
          >
            {run7DayAnalysis.isPending ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>7天分析中</span>
              </>
            ) : (
              <>
                <PlayCircle className="w-4 h-4" />
                <span>启动7天分析</span>
              </>
            )}
          </Button>
          <Button 
            onClick={() => run30DayAnalysis.mutate()}
            disabled={run30DayAnalysis.isPending}
            variant="outline"
            className="flex items-center space-x-2"
          >
            {run30DayAnalysis.isPending ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>30天分析中</span>
              </>
            ) : (
              <>
                <Clock className="w-4 h-4" />
                <span>启动30天分析</span>
              </>
            )}
          </Button>
          <Button 
            onClick={() => runCorrectedAnalysis.mutate()}
            disabled={runCorrectedAnalysis.isPending}
            className="flex items-center space-x-2"
          >
            {runCorrectedAnalysis.isPending ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>修正分析中</span>
              </>
            ) : (
              <>
                <Database className="w-4 h-4" />
                <span>运行修正分析</span>
              </>
            )}
          </Button>
        </div>
      </div>

      {/* 调度器状态监控 */}
      {schedulerStatus && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Clock className="w-5 h-5" />
              <span>自动调度状态</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="flex items-center space-x-2">
                <Badge variant={schedulerStatus.isActive ? "default" : "secondary"}>
                  {schedulerStatus.isActive ? "运行中" : "已停止"}
                </Badge>
                <span className="text-sm text-muted-foreground">
                  调度器状态
                </span>
              </div>
              <div className="text-sm">
                <span className="font-medium">下次运行:</span>{" "}
                {schedulerStatus.nextRunTime || "未设置"}
              </div>
              <div className="text-sm">
                <span className="font-medium">上次运行:</span>{" "}
                {schedulerStatus.lastRunTime || "从未运行"}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="results" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="results">分析结果</TabsTrigger>
          <TabsTrigger value="progress">进度监控</TabsTrigger>
          <TabsTrigger value="batches">历史批次</TabsTrigger>
          <TabsTrigger value="settings">设置管理</TabsTrigger>
        </TabsList>

        <TabsContent value="results" className="space-y-4">
          {/* 筛选控件 */}
          <Card>
            <CardContent className="p-6">
              <div className="flex flex-wrap gap-4 items-center">
                <div className="flex items-center gap-2">
                  <label className="text-sm font-medium">时间周期:</label>
                  <Select value={selectedPeriod} onValueChange={(value: '7d' | '30d') => setSelectedPeriod(value)}>
                    <SelectTrigger className="w-40">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="7d">7天分析</SelectItem>
                      <SelectItem value="30d">30天分析</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="flex items-center gap-2">
                  <label className="text-sm font-medium">波动方向:</label>
                  <Select value={selectedDirection} onValueChange={setSelectedDirection}>
                    <SelectTrigger className="w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">全部方向</SelectItem>
                      <SelectItem value="up">上涨 ↑</SelectItem>
                      <SelectItem value="down">下跌 ↓</SelectItem>
                      <SelectItem value="stable">稳定 →</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center gap-2">
                  <label className="text-sm font-medium">风险类别:</label>
                  <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                    <SelectTrigger className="w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">全部类别</SelectItem>
                      <SelectItem value="极高">极高风险</SelectItem>
                      <SelectItem value="高">高风险</SelectItem>
                      <SelectItem value="中">中风险</SelectItem>
                      <SelectItem value="低">低风险</SelectItem>
                      <SelectItem value="极低">极低风险</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center gap-2">
                  <label className="text-sm font-medium">每页显示:</label>
                  <Select value={pageSize.toString()} onValueChange={(value) => setPageSize(parseInt(value))}>
                    <SelectTrigger className="w-20">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="25">25</SelectItem>
                      <SelectItem value="50">50</SelectItem>
                      <SelectItem value="100">100</SelectItem>
                      <SelectItem value="200">200</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 分析结果表格 */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5" />
                波动性分析结果
              </CardTitle>
              <CardDescription>
                根据{selectedPeriod === '7d' ? '7天' : '30天'}数据计算的市值波动性分析
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <RefreshCw className="h-6 w-6 animate-spin mr-2" />
                  <span>加载分析结果...</span>
                </div>
              ) : resultsData?.entries?.length > 0 ? (
                <div className="space-y-4">
                  <div className="text-sm text-muted-foreground">
                    显示 {resultsData.entries.length} 个结果
                  </div>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>排名</TableHead>
                        <TableHead>币种</TableHead>
                        <TableHead>波动性</TableHead>
                        <TableHead>趋势</TableHead>
                        <TableHead>风险等级</TableHead>
                        <TableHead>数据点</TableHead>
                        <TableHead>市值变化</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {resultsData.entries.map((entry: any, index: number) => (
                        <TableRow key={`${entry.symbol}-${index}`}>
                          <TableCell className="font-medium">
                            #{(currentPage - 1) * pageSize + index + 1}
                          </TableCell>
                          <TableCell>
                            <div>
                              <div className="font-medium">{entry.symbol}</div>
                              <div className="text-sm text-muted-foreground truncate max-w-32">
                                {entry.name}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="font-medium">
                              {entry.volatilityPercentage?.toFixed(2) || '0.00'}%
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {getVolatilityIcon(entry.direction || entry.volatilityDirection)}
                              <span className="text-sm">
                                {entry.direction || entry.volatilityDirection || 'stable'}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge className={getCategoryColor(entry.category || entry.riskLevel || '中')}>
                              {entry.category || entry.riskLevel || '中风险'}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="text-sm">
                              <div>{entry.dataPoints || 'N/A'} 点</div>
                              <div className="text-muted-foreground">
                                {entry.comparisons || 'N/A'} 比较
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="text-sm">
                              {entry.marketCapChange ? 
                                `${entry.marketCapChange > 0 ? '+' : ''}${entry.marketCapChange.toFixed(2)}%` : 
                                'N/A'
                              }
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>

                  {/* 分页控制 */}
                  <div className="flex items-center justify-between">
                    <div className="text-sm text-muted-foreground">
                      第 {currentPage} 页，共 {Math.ceil((resultsData.total || 0) / pageSize)} 页
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                        disabled={currentPage <= 1}
                      >
                        上一页
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage(currentPage + 1)}
                        disabled={currentPage >= Math.ceil((resultsData.total || 0) / pageSize)}
                      >
                        下一页
                      </Button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-8">
                  <BarChart3 className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <h3 className="text-lg font-medium mb-2">暂无分析结果</h3>
                  <p className="text-muted-foreground mb-4">
                    点击上方按钮启动波动性分析以查看结果
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="progress" className="space-y-4">
          {/* 分析进度监控 */}
          {showProgress && (
            <Card className="border-l-4 border-l-blue-500">
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold">波动性分析进度</h3>
                  <Badge variant="outline">
                    {progress.progressPercentage}% 完成
                  </Badge>
                </div>
                <Progress value={progress.progressPercentage} className="mb-4" />
                <div className="text-sm text-muted-foreground">
                  已处理 {progress.processedCount} / {progress.totalCryptocurrencies} 个加密货币
                  {progress.progressPercentage < 100 && (
                    <span className="ml-2 text-blue-600 font-medium">
                      还有 {100 - progress.progressPercentage}% 的数据正在计算...
                    </span>
                  )}
                  {progress.message && (
                    <div className="mt-1 text-xs text-gray-500">
                      {progress.message}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* 算法说明 */}
          <Card className="border-l-4 border-l-green-500">
            <CardContent className="p-6">
              <h3 className="text-lg font-semibold mb-4">算法说明</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-blue-50 p-4 rounded-lg">
                  <h4 className="font-medium text-blue-900 mb-2">7天波动性分析</h4>
                  <ul className="text-sm text-blue-800 space-y-1">
                    <li>• 需要至少8个数据点</li>
                    <li>• 进行7次价格比较</li>
                    <li>• 使用最近8个数据点的平均值</li>
                    <li>• 适用于短期波动性评估</li>
                  </ul>
                </div>
                <div className="bg-purple-50 p-4 rounded-lg">
                  <h4 className="font-medium text-purple-900 mb-2">30天波动性分析</h4>
                  <ul className="text-sm text-purple-800 space-y-1">
                    <li>• 需要至少31个数据点</li>
                    <li>• 进行31次价格比较</li>
                    <li>• 每个数据点与其他30个数据点的平均值进行比较</li>
                    <li>• 适用于长期波动性评估</li>
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 完整数据结果预览 */}
          {allResults?.success && allResults.data && (
            <Card>
              <CardHeader>
                <CardTitle>修正分析算法结果</CardTitle>
                <CardDescription>
                  使用{allResults.data.algorithm?.name}的分析结果
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                  <div className="text-center p-4 bg-blue-50 rounded-lg">
                    <div className="text-2xl font-bold text-blue-600">
                      {allResults.data.entries?.length || 0}
                    </div>
                    <div className="text-sm text-blue-800">分析币种总数</div>
                  </div>
                  <div className="text-center p-4 bg-green-50 rounded-lg">
                    <div className="text-2xl font-bold text-green-600">
                      #{allResults.data.batchId}
                    </div>
                    <div className="text-sm text-green-800">批次ID</div>
                  </div>
                  <div className="text-center p-4 bg-purple-50 rounded-lg">
                    <div className="text-2xl font-bold text-purple-600">
                      {allResults.data.algorithm?.dataPoints}
                    </div>
                    <div className="text-sm text-purple-800">数据点配置</div>
                  </div>
                  <div className="text-center p-4 bg-orange-50 rounded-lg">
                    <div className="text-2xl font-bold text-orange-600">
                      实时分析
                    </div>
                    <div className="text-sm text-orange-800">分析状态</div>
                  </div>
                </div>

                {allResults.data.stats && (
                  <div>
                    <h4 className="font-medium mb-3">风险分布统计</h4>
                    <div className="grid grid-cols-1 md:grid-cols-5 gap-2">
                      {allResults.data.stats.map((stat: any) => (
                        <div key={stat.category} className="text-center p-3 border rounded-lg">
                          <div className="font-medium">{stat.count}</div>
                          <div className="text-sm text-muted-foreground">{stat.category}</div>
                          <div className="text-xs text-gray-500">
                            平均: {stat.avgVolatility?.toFixed(2)}%
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="batches" className="space-y-4">
          {/* 批次信息 */}
          {batchesData?.data?.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Database className="h-5 w-5" />
                  历史分析批次
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {batchesData.data.map((batch: VolatilityBatch) => (
                    <div key={batch.id} className="border rounded-lg p-4">
                      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <div className="text-center">
                          <div className="text-lg font-bold text-purple-600">
                            #{batch.id}
                          </div>
                          <div className="text-sm text-muted-foreground">批次编号</div>
                        </div>
                        <div className="text-center">
                          <div className="text-lg font-bold text-blue-600">
                            {batch.totalAnalyzed}
                          </div>
                          <div className="text-sm text-muted-foreground">分析币种</div>
                        </div>
                        <div className="text-center">
                          <div className="text-lg font-bold text-green-600">
                            {batch.timeframe}
                          </div>
                          <div className="text-sm text-muted-foreground">时间周期</div>
                        </div>
                        <div className="text-center">
                          <div className="text-lg font-bold text-orange-600">
                            {new Date(batch.createdAt).toLocaleDateString()}
                          </div>
                          <div className="text-sm text-muted-foreground">创建时间</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="settings" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>自动调度设置</CardTitle>
              <CardDescription>
                配置波动性分析的自动运行计划
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div>
                  <h4 className="font-medium">启用自动调度</h4>
                  <p className="text-sm text-muted-foreground">
                    每小时自动运行波动性分析
                  </p>
                </div>
                <Badge variant={schedulerStatus?.isActive ? "default" : "secondary"}>
                  {schedulerStatus?.isActive ? "运行中" : "已停止"}
                </Badge>
              </div>

              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div>
                  <h4 className="font-medium">7天分析频率</h4>
                  <p className="text-sm text-muted-foreground">
                    短期波动性分析运行频率
                  </p>
                </div>
                <span className="text-sm font-medium">每小时</span>
              </div>

              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div>
                  <h4 className="font-medium">30天分析频率</h4>
                  <p className="text-sm text-muted-foreground">
                    长期波动性分析运行频率
                  </p>
                </div>
                <span className="text-sm font-medium">每日</span>
              </div>

              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div>
                  <h4 className="font-medium">数据质量要求</h4>
                  <p className="text-sm text-muted-foreground">
                    确保足够的数据点进行分析
                  </p>
                </div>
                <span className="text-sm font-medium">7天≥8点, 30天≥31点</span>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default VolatilityAnalysis;