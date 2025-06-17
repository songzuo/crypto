import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { TrendingUp, TrendingDown, ArrowRight, BarChart3, AlertTriangle, CheckCircle } from 'lucide-react';
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
  currentRatio: number;
  previousRatio: number;
  volatilityScore: number;
  volatilityPercentage: number;
  direction: 'up' | 'down' | 'stable';
  rank: number;
  category: string;
}

const VolatilityAnalysis = () => {
  console.log('波动性分析页面加载，显示历史数据');
  
  const [selectedDirection, setSelectedDirection] = useState<string>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [isRunningAnalysis, setIsRunningAnalysis] = useState(false);

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
    queryKey: ['/api/volatility-analysis/results', selectedDirection, selectedCategory, currentPage],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: currentPage.toString(),
        limit: '30'
      });
      
      if (selectedDirection) params.append('direction', selectedDirection);
      if (selectedCategory) params.append('category', selectedCategory);
      
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

  // 手动触发波动性分析
  const runAnalysis = async () => {
    setIsRunningAnalysis(true);
    try {
      const response = await fetch('/api/volatility-analysis/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      
      if (response.ok) {
        await queryClient.invalidateQueries({ queryKey: ['/api/volatility-analysis'] });
        refetch();
      }
    } catch (error) {
      console.error('触发波动性分析失败:', error);
    } finally {
      setIsRunningAnalysis(false);
    }
  };

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
          <h1 className="text-3xl font-bold">波动性分析</h1>
          <p className="text-muted-foreground mt-2">
            基于交易量市值比率数据的加密货币波动性排名分析
          </p>
        </div>
        <Button 
          onClick={runAnalysis} 
          disabled={isRunningAnalysis}
          className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700"
        >
          {isRunningAnalysis ? '分析中...' : '运行波动性分析'}
        </Button>
      </div>

      {/* 批次信息 */}
      {batchesData?.data?.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              最新分析批次
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="text-center">
                <p className="text-2xl font-bold text-purple-600">
                  {batchesData.data[0]?.totalAnalyzed || 0}
                </p>
                <p className="text-sm text-muted-foreground">分析币种数</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-pink-600">
                  {batchesData.data[0]?.timeframe || '24h'}
                </p>
                <p className="text-sm text-muted-foreground">分析周期</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-blue-600">
                  #{batchesData.data[0]?.id}
                </p>
                <p className="text-sm text-muted-foreground">批次编号</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-green-600">
                  {new Date(batchesData.data[0]?.createdAt).toLocaleDateString()}
                </p>
                <p className="text-sm text-muted-foreground">分析时间</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 筛选控件 */}
      <Card>
        <CardHeader>
          <CardTitle>筛选条件</CardTitle>
          <CardDescription>按波动方向和风险等级筛选结果</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4">
            <Select value={selectedDirection} onValueChange={setSelectedDirection}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="选择波动方向" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部方向</SelectItem>
                <SelectItem value="up">上涨 ↑</SelectItem>
                <SelectItem value="down">下跌 ↓</SelectItem>
                <SelectItem value="stable">稳定 →</SelectItem>
              </SelectContent>
            </Select>

            <Select value={selectedCategory} onValueChange={setSelectedCategory}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="选择风险等级" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部等级</SelectItem>
                <SelectItem value="极高">极高风险</SelectItem>
                <SelectItem value="高">高风险</SelectItem>
                <SelectItem value="中">中等风险</SelectItem>
                <SelectItem value="低">低风险</SelectItem>
                <SelectItem value="极低">极低风险</SelectItem>
              </SelectContent>
            </Select>

            <Button 
              variant="outline" 
              onClick={() => {
                setSelectedDirection('all');
                setSelectedCategory('all');
                setCurrentPage(1);
              }}
            >
              重置筛选
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* 分析结果表格 */}
      <Card>
        <CardHeader>
          <CardTitle>波动性排名</CardTitle>
          <CardDescription>
            {resultsData?.total ? `共 ${resultsData.total} 个结果` : '加载中...'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8">
              <div className="animate-spin h-8 w-8 border-b-2 border-purple-600 mx-auto"></div>
              <p className="mt-2 text-muted-foreground">加载分析数据中...</p>
            </div>
          ) : resultsData?.entries?.length > 0 ? (
            <div className="space-y-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-16">排名</TableHead>
                    <TableHead>币种</TableHead>
                    <TableHead>波动评分</TableHead>
                    <TableHead>波动幅度</TableHead>
                    <TableHead>方向</TableHead>
                    <TableHead>风险等级</TableHead>
                    <TableHead>当前比率</TableHead>
                    <TableHead>之前比率</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {resultsData.entries.map((entry: VolatilityEntry) => (
                    <TableRow key={`${entry.symbol}-${entry.rank}`}>
                      <TableCell className="font-medium">
                        <Badge variant="outline">#{entry.rank}</Badge>
                      </TableCell>
                      <TableCell>
                        <div>
                          <div className="font-medium">{entry.symbol}</div>
                          <div className="text-sm text-muted-foreground">{entry.name}</div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="text-lg font-bold text-purple-600">
                            {entry.volatilityScore?.toFixed(1) || '0.0'}
                          </div>
                          <div className="text-sm text-muted-foreground">/100</div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className={`font-medium ${
                          entry.direction === 'up' ? 'text-green-600' :
                          entry.direction === 'down' ? 'text-red-600' : 'text-gray-600'
                        }`}>
                          {entry.volatilityPercentage > 0 ? '+' : ''}{entry.volatilityPercentage?.toFixed(2) || '0.00'}%
                        </div>
                        <div className="text-xs text-muted-foreground">
                          日标准差: {Math.abs(entry.volatilityPercentage || 0).toFixed(2)}%
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {getVolatilityIcon(entry.direction)}
                          <span className="capitalize">{entry.direction === 'up' ? '上涨' : 
                                                        entry.direction === 'down' ? '下跌' : '稳定'}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {getRiskIcon(entry.category === '极高' ? '高风险' : entry.category === '高' ? '中风险' : '低风险')}
                          <Badge className={getCategoryColor(entry.category)}>
                            {entry.category}
                          </Badge>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="font-mono text-sm">
                          {entry.currentRatio?.toFixed(4) || '0.0000'}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="font-mono text-sm text-muted-foreground">
                          {entry.previousRatio?.toFixed(4) || '0.0000'}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {/* 分页控件 */}
              {resultsData?.total > 30 && (
                <div className="flex justify-center gap-2 mt-4">
                  <Button
                    variant="outline"
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  >
                    上一页
                  </Button>
                  <span className="flex items-center px-4">
                    第 {currentPage} 页，共 {Math.ceil(resultsData.total / 30)} 页
                  </span>
                  <Button
                    variant="outline"
                    disabled={currentPage >= Math.ceil(resultsData.total / 30)}
                    onClick={() => setCurrentPage(prev => prev + 1)}
                  >
                    下一页
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-8">
              <BarChart3 className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">暂无波动性分析数据</p>
              <p className="text-sm text-muted-foreground mt-2">
                点击上方"运行波动性分析"按钮开始分析
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default VolatilityAnalysis;