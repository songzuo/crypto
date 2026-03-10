import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { TrendingUp, TrendingDown, BarChart3, AlertTriangle, CheckCircle, Calendar } from 'lucide-react';
import { queryClient } from '@/lib/queryClient';

interface ThirtyDayEntry {
  symbol: string;
  name: string;
  volatilityPercentage: number;
  direction: 'up' | 'down';
  category: string;
  dataPoints: number;
  comparisons: number;
  averageMarketCap: number;
  marketCapChange: number;
  created_at: string;
}

interface ThirtyDayProgress {
  batchId: number | null;
  totalCryptocurrencies: number;
  processedCount: number;
  completedCount: number;
  isComplete: boolean;
  progressPercentage: number;
  remainingPercentage: number;
  startTime: string | null;
  message: string;
}

const ThirtyDayAnalysis = () => {
  const [selectedDirection, setSelectedDirection] = useState<string>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(50);
  const [isRunningAnalysis, setIsRunningAnalysis] = useState(false);
  
  // 获取30天分析进度
  const { data: progressData, refetch: refetchProgress } = useQuery({
    queryKey: ['/api/volatility-analysis/30day-progress'],
    queryFn: async () => {
      const response = await fetch('/api/volatility-analysis/30day-progress');
      if (!response.ok) throw new Error('获取30天分析进度失败');
      return response.json();
    },
    refetchInterval: 2000,
    enabled: true,
    retry: 3
  });

  // 获取30天分析结果
  const { data: resultsData, isLoading, refetch } = useQuery({
    queryKey: ['/api/volatility-analysis/30day-results', selectedDirection, selectedCategory, currentPage, pageSize],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: currentPage.toString(),
        limit: pageSize.toString(),
        period: '30d',
        analysis_type: 'separate_30day'
      });
      
      if (selectedDirection !== 'all') params.append('direction', selectedDirection);
      if (selectedCategory !== 'all') params.append('category', selectedCategory);
      
      const response = await fetch(`/api/volatility-analysis/results?${params}`);
      if (!response.ok) throw new Error('获取30天分析结果失败');
      return response.json();
    }
  });

  // 手动触发30天分析
  const run30DayAnalysis = async () => {
    setIsRunningAnalysis(true);
    try {
      const response = await fetch('/api/volatility-analysis/trigger-30day', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      
      if (response.ok) {
        await queryClient.invalidateQueries({ queryKey: ['/api/volatility-analysis/30day'] });
        refetch();
        refetchProgress();
      }
    } catch (error) {
      console.error('触发30天分析失败:', error);
    } finally {
      setIsRunningAnalysis(false);
    }
  };

  const progress = progressData?.progress as ThirtyDayProgress;
  const results = resultsData?.entries as ThirtyDayEntry[] || [];
  const totalResults = resultsData?.total || 0;

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'High': return 'bg-red-100 text-red-800';
      case 'Medium': return 'bg-yellow-100 text-yellow-800';
      case 'Low': return 'bg-green-100 text-green-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getDirectionIcon = (direction: string) => {
    return direction === 'up' ? 
      <TrendingUp className="w-4 h-4 text-green-600" /> : 
      <TrendingDown className="w-4 h-4 text-red-600" />;
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">30天独立波动性分析</h1>
          <p className="text-gray-600 mt-2">
            专门的30天波动性分析系统，使用完整的31个数据点进行计算
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <Calendar className="w-5 h-5 text-blue-600" />
          <span className="text-sm text-gray-600">独立30天分析</span>
        </div>
      </div>

      {/* 分析进度卡片 */}
      <Card className="bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200">
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <BarChart3 className="w-5 h-5 text-blue-600" />
            <span>30天分析进度</span>
          </CardTitle>
          <CardDescription>
            实时监控30天波动性分析进度
          </CardDescription>
        </CardHeader>
        <CardContent>
          {progress && !progress.isComplete ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700">
                  {progress.message}
                </span>
                <Badge variant="outline" className="bg-blue-50 text-blue-700">
                  {progress.progressPercentage}%
                </Badge>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${progress.progressPercentage}%` }}
                />
              </div>
              <div className="flex justify-between text-sm text-gray-600">
                <span>已处理: {progress.processedCount}</span>
                <span>总计: {progress.totalCryptocurrencies}</span>
              </div>
            </div>
          ) : (
            <div className="text-center py-4">
              <div className="flex items-center justify-center space-x-2 text-green-600 mb-2">
                <CheckCircle className="w-5 h-5" />
                <span className="font-medium">30天分析已完成</span>
              </div>
              <p className="text-gray-600 text-sm">
                {progress?.message || '点击下面的按钮开始新的30天分析'}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 控制面板 */}
      <Card>
        <CardHeader>
          <CardTitle>分析控制</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4 items-center">
            <Button
              onClick={run30DayAnalysis}
              disabled={isRunningAnalysis || (progress && !progress.isComplete)}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {isRunningAnalysis ? '分析中...' : '开始30天分析'}
            </Button>
            
            <Select value={selectedDirection} onValueChange={setSelectedDirection}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="选择方向" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部方向</SelectItem>
                <SelectItem value="up">上涨</SelectItem>
                <SelectItem value="down">下跌</SelectItem>
              </SelectContent>
            </Select>

            <Select value={selectedCategory} onValueChange={setSelectedCategory}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="选择类别" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部类别</SelectItem>
                <SelectItem value="High">高波动</SelectItem>
                <SelectItem value="Medium">中波动</SelectItem>
                <SelectItem value="Low">低波动</SelectItem>
              </SelectContent>
            </Select>

            <Select value={pageSize.toString()} onValueChange={(value) => setPageSize(parseInt(value))}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="25">25 条</SelectItem>
                <SelectItem value="50">50 条</SelectItem>
                <SelectItem value="100">100 条</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* 结果表格 */}
      <Card>
        <CardHeader>
          <CardTitle>30天分析结果</CardTitle>
          <CardDescription>
            显示 {results.length} 条结果，共 {totalResults} 条记录
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
              <p className="text-gray-600 mt-2">加载中...</p>
            </div>
          ) : results.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>加密货币</TableHead>
                    <TableHead>方向</TableHead>
                    <TableHead>波动率</TableHead>
                    <TableHead>类别</TableHead>
                    <TableHead>数据点</TableHead>
                    <TableHead>比较次数</TableHead>
                    <TableHead>平均市值</TableHead>
                    <TableHead>分析时间</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {results.map((entry, index) => (
                    <TableRow key={index}>
                      <TableCell>
                        <div>
                          <div className="font-medium">{entry.symbol}</div>
                          <div className="text-sm text-gray-600">{entry.name}</div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center space-x-1">
                          {getDirectionIcon(entry.direction)}
                          <span className="capitalize">{entry.direction}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="font-mono">
                          {(entry.volatilityPercentage * 100).toFixed(2)}%
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge className={getCategoryColor(entry.category)}>
                          {entry.category}
                        </Badge>
                      </TableCell>
                      <TableCell>{entry.dataPoints}</TableCell>
                      <TableCell>{entry.comparisons}</TableCell>
                      <TableCell>
                        {entry.averageMarketCap > 0 ? 
                          `$${(entry.averageMarketCap / 1000000).toFixed(1)}M` : 
                          'N/A'
                        }
                      </TableCell>
                      <TableCell>
                        {new Intl.DateTimeFormat('zh-CN', {
                          year: 'numeric',
                          month: '2-digit',
                          day: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit',
                          hour12: false
                        }).format(new Date(entry.created_at))}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="text-center py-8">
              <AlertTriangle className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600">暂无30天分析结果</p>
              <p className="text-sm text-gray-500 mt-1">
                点击"开始30天分析"按钮开始分析
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 分页控制 */}
      {totalResults > pageSize && (
        <div className="flex justify-center space-x-2">
          <Button
            variant="outline"
            onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
            disabled={currentPage === 1}
          >
            上一页
          </Button>
          <span className="flex items-center px-4 py-2 text-sm text-gray-600">
            第 {currentPage} 页，共 {Math.ceil(totalResults / pageSize)} 页
          </span>
          <Button
            variant="outline"
            onClick={() => setCurrentPage(prev => prev + 1)}
            disabled={currentPage >= Math.ceil(totalResults / pageSize)}
          >
            下一页
          </Button>
        </div>
      )}
    </div>
  );
};

export default ThirtyDayAnalysis;