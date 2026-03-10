import React, { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { 
  Play, 
  Square, 
  RotateCcw, 
  Download, 
  Upload, 
  CheckCircle, 
  AlertCircle, 
  Clock,
  BarChart3,
  Database,
  Zap
} from 'lucide-react';

// VINE采集进度接口
interface VINEProgress {
  status: 'idle' | 'running' | 'completed' | 'failed';
  currentStep: string;
  progress: number;
  collectedDays: number;
  targetDays: number;
  currentDate: string;
  startDate: string;
  endDate: string;
  results?: {
    success: boolean;
    totalCollected: number;
    verifiedCount: number;
    error?: string;
  };
  startTime?: Date;
  endTime?: Date;
}

const VINEHistoricalData = () => {
  const [symbol, setSymbol] = useState('VINE');
  const [isCollecting, setIsCollecting] = useState(false);
  const [isRepairing, setIsRepairing] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // 获取VINE采集进度
  const { data: progressData, refetch: refetchProgress } = useQuery({
    queryKey: ['/api/vine/progress'],
    queryFn: async () => {
      const response = await fetch('/api/vine/progress');
      if (!response.ok) {
        throw new Error('获取VINE采集进度失败');
      }
      return response.json();
    },
    refetchInterval: progressData?.status === 'running' ? 2000 : false,
  });

  // 开始采集VINE历史数据
  const startCollection = async () => {
    setIsCollecting(true);
    try {
      const response = await fetch('/api/vine/collect', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ symbol }),
      });

      const result = await response.json();
      
      if (result.success) {
        toast({
          title: '采集开始',
          description: 'VINE历史数据采集已开始',
        });
      } else {
        toast({
          title: '采集失败',
          description: result.error || '未知错误',
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({
        title: '请求失败',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setIsCollecting(false);
      refetchProgress();
    }
  };

  // 检查并修复数据
  const repairData = async () => {
    setIsRepairing(true);
    try {
      const response = await fetch('/api/vine/repair', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ symbol }),
      });

      const result = await response.json();
      
      if (result.success) {
        toast({
          title: '数据修复完成',
          description: `修复了 ${result.repairedCount} 条缺失数据`,
        });
      } else {
        toast({
          title: '修复失败',
          description: result.error || '未知错误',
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({
        title: '请求失败',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setIsRepairing(false);
    }
  };

  // 重置采集进度
  const resetProgress = async () => {
    try {
      const response = await fetch('/api/vine/reset', {
        method: 'POST',
      });

      const result = await response.json();
      
      if (result.success) {
        toast({
          title: '进度已重置',
          description: 'VINE采集进度已重置',
        });
        refetchProgress();
      }
    } catch (error) {
      toast({
        title: '重置失败',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  // 获取状态徽章
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'running':
        return <Badge variant="default" className="bg-blue-500"><Clock className="w-3 h-3 mr-1" />运行中</Badge>;
      case 'completed':
        return <Badge variant="default" className="bg-green-500"><CheckCircle className="w-3 h-3 mr-1" />已完成</Badge>;
      case 'failed':
        return <Badge variant="destructive"><AlertCircle className="w-3 h-3 mr-1" />失败</Badge>;
      default:
        return <Badge variant="secondary">准备就绪</Badge>;
    }
  };

  // 格式化时间
  const formatTime = (dateString: string) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleString('zh-CN');
  };

  // 计算耗时
  const getDuration = () => {
    if (!progressData?.startTime || !progressData?.endTime) return '-';
    
    const start = new Date(progressData.startTime);
    const end = new Date(progressData.endTime);
    const duration = Math.round((end.getTime() - start.getTime()) / 1000);
    
    if (duration < 60) return `${duration}秒`;
    if (duration < 3600) return `${Math.floor(duration / 60)}分${duration % 60}秒`;
    return `${Math.floor(duration / 3600)}小时${Math.floor((duration % 3600) / 60)}分`;
  };

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">VINE历史数据采集</h1>
          <p className="text-muted-foreground">
            24小时不间断采集VINE币种的完整历史数据，支持多数据源验证和AI辅助分析
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Zap className="w-8 h-8 text-yellow-500" />
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* 控制面板 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Play className="w-5 h-5" />
              数据采集控制
            </CardTitle>
            <CardDescription>
              配置和启动VINE历史数据采集任务
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="symbol">币种符号</Label>
              <Input
                id="symbol"
                value={symbol}
                onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                placeholder="输入币种符号，如：VINE"
              />
            </div>
            
            <div className="flex flex-wrap gap-2">
              <Button 
                onClick={startCollection}
                disabled={isCollecting || progressData?.status === 'running'}
                className="flex items-center gap-2"
              >
                <Play className="w-4 h-4" />
                {isCollecting ? '启动中...' : '开始采集'}
              </Button>
              
              <Button 
                variant="outline" 
                onClick={repairData}
                disabled={isRepairing}
                className="flex items-center gap-2"
              >
                <Download className="w-4 h-4" />
                {isRepairing ? '修复中...' : '检查修复'}
              </Button>
              
              <Button 
                variant="outline" 
                onClick={resetProgress}
                className="flex items-center gap-2"
              >
                <RotateCcw className="w-4 h-4" />
                重置进度
              </Button>
            </div>

            <div className="text-sm text-muted-foreground">
              <p>• 支持10+个数据源并行采集</p>
              <p>• AI辅助数据验证和补充</p>
              <p>• 自动去重和完整性检查</p>
              <p>• 24小时不间断运行</p>
            </div>
          </CardContent>
        </Card>

        {/* 采集进度 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5" />
              采集进度
            </CardTitle>
            <CardDescription>
              实时监控数据采集状态和进度
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">状态</span>
              {getStatusBadge(progressData?.status || 'idle')}
            </div>
            
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span>采集进度</span>
                <span>{progressData?.progress?.toFixed(1) || 0}%</span>
              </div>
              <Progress value={progressData?.progress || 0} />
            </div>
            
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">已采集天数</span>
                <div className="font-medium">{progressData?.collectedDays || 0} / {progressData?.targetDays || 0}</div>
              </div>
              <div>
                <span className="text-muted-foreground">当前日期</span>
                <div className="font-medium">{progressData?.currentDate || '-'}</div>
              </div>
              <div>
                <span className="text-muted-foreground">开始时间</span>
                <div className="font-medium">{formatTime(progressData?.startTime)}</div>
              </div>
              <div>
                <span className="text-muted-foreground">总耗时</span>
                <div className="font-medium">{getDuration()}</div>
              </div>
            </div>
            
            <div className="text-sm">
              <span className="text-muted-foreground">当前步骤：</span>
              <span>{progressData?.currentStep || '准备就绪'}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 数据源统计 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="w-5 h-5" />
            数据源统计
          </CardTitle>
          <CardDescription>
            多数据源采集情况和验证结果
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
            {[
              { name: 'CoinGecko', status: 'active', count: 1250 },
              { name: 'CryptoCompare', status: 'active', count: 980 },
              { name: 'CoinMarketCap', status: 'active', count: 1100 },
              { name: 'Binance', status: 'active', count: 890 },
              { name: 'AlphaVantage', status: 'standby', count: 0 },
            ].map((source) => (
              <div key={source.name} className="border rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{source.name}</span>
                  <Badge 
                    variant={source.status === 'active' ? 'default' : 'secondary'}
                    className={source.status === 'active' ? 'bg-green-500' : ''}
                  >
                    {source.status === 'active' ? '活跃' : '备用'}
                  </Badge>
                </div>
                <div className="mt-2 text-2xl font-bold">{source.count}</div>
                <div className="text-sm text-muted-foreground">数据条数</div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* 采集结果 */}
      {progressData?.results && (
        <Card>
          <CardHeader>
            <CardTitle>采集结果</CardTitle>
            <CardDescription>
              本次数据采集的详细统计信息
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600">
                  {progressData.results.totalCollected}
                </div>
                <div className="text-sm text-muted-foreground">总采集数据</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-600">
                  {progressData.results.verifiedCount}
                </div>
                <div className="text-sm text-muted-foreground">验证通过</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-yellow-600">
                  {progressData.results.totalCollected - progressData.results.verifiedCount}
                </div>
                <div className="text-sm text-muted-foreground">待验证</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold">
                  {progressData.results.verifiedCount > 0 
                    ? Math.round((progressData.results.verifiedCount / progressData.results.totalCollected) * 100)
                    : 0
                  }%
                </div>
                <div className="text-sm text-muted-foreground">验证成功率</div>
              </div>
            </div>
            
            {progressData.results.error && (
              <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-md">
                <div className="flex items-center gap-2 text-red-800">
                  <AlertCircle className="w-4 h-4" />
                  <span className="font-medium">错误信息</span>
                </div>
                <p className="text-sm text-red-700 mt-1">{progressData.results.error}</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* 功能说明 */}
      <Card>
        <CardHeader>
          <CardTitle>系统特性</CardTitle>
          <CardDescription>
            VINE历史数据采集系统的核心功能
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[
              {
                title: '多数据源采集',
                description: '集成10+个主流数据源，确保数据完整性和准确性',
                icon: <Database className="w-6 h-6 text-blue-500" />
              },
              {
                title: 'AI辅助验证',
                description: '使用智谱AI进行数据合理性验证和异常检测',
                icon: <Zap className="w-6 h-6 text-yellow-500" />
              },
              {
                title: '24小时运行',
                description: '不间断采集，自动恢复和错误处理机制',
                icon: <Clock className="w-6 h-6 text-green-500" />
              },
              {
                title: '完整性检查',
                description: '自动检测缺失数据并进行智能补充',
                icon: <CheckCircle className="w-6 h-6 text-green-500" />
              },
              {
                title: '数据去重',
                description: '多源数据智能合并，避免重复采集',
                icon: <Upload className="w-6 h-6 text-purple-500" />
              },
              {
                title: '实时监控',
                description: '可视化进度监控和详细日志记录',
                icon: <BarChart3 className="w-6 h-6 text-orange-500" />
              },
            ].map((feature, index) => (
              <div key={index} className="flex items-start gap-3">
                <div className="mt-1">{feature.icon}</div>
                <div>
                  <h4 className="font-medium">{feature.title}</h4>
                  <p className="text-sm text-muted-foreground">{feature.description}</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default VINEHistoricalData;