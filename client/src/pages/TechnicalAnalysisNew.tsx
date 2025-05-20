import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useQuery } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { InfoIcon, TrendingUpIcon, TrendingDownIcon, AlertCircleIcon } from 'lucide-react';

interface TechnicalAnalysisBatch {
  id: number;
  createdAt: string;
  analysisCount: number;
  buySignals: number;
  sellSignals: number;
  holdSignals: number;
}

interface TechnicalAnalysisEntry {
  id: number;
  batchId: number;
  cryptocurrencyId: number;
  cryptocurrencyName: string;
  cryptocurrencySymbol: string;
  price: number;
  signal: string;
  rsiValue: number;
  macdValue: number;
  macdSignal: number;
  emaShort: number;
  emaLong: number;
  volumeMarketCapRatio: number;
  confidence: number;
  analysisTime: string;
}

interface AnalysisResult {
  batch: TechnicalAnalysisBatch;
  entries: TechnicalAnalysisEntry[];
}

export default function TechnicalAnalysis() {
  const [selectedSignal, setSelectedSignal] = useState<string>('all');

  // 获取技术分析批次
  const { data: batchesData, isLoading: isBatchesLoading, error: batchesError } = useQuery({
    queryKey: ['/api/technical-analysis/batches'],
    refetchOnWindowFocus: false,
  });

  // 获取技术分析结果
  const { data: resultsData, isLoading: isResultsLoading, error: resultsError } = useQuery({
    queryKey: ['/api/technical-analysis/results', selectedSignal],
    queryFn: async () => {
      const queryParam = selectedSignal !== 'all' ? `?signal=${selectedSignal}` : '';
      const response = await fetch(`/api/technical-analysis/results${queryParam}`);
      if (!response.ok) {
        throw new Error('Failed to fetch analysis results');
      }
      return response.json();
    },
    refetchOnWindowFocus: false,
  });

  const getSignalBadgeColor = (signal: string) => {
    switch (signal.toLowerCase()) {
      case 'buy':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'sell':
        return 'bg-red-100 text-red-800 border-red-200';
      case 'hold':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getSignalIcon = (signal: string) => {
    switch (signal.toLowerCase()) {
      case 'buy':
        return <TrendingUpIcon className="h-4 w-4 text-green-600" />;
      case 'sell':
        return <TrendingDownIcon className="h-4 w-4 text-red-600" />;
      case 'hold':
        return <InfoIcon className="h-4 w-4 text-yellow-600" />;
      default:
        return <AlertCircleIcon className="h-4 w-4 text-gray-600" />;
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="container mx-auto py-8">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold">技术分析</h1>
          <p className="text-gray-500 mt-1">
            基于交易量市值比率、RSI、MACD和EMA的综合技术分析（每24小时自动更新）
          </p>
        </div>
      </div>

      {/* 批次信息卡片 */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>技术分析批次</CardTitle>
          <CardDescription>
            技术分析每24小时自动更新一次，与交易量市值比率分析同步运行
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isBatchesLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : batchesError ? (
            <Alert variant="destructive">
              <AlertCircleIcon className="h-4 w-4" />
              <AlertTitle>获取批次信息失败</AlertTitle>
              <AlertDescription>
                无法加载技术分析批次数据。请稍后再试。
              </AlertDescription>
            </Alert>
          ) : batchesData?.data?.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[80px]">批次ID</TableHead>
                  <TableHead>创建时间</TableHead>
                  <TableHead className="text-right">分析数量</TableHead>
                  <TableHead className="text-right">买入信号</TableHead>
                  <TableHead className="text-right">卖出信号</TableHead>
                  <TableHead className="text-right">持有信号</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {batchesData.data.map((batch: TechnicalAnalysisBatch) => (
                  <TableRow key={batch.id}>
                    <TableCell className="font-medium">#{batch.id}</TableCell>
                    <TableCell>{formatDate(batch.createdAt)}</TableCell>
                    <TableCell className="text-right">{batch.analysisCount}</TableCell>
                    <TableCell className="text-right">
                      <span className="text-green-600">{batch.buySignals}</span>
                    </TableCell>
                    <TableCell className="text-right">
                      <span className="text-red-600">{batch.sellSignals}</span>
                    </TableCell>
                    <TableCell className="text-right">
                      <span className="text-yellow-600">{batch.holdSignals}</span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <Alert>
              <InfoIcon className="h-4 w-4" />
              <AlertTitle>暂无分析批次</AlertTitle>
              <AlertDescription>
                系统尚未完成任何技术分析批次。技术分析将在每天自动运行。
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* 技术分析结果 */}
      <Card>
        <CardHeader>
          <CardTitle>技术分析结果</CardTitle>
          <CardDescription>
            {resultsData?.batch ? (
              <>批次 #{resultsData.batch.id} • 分析时间: {formatDate(resultsData.batch.createdAt)}</>
            ) : (
              <>最新技术分析结果</>
            )}
          </CardDescription>
          <Tabs 
            defaultValue="all" 
            className="mt-2"
            onValueChange={(value) => setSelectedSignal(value)}
          >
            <TabsList>
              <TabsTrigger value="all">全部信号</TabsTrigger>
              <TabsTrigger value="buy">买入信号</TabsTrigger>
              <TabsTrigger value="sell">卖出信号</TabsTrigger>
              <TabsTrigger value="hold">持有信号</TabsTrigger>
            </TabsList>
          </Tabs>
        </CardHeader>
        <CardContent>
          {isResultsLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : resultsError ? (
            <Alert variant="destructive">
              <AlertCircleIcon className="h-4 w-4" />
              <AlertTitle>获取分析结果失败</AlertTitle>
              <AlertDescription>
                无法加载技术分析结果数据。请稍后再试。
              </AlertDescription>
            </Alert>
          ) : resultsData?.entries?.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>加密货币</TableHead>
                  <TableHead>当前价格</TableHead>
                  <TableHead>交易量/市值</TableHead>
                  <TableHead>RSI</TableHead>
                  <TableHead>MACD</TableHead>
                  <TableHead>EMA</TableHead>
                  <TableHead>信号</TableHead>
                  <TableHead>置信度</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {resultsData.entries.map((entry: TechnicalAnalysisEntry) => (
                  <TableRow key={entry.id}>
                    <TableCell className="font-medium">
                      {entry.cryptocurrencySymbol} ({entry.cryptocurrencyName})
                    </TableCell>
                    <TableCell>${entry.price.toLocaleString()}</TableCell>
                    <TableCell>{(entry.volumeMarketCapRatio * 100).toFixed(2)}%</TableCell>
                    <TableCell>{entry.rsiValue.toFixed(2)}</TableCell>
                    <TableCell>
                      {entry.macdValue.toFixed(4)} / {entry.macdSignal.toFixed(4)}
                    </TableCell>
                    <TableCell>
                      {entry.emaShort.toFixed(2)} / {entry.emaLong.toFixed(2)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        {getSignalIcon(entry.signal)}
                        <Badge className={getSignalBadgeColor(entry.signal)}>
                          {entry.signal.toUpperCase()}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell>{(entry.confidence * 100).toFixed(0)}%</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <Alert>
              <InfoIcon className="h-4 w-4" />
              <AlertTitle>暂无分析结果</AlertTitle>
              <AlertDescription>
                当前没有符合条件的技术分析信号。技术分析使用严格的条件组合（交易量市值比率 + RSI + MACD + EMA指标），
                可能当前市场状况没有符合我们设定的买入/卖出信号组合的加密货币。
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>
    </div>
  );
}