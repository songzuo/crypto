import React, { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { AlertTriangle, Award, BarChart4, ChevronDown, RefreshCw, TrendingDown, TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

// Helper function to format relative time
function formatRelativeTime(date: Date | string): string {
  if (!date) return '';
  
  try {
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    const now = new Date();
    const diff = now.getTime() - dateObj.getTime();
    const seconds = Math.floor(diff / 1000);
    
    if (seconds < 60) return 'just now';
    if (seconds < 3600) {
      const minutes = Math.floor(seconds / 60);
      return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'} ago`;
    }
    if (seconds < 86400) {
      const hours = Math.floor(seconds / 3600);
      return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`;
    }
    if (seconds < 604800) {
      const days = Math.floor(seconds / 86400);
      return `${days} ${days === 1 ? 'day' : 'days'} ago`;
    }
    if (seconds < 2592000) {
      const weeks = Math.floor(seconds / 604800);
      return `${weeks} ${weeks === 1 ? 'week' : 'weeks'} ago`;
    }
    
    return dateObj.toLocaleDateString();
  } catch (error) {
    return String(date);
  }
}
import { useToast } from '@/hooks/use-toast';

// 技术分析页面组件
export default function TechnicalAnalysisPage() {
  const [selectedTab, setSelectedTab] = useState('latest');
  const [selectedSignal, setSelectedSignal] = useState('any_buy');
  const [selectedBatchId, setSelectedBatchId] = useState<number | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // 获取最新的技术分析结果
  const { data: latestAnalysis, isLoading: isLoadingLatest } = useQuery({
    queryKey: ['/api/technical-analysis', selectedSignal],
    queryFn: () => apiRequest(`/api/technical-analysis?signal=${selectedSignal}`),
    refetchOnWindowFocus: false
  });

  // 获取所有技术分析批次
  const { data: batches, isLoading: isLoadingBatches } = useQuery({
    queryKey: ['/api/technical-analysis/batches'],
    queryFn: () => apiRequest('/api/technical-analysis/batches'),
    refetchOnWindowFocus: false
  });

  // 获取特定批次的技术分析结果
  const { data: batchAnalysis, isLoading: isLoadingBatch } = useQuery({
    queryKey: ['/api/technical-analysis/batches', selectedBatchId, selectedSignal],
    queryFn: () => selectedBatchId 
      ? apiRequest(`/api/technical-analysis/batches/${selectedBatchId}?signal=${selectedSignal}`) 
      : Promise.resolve(null),
    enabled: !!selectedBatchId,
    refetchOnWindowFocus: false
  });

  // 手动触发技术分析的mutation
  const runAnalysisMutation = useMutation({
    mutationFn: () => apiRequest('/api/technical-analysis/analyze', 'POST'),
    onSuccess: (data: any) => {
      toast({
        title: '技术分析已启动',
        description: `成功分析了${data?.entriesCount || 0}个加密货币`,
      });
      // 刷新数据
      queryClient.invalidateQueries({ queryKey: ['/api/technical-analysis'] });
      queryClient.invalidateQueries({ queryKey: ['/api/technical-analysis/batches'] });
    },
    onError: (error: any) => {
      toast({
        title: '技术分析失败',
        description: `错误：${error.message}`,
        variant: 'destructive'
      });
    }
  });

  // 当选择不同批次时更新状态
  const handleBatchChange = (batchId: string) => {
    setSelectedTab('historical');
    setSelectedBatchId(parseInt(batchId));
  };

  // 获取信号样式
  const getSignalBadgeStyle = (signal: string) => {
    switch (signal) {
      case 'strong_buy':
        return 'bg-green-500 hover:bg-green-600';
      case 'buy':
        return 'bg-green-400 hover:bg-green-500';
      case 'strong_sell':
        return 'bg-red-500 hover:bg-red-600';
      case 'sell':
        return 'bg-red-400 hover:bg-red-500';
      default:
        return 'bg-gray-400 hover:bg-gray-500';
    }
  };

  // 获取信号图标
  const getSignalIcon = (signal: string) => {
    switch (signal) {
      case 'strong_buy':
      case 'buy':
        return <TrendingUp className="w-4 h-4 mr-1" />;
      case 'strong_sell':
      case 'sell':
        return <TrendingDown className="w-4 h-4 mr-1" />;
      default:
        return <BarChart4 className="w-4 h-4 mr-1" />;
    }
  };

  // 信号文本翻译
  const translateSignal = (signal: string) => {
    switch (signal) {
      case 'strong_buy':
        return '强烈买入';
      case 'buy':
        return '买入';
      case 'strong_sell':
        return '强烈卖出';
      case 'sell':
        return '卖出';
      case 'neutral':
        return '中性';
      default:
        return signal;
    }
  };

  // 渲染技术分析结果表格
  const renderAnalysisTable = (analysis: any) => {
    if (!analysis || !analysis.entries || analysis.entries.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center p-8 text-center">
          <AlertTriangle className="w-12 h-12 text-yellow-500 mb-4" />
          <h3 className="text-xl font-semibold mb-2">无技术分析数据</h3>
          <p className="text-gray-500 mb-4">当前没有符合选定条件的技术分析结果</p>
          <Button onClick={() => runAnalysisMutation.mutate()} disabled={runAnalysisMutation.isPending}>
            <RefreshCw className={`w-4 h-4 mr-2 ${runAnalysisMutation.isPending ? 'animate-spin' : ''}`} />
            运行技术分析
          </Button>
        </div>
      );
    }

    return (
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[180px]">加密货币</TableHead>
              <TableHead>综合信号</TableHead>
              <TableHead className="text-center">交易量比率信号</TableHead>
              <TableHead className="text-center">RSI信号</TableHead>
              <TableHead className="text-center">MACD信号</TableHead>
              <TableHead className="text-center">均线信号</TableHead>
              <TableHead className="text-center">信号强度</TableHead>
              <TableHead className="text-center">推荐类型</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {analysis.entries.map((entry: any) => (
              <TableRow key={entry.id}>
                <TableCell className="font-medium">
                  <div className="flex flex-col">
                    <span>{entry.name}</span>
                    <span className="text-xs text-gray-500">{entry.symbol}</span>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge className={`${getSignalBadgeStyle(entry.combinedSignal)} flex items-center`}>
                    {getSignalIcon(entry.combinedSignal)}
                    {translateSignal(entry.combinedSignal)}
                  </Badge>
                </TableCell>
                <TableCell className="text-center">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger>
                        <Badge variant={entry.volumeRatioSignal === 'buy' ? 'success' : 
                          entry.volumeRatioSignal === 'sell' ? 'destructive' : 'secondary'}>
                          {entry.volumeToMarketCapRatio ? (entry.volumeToMarketCapRatio * 100).toFixed(2) + '%' : 'N/A'}
                        </Badge>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>交易量/市值比率: {entry.volumeToMarketCapRatio ? (entry.volumeToMarketCapRatio * 100).toFixed(2) + '%' : 'N/A'}</p>
                        <p>信号: {translateSignal(entry.volumeRatioSignal)}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </TableCell>
                <TableCell className="text-center">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger>
                        <Badge variant={entry.rsiSignal === 'buy' ? 'success' : 
                          entry.rsiSignal === 'sell' ? 'destructive' : 'secondary'}>
                          {entry.rsiValue ? entry.rsiValue.toFixed(1) : 'N/A'}
                        </Badge>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>RSI值: {entry.rsiValue ? entry.rsiValue.toFixed(1) : 'N/A'}</p>
                        <p>信号: {translateSignal(entry.rsiSignal)}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </TableCell>
                <TableCell className="text-center">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger>
                        <Badge variant={entry.macdSignal === 'buy' ? 'success' : 
                          entry.macdSignal === 'sell' ? 'destructive' : 'secondary'}>
                          {entry.histogram ? (entry.histogram > 0 ? '+' : '') + entry.histogram.toFixed(2) : 'N/A'}
                        </Badge>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>MACD线: {entry.macdLine ? entry.macdLine.toFixed(2) : 'N/A'}</p>
                        <p>信号线: {entry.signalLine ? entry.signalLine.toFixed(2) : 'N/A'}</p>
                        <p>柱状图: {entry.histogram ? entry.histogram.toFixed(2) : 'N/A'}</p>
                        <p>信号: {translateSignal(entry.macdSignal)}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </TableCell>
                <TableCell className="text-center">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger>
                        <Badge variant={entry.emaSignal === 'buy' ? 'success' : 
                          entry.emaSignal === 'sell' ? 'destructive' : 'secondary'}>
                          {entry.shortEma && entry.longEma 
                            ? `${entry.shortEma > entry.longEma ? '↑' : '↓'} ${Math.abs(entry.shortEma - entry.longEma).toFixed(2)}` 
                            : 'N/A'}
                        </Badge>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>短期EMA: {entry.shortEma ? entry.shortEma.toFixed(2) : 'N/A'}</p>
                        <p>长期EMA: {entry.longEma ? entry.longEma.toFixed(2) : 'N/A'}</p>
                        <p>信号: {translateSignal(entry.emaSignal)}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </TableCell>
                <TableCell className="text-center">
                  <div className="flex items-center justify-center">
                    <Progress value={entry.signalStrength ? (entry.signalStrength / 5) * 100 : 0} 
                      className={`h-2 w-20 ${
                        entry.combinedSignal.includes('buy') ? 'bg-green-100' : 
                        entry.combinedSignal.includes('sell') ? 'bg-red-100' : 'bg-gray-100'
                      }`} />
                    <span className="ml-2 text-sm">{entry.signalStrength}/5</span>
                  </div>
                </TableCell>
                <TableCell className="text-center">
                  <Badge variant="outline">
                    {entry.recommendationType === 'day_trade' ? '日内交易' : 
                      entry.recommendationType === 'swing_trade' ? '波段交易' : 
                      entry.recommendationType === 'position' ? '长线持仓' : '短线交易'}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  };

  // 渲染加载状态
  const renderLoading = () => (
    <div className="space-y-3">
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
    </div>
  );

  // 渲染批次信息卡片
  const renderBatchInfo = (batch: any) => {
    if (!batch) return null;
    
    return (
      <Card className="mb-6">
        <CardHeader className="pb-2">
          <CardTitle className="text-xl flex items-center">
            <Award className="mr-2 h-5 w-5 text-yellow-500" />
            技术分析批次 #{batch.id}
          </CardTitle>
          <CardDescription>
            创建于 {new Date(batch.createdAt).toLocaleString()}
            {' '} ({formatRelativeTime(new Date(batch.createdAt))})
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="flex flex-col">
              <span className="text-sm text-gray-500">分析币种数量</span>
              <span className="text-lg font-semibold">{batch.entriesCount} 个加密货币</span>
            </div>
            <div className="flex flex-col">
              <span className="text-sm text-gray-500">时间周期</span>
              <span className="text-lg font-semibold">{batch.timeframe || '1小时'}</span>
            </div>
            <div className="flex flex-col">
              <span className="text-sm text-gray-500">信号过滤</span>
              <Select value={selectedSignal} onValueChange={setSelectedSignal}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="选择信号类型" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="any_buy">所有买入信号</SelectItem>
                  <SelectItem value="strong_buy">强烈买入信号</SelectItem>
                  <SelectItem value="buy">买入信号</SelectItem>
                  <SelectItem value="any_sell">所有卖出信号</SelectItem>
                  <SelectItem value="strong_sell">强烈卖出信号</SelectItem>
                  <SelectItem value="sell">卖出信号</SelectItem>
                  <SelectItem value="">所有信号</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
        <CardFooter className="pt-0">
          <Button 
            onClick={() => runAnalysisMutation.mutate()}
            disabled={runAnalysisMutation.isPending}
            variant="outline"
            className="ml-auto"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${runAnalysisMutation.isPending ? 'animate-spin' : ''}`} />
            运行新的分析
          </Button>
        </CardFooter>
      </Card>
    );
  };

  return (
    <div className="container mx-auto py-8">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold">技术分析</h1>
          <p className="text-gray-500 mt-1">
            基于交易量市值比率、RSI、MACD和EMA的综合技术分析
          </p>
        </div>
        <Button onClick={() => runAnalysisMutation.mutate()} disabled={runAnalysisMutation.isPending}>
          <RefreshCw className={`w-4 h-4 mr-2 ${runAnalysisMutation.isPending ? 'animate-spin' : ''}`} />
          运行分析
        </Button>
      </div>

      <Tabs value={selectedTab} onValueChange={setSelectedTab} className="w-full">
        <div className="flex justify-between items-center mb-4">
          <TabsList>
            <TabsTrigger value="latest">最新分析</TabsTrigger>
            <TabsTrigger value="historical">历史批次</TabsTrigger>
          </TabsList>

          {selectedTab === 'historical' && (
            <div className="flex items-center">
              <span className="mr-2 text-sm">选择批次:</span>
              <Select 
                value={selectedBatchId?.toString() || ''} 
                onValueChange={handleBatchChange}
                disabled={!batches || batches.length === 0}
              >
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="选择批次" />
                </SelectTrigger>
                <SelectContent>
                  {batches && batches.map((batch: any) => (
                    <SelectItem key={batch.id} value={batch.id.toString()}>
                      批次 #{batch.id} ({new Date(batch.createdAt).toLocaleDateString()})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        <TabsContent value="latest" className="mt-0">
          {isLoadingLatest ? renderLoading() : (
            <>
              {latestAnalysis?.batch && renderBatchInfo(latestAnalysis.batch)}
              {renderAnalysisTable(latestAnalysis)}
            </>
          )}
        </TabsContent>

        <TabsContent value="historical" className="mt-0">
          {selectedBatchId ? (
            isLoadingBatch ? renderLoading() : (
              <>
                {batchAnalysis?.batch && renderBatchInfo(batchAnalysis.batch)}
                {renderAnalysisTable(batchAnalysis)}
              </>
            )
          ) : (
            <div className="flex flex-col items-center justify-center p-8 text-center">
              <ChevronDown className="w-12 h-12 text-gray-400 mb-4" />
              <h3 className="text-xl font-semibold mb-2">请选择批次</h3>
              <p className="text-gray-500">从上方下拉菜单选择一个历史批次来查看详细分析</p>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}