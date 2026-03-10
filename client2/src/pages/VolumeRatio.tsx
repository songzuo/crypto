import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { ChevronLeft, ChevronRight, ArrowUpDown, Percent, RefreshCw } from 'lucide-react';
import { formatNumber, formatDate } from '@/lib/utils';
import Spinner from '@/components/ui/spinner';
import { useToast } from '@/hooks/use-toast';

interface VolumeToMarketCapRatio {
  id: number;
  batchId: number;
  cryptocurrencyId: number | null;
  name: string | null;        // 直接使用API返回的name字段
  symbol: string | null;      // 直接使用API返回的symbol字段
  volume7d: number;
  marketCap: number;
  volumeToMarketCapRatio: number;
  timestamp: string | null;   // 根据API真实返回格式
}

interface VolumeToMarketCapBatch {
  id: number;
  createdAt: string;
  dataSource: string | null;
  count: number;
  newCount: number;
  changePercentage: number | null;
}

const VolumeRatio = () => {
  // State for the current batch
  const [selectedBatchId, setSelectedBatchId] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const [limit] = useState(30);
  // 历史批次分页状态
  const [batchPage, setBatchPage] = useState(1);
  const [batchPageSize] = useState(20);
  const [batchSearchTerm, setBatchSearchTerm] = useState('');
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // Query to get the latest ratios
  const { 
    data: latestRatiosData, 
    isLoading: isLoadingLatestRatios,
    error: latestRatiosError
  } = useQuery({
    queryKey: ['/api/volume-to-market-cap', page, limit],
    queryFn: async () => {
      const response = await fetch(`/api/volume-to-market-cap?page=${page}&limit=${limit}`);
      if (!response.ok) {
        throw new Error('Failed to fetch latest volume-to-market-cap ratios');
      }
      const data = await response.json();
      
      // 处理响应，确保我们有标准格式的数据
      if (data.status === 'ok') {
        // 如果后端返回的是状态信息，提供空数据数组
        console.warn('API返回了状态信息而不是数据:', data);
        return { data: [], total: 0 };
      }
      
      // 检查我们是否有预期的数据格式
      if (!data?.data && Array.isArray(data)) {
        // 如果后端直接返回数组，进行格式化
        return { data: data, total: data.length };
      }
      
      return data;
    }
  });
  
  // Query to get batch history - 获取所有批次
  const { 
    data: batchesData, 
    isLoading: isLoadingBatches,
    error: batchesError
  } = useQuery({
    queryKey: ['/api/volume-to-market-cap/batches'],
    queryFn: async () => {
      // 获取所有批次，不限制数量
      const response = await fetch('/api/volume-to-market-cap/batches?page=1&limit=1000');
      if (!response.ok) {
        throw new Error('Failed to fetch volume-to-market-cap batches');
      }
      const data = await response.json();
      
      // 处理响应，确保我们有标准格式的数据
      if (data.status === 'ok') {
        // 如果后端返回的是状态信息，提供空数据数组
        console.warn('批次API返回了状态信息而不是数据:', data);
        return { data: [], total: 0 };
      }
      
      // 检查我们是否有预期的数据格式
      if (!data?.data && Array.isArray(data)) {
        // 如果后端直接返回数组，进行格式化
        return { data: data, total: data.length };
      }
      
      return data;
    }
  });
  
  // Query to get specific batch data if selectedBatchId is set
  const { 
    data: selectedBatchData, 
    isLoading: isLoadingSelectedBatch,
    error: selectedBatchError
  } = useQuery({
    queryKey: ['/api/volume-to-market-cap/batches', selectedBatchId],
    queryFn: async () => {
      if (!selectedBatchId) return null;
      const response = await fetch(`/api/volume-to-market-cap/batches/${selectedBatchId}`);
      if (!response.ok) {
        throw new Error(`Failed to fetch batch ${selectedBatchId}`);
      }
      const data = await response.json();
      
      // 处理响应，确保我们有标准格式的数据
      if (data.status === 'ok') {
        // 如果后端返回的是状态信息，提供空数据对象
        console.warn('批次详情API返回了状态信息而不是数据:', data);
        return { batch: { id: selectedBatchId, createdAt: new Date().toISOString(), count: 0 }, ratios: [] };
      }
      
      return data;
    },
    enabled: !!selectedBatchId
  });
  
  // Mutation to manually trigger volume-to-market cap analysis
  const { mutate: triggerAnalysis, isPending: isAnalyzing } = useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/volume-to-market-cap/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || '触发分析失败');
      }
      
      return response.json();
    },
    onSuccess: (data) => {
      // Invalidate queries to refetch the updated data
      queryClient.invalidateQueries({ queryKey: ['/api/volume-to-market-cap'] });
      queryClient.invalidateQueries({ queryKey: ['/api/volume-to-market-cap/batches'] });
      
      toast({
        title: '分析触发成功',
        description: data.message || '交易量市值比率分析已开始执行，结果将在几分钟后显示',
        variant: 'default'
      });
    },
    onError: (error) => {
      toast({
        title: '分析触发失败',
        description: (error as Error).message || '无法启动交易量市值比率分析',
        variant: 'destructive'
      });
    }
  });
  
  // If we have batches data but no selectedBatchId yet, set it to the latest batch id
  useEffect(() => {
    if (batchesData?.data?.length > 0 && !selectedBatchId) {
      setSelectedBatchId(batchesData?.data?.[0]?.id);
    }
  }, [batchesData, selectedBatchId]);

  // 过滤和分页批次数据
  const filteredBatches = batchesData?.data?.filter((batch: VolumeToMarketCapBatch) => {
    if (!batchSearchTerm) return true;
    return batch.id.toString().includes(batchSearchTerm) || 
           batch.createdAt.includes(batchSearchTerm);
  }) || [];

  const totalBatchPages = Math.ceil(filteredBatches.length / batchPageSize);
  const paginatedBatches = filteredBatches.slice(
    (batchPage - 1) * batchPageSize,
    batchPage * batchPageSize
  );
  
  // Prepare chart data for visualization
  const prepareChartData = (ratios: VolumeToMarketCapRatio[]) => {
    return ratios.slice(0, 15).map(ratio => ({
      name: ratio.symbol || `Crypto #${ratio.cryptocurrencyId}`,
      ratio: parseFloat((ratio.volumeToMarketCapRatio * 100).toFixed(2))
    })).sort((a, b) => a.ratio - b.ratio);
  };
  
  // Handle pagination
  const handlePreviousPage = () => {
    if (page > 1) {
      setPage(page - 1);
    }
  };
  
  const handleNextPage = () => {
    if (latestRatiosData?.data?.length === limit) {
      setPage(page + 1);
    }
  };
  
  // Check for loading states and errors
  if (isLoadingLatestRatios || isLoadingBatches) {
    return (
      <div className="flex justify-center items-center h-full">
        <Spinner size="large" />
        <p className="ml-2">加载交易量市值比率数据...</p>
      </div>
    );
  }
  
  if (latestRatiosError || batchesError) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <div className="text-destructive text-xl mb-4">
          出错了！无法加载交易量市值比率数据。
        </div>
        <div className="text-muted-foreground">
          {(latestRatiosError as Error)?.message || (batchesError as Error)?.message || '请稍后再试。'}
        </div>
      </div>
    );
  }
  
  // Format date for display
  const formatBatchDate = (dateString: string) => {
    return formatDate(new Date(dateString), { includeTime: true });
  };
  
  return (
    <div className="container mx-auto py-6">
      <h1 className="text-3xl font-bold mb-2">交易量市值比率分析</h1>
      <p className="text-muted-foreground mb-6">
        分析加密货币的7天交易量与市值的比率，该指标可以显示哪些币种相对交易更为活跃。
        更高的比率可能表明更大的相对流动性和交易兴趣。
      </p>
      
      <Tabs defaultValue="latest">
        <TabsList className="mb-6">
          <TabsTrigger value="latest">最新排名</TabsTrigger>
          <TabsTrigger value="historical">历史分析</TabsTrigger>
        </TabsList>
        
        <TabsContent value="latest">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Top 15 Volume/Market Cap Ratio Chart */}
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>前15名交易量市值比率（百分比%）</CardTitle>
                <CardDescription>
                  7天平均交易量占市值的百分比，越高表示相对交易活跃
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={400}>
                  <BarChart
                    data={prepareChartData(latestRatiosData?.data || [])}
                    layout="vertical"
                    margin={{ top: 20, right: 30, left: 40, bottom: 20 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" domain={[0, 'dataMax']} />
                    <YAxis dataKey="name" type="category" width={80} />
                    <Tooltip 
                      formatter={(value) => [`${value}%`, '交易量/市值比率']}
                      labelFormatter={(value) => `${value}`}
                    />
                    <Legend />
                    <Bar dataKey="ratio" name="交易量/市值比率 (%)" fill="#8884d8" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
            
            {/* Latest Analysis Info */}
            <Card>
              <CardHeader>
                <CardTitle>最新分析概览</CardTitle>
                <CardDescription>
                  {latestRatiosData?.data?.length > 0 && latestRatiosData?.data?.[0]?.createdAt 
                    ? `更新于 ${formatBatchDate(latestRatiosData?.data?.[0].createdAt)}`
                    : '尚无数据'}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {batchesData?.data?.length > 0 ? (
                  <div className="space-y-4">
                    <div>
                      <div className="text-sm font-medium">最新分析批次</div>
                      <div className="text-2xl font-bold">#{batchesData?.data?.[0]?.id || 'N/A'}</div>
                      <div className="text-xs text-muted-foreground">
                        共 {batchesData?.data?.length} 个历史批次
                      </div>
                    </div>
                    
                    <div>
                      <div className="text-sm font-medium">分析得出的币种数量</div>
                      <div className="text-2xl font-bold">{batchesData?.data?.[0]?.count || 0}</div>
                    </div>
                    
                    <div>
                      <div className="text-sm font-medium">新增币种数量</div>
                      <div className="flex items-center">
                        <span className="text-2xl font-bold mr-2">{batchesData?.data?.[0]?.newCount || 0}</span>
                        {batchesData?.data?.[0]?.changePercentage !== null && batchesData?.data?.[0]?.changePercentage !== undefined && (
                          <Badge variant={batchesData?.data?.[0]?.changePercentage > 0 ? "success" : "secondary"}>
                            {batchesData?.data?.[0]?.changePercentage > 0 ? '+' : ''}
                            {batchesData?.data?.[0]?.changePercentage.toFixed(1)}%
                          </Badge>
                        )}
                      </div>
                    </div>
                    
                    <div>
                      <div className="text-sm font-medium">数据来源</div>
                      <div className="text-lg">{batchesData?.data?.[0]?.dataSource || '多来源汇总'}</div>
                    </div>
                    
                    <Separator className="my-4" />
                    
                    <div>
                      <Button
                        onClick={() => triggerAnalysis()}
                        disabled={isAnalyzing}
                        className="w-full"
                        variant="outline"
                      >
                        {isAnalyzing ? (
                          <>
                            <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                            分析进行中...
                          </>
                        ) : (
                          <>
                            <RefreshCw className="mr-2 h-4 w-4" />
                            手动触发新分析
                          </>
                        )}
                      </Button>
                    </div>
                    
                    <Separator className="my-4" />
                    
                    <div>
                      <p className="text-sm text-muted-foreground">
                        交易量市值比率分析每小时30分自动运行一次。系统现在正在执行初始数据收集和分析，完整过程可能需要30-40分钟。
                      </p>
                    </div>
                    
                    <Separator className="my-4" />
                    
                    <div>
                      <div className="text-sm font-medium mb-2">排名前3币种</div>
                      {latestRatiosData?.data?.slice(0, 3).map((ratio: VolumeToMarketCapRatio, index: number) => (
                        <div key={ratio.id} className="flex justify-between items-center mb-2">
                          <div className="flex items-center">
                            <Badge variant="outline" className="mr-2">{index + 1}</Badge>
                            <span>{ratio.symbol || 'Unknown'}</span>
                          </div>
                          <div className="font-medium">{(ratio.volumeToMarketCapRatio * 100).toFixed(2)}%</div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="text-center text-muted-foreground">
                    尚无分析数据
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
          
          {/* Full Table */}
          <Card className="mt-6">
            <CardHeader className="pb-2">
              <CardTitle>交易量市值比率完整排名</CardTitle>
              <CardDescription>
                所有加密货币按7天交易量/市值比率从高到低排序
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">排名</TableHead>
                    <TableHead>币种</TableHead>
                    <TableHead>符号</TableHead>
                    <TableHead className="text-right">7天交易量</TableHead>
                    <TableHead className="text-right">市值</TableHead>
                    <TableHead className="text-right">
                      <div className="flex items-center justify-end">
                        <span>交易量/市值比率</span>
                        <ArrowUpDown className="ml-2 h-4 w-4" />
                      </div>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {latestRatiosData?.data?.map((ratio: VolumeToMarketCapRatio, index: number) => (
                    <TableRow key={ratio.id}>
                      <TableCell className="font-medium">{(page - 1) * limit + index + 1}</TableCell>
                      <TableCell>{ratio.name || '未知币种'}</TableCell>
                      <TableCell>{ratio.symbol || '-'}</TableCell>
                      <TableCell className="text-right">${formatNumber(ratio.volume7d)}</TableCell>
                      <TableCell className="text-right">${formatNumber(ratio.marketCap)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end">
                          <span className="font-medium">{(ratio.volumeToMarketCapRatio * 100).toFixed(2)}%</span>
                          <Percent className="ml-1 h-4 w-4 text-muted-foreground" />
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              
              {/* Pagination */}
              <div className="flex items-center justify-end space-x-2 mt-4">
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={handlePreviousPage}
                  disabled={page === 1}
                >
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  上一页
                </Button>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={handleNextPage}
                  disabled={!latestRatiosData?.data || latestRatiosData?.data?.length < limit}
                >
                  下一页
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="historical">
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            {/* Historical Batches List */}
            <Card className="lg:col-span-1">
              <CardHeader>
                <CardTitle>历史分析批次</CardTitle>
                <CardDescription>
                  共 {filteredBatches.length} 个批次，选择查看历史分析数据
                </CardDescription>
              </CardHeader>
              <CardContent>
                {/* 搜索框 */}
                <div className="mb-4">
                  <input
                    type="text"
                    placeholder="搜索批次ID或日期..."
                    value={batchSearchTerm}
                    onChange={(e) => {
                      setBatchSearchTerm(e.target.value);
                      setBatchPage(1); // 重置到第一页
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                  />
                </div>
                
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {paginatedBatches.map((batch: VolumeToMarketCapBatch) => (
                    <Button
                      key={batch.id}
                      variant={selectedBatchId === batch.id ? "default" : "outline"}
                      className="w-full justify-between text-left"
                      onClick={() => setSelectedBatchId(batch.id)}
                    >
                      <div className="flex flex-col">
                        <span className="font-medium">批次 #{batch.id}</span>
                        <span className="text-xs text-muted-foreground">
                          {batch.count} 个币种
                        </span>
                      </div>
                      <span className="text-xs">{formatBatchDate(batch.createdAt)}</span>
                    </Button>
                  ))}
                  
                  {paginatedBatches.length === 0 && (
                    <div className="text-center text-muted-foreground py-4">
                      {batchSearchTerm ? '没有找到匹配的批次' : '尚无历史批次数据'}
                    </div>
                  )}
                </div>
                
                {/* 批次分页 */}
                {totalBatchPages > 1 && (
                  <div className="flex items-center justify-between mt-4 pt-4 border-t">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setBatchPage(Math.max(1, batchPage - 1))}
                      disabled={batchPage === 1}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <span className="text-sm text-muted-foreground">
                      第 {batchPage} 页，共 {totalBatchPages} 页
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setBatchPage(Math.min(totalBatchPages, batchPage + 1))}
                      disabled={batchPage === totalBatchPages}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
            
            {/* Selected Batch Details */}
            <Card className="lg:col-span-3">
              <CardHeader>
                <CardTitle>
                  {isLoadingSelectedBatch 
                    ? "加载中..." 
                    : selectedBatchData?.batch 
                      ? `批次 #${selectedBatchData.batch.id} 详情`
                      : "选择批次查看详情"
                  }
                </CardTitle>
                <CardDescription>
                  {selectedBatchData?.batch 
                    ? `分析于 ${formatBatchDate(selectedBatchData.batch.createdAt)}`
                    : "请从左侧选择一个分析批次"
                  }
                </CardDescription>
              </CardHeader>
              <CardContent>
                {isLoadingSelectedBatch ? (
                  <div className="flex justify-center items-center h-64">
                    <Spinner size="large" />
                  </div>
                ) : selectedBatchError ? (
                  <div className="text-center text-destructive py-8">
                    {(selectedBatchError as Error).message}
                  </div>
                ) : selectedBatchData?.batch ? (
                  <>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
                      <div className="space-y-1">
                        <div className="text-sm font-medium text-muted-foreground">分析币种总数</div>
                        <div className="text-2xl font-bold">{selectedBatchData.batch.count}</div>
                      </div>
                      <div className="space-y-1">
                        <div className="text-sm font-medium text-muted-foreground">新增币种数量</div>
                        <div className="text-2xl font-bold">{selectedBatchData.batch.newCount}</div>
                      </div>
                      <div className="space-y-1">
                        <div className="text-sm font-medium text-muted-foreground">数据来源</div>
                        <div className="text-2xl font-bold">{selectedBatchData.batch.dataSource || '多来源'}</div>
                      </div>
                    </div>
                    
                    <Separator className="my-6" />
                    
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-12">排名</TableHead>
                            <TableHead>币种</TableHead>
                            <TableHead>符号</TableHead>
                            <TableHead className="text-right">7天交易量</TableHead>
                            <TableHead className="text-right">市值</TableHead>
                            <TableHead className="text-right">交易量/市值比率</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {selectedBatchData.ratios?.map((ratio: VolumeToMarketCapRatio, index: number) => (
                            <TableRow key={ratio.id}>
                              <TableCell className="font-medium">{index + 1}</TableCell>
                              <TableCell>{ratio.name || '未知币种'}</TableCell>
                              <TableCell>{ratio.symbol || '-'}</TableCell>
                              <TableCell className="text-right">${formatNumber(ratio.volume7d)}</TableCell>
                              <TableCell className="text-right">${formatNumber(ratio.marketCap)}</TableCell>
                              <TableCell className="text-right">
                                <div className="flex items-center justify-end">
                                  <span className="font-medium">{(ratio.volumeToMarketCapRatio * 100).toFixed(2)}%</span>
                                  <Percent className="ml-1 h-4 w-4 text-muted-foreground" />
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                          
                          {(!selectedBatchData.ratios || selectedBatchData.ratios.length === 0) && (
                            <TableRow>
                              <TableCell colSpan={6} className="text-center py-4">
                                此批次没有比率数据
                              </TableCell>
                            </TableRow>
                          )}
                        </TableBody>
                      </Table>
                    </div>
                  </>
                ) : (
                  <div className="text-center text-muted-foreground py-8">
                    请选择一个批次查看详细数据
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default VolumeRatio;
