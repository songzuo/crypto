import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";

interface DataItemStatus {
  name: string;
  status: 'pending' | 'success' | 'failed' | 'skipped';
  source?: string;
  error?: string;
  value?: any;
}

interface CoinCollectionDetails {
  symbol: string;
  name: string;
  totalItems: number;
  successItems: number;
  failedItems: number;
  skippedItems: number;
  dataItems: DataItemStatus[];
  startTime: string;
  endTime?: string;
  duration?: number;
}

interface CollectionProgress {
  status: 'idle' | 'running' | 'completed' | 'error';
  currentStep: string;
  progress: number;
  totalCoins: number;
  processedCoins: number;
  currentCoin?: string;
  errors: string[];
  startTime?: string;
  endTime?: string;
  coinDetails: CoinCollectionDetails[];
  currentCoinDetails?: CoinCollectionDetails;
  totalDataItems: number;
  successDataItems: number;
  failedDataItems: number;
}

const BasicDataCollection: React.FC = () => {
  const [progress, setProgress] = useState<CollectionProgress>({
    status: 'idle',
    currentStep: '准备就绪',
    progress: 0,
    totalCoins: 0,
    processedCoins: 0,
    errors: [],
    coinDetails: [],
    totalDataItems: 0,
    successDataItems: 0,
    failedDataItems: 0
  });
  const [isLoading, setIsLoading] = useState(false);
  const [isSimpleLoading, setIsSimpleLoading] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  // 获取采集进度
  const fetchProgress = async () => {
    try {
      const response = await fetch('/api/basic-data/progress');
      const data = await response.json();
      setProgress(data);
    } catch (error) {
      console.error('获取进度失败:', error);
    }
  };

  // 启动采集
  const startCollection = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/basic-data/collect', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      const result = await response.json();
      
      if (result.success) {
        // 开始轮询进度
        const interval = setInterval(fetchProgress, 2000);
        
        // 当采集完成时停止轮询
        const checkComplete = () => {
          if (progress.status === 'completed' || progress.status === 'error') {
            clearInterval(interval);
            setIsLoading(false);
          } else {
            setTimeout(checkComplete, 1000);
          }
        };
        checkComplete();
      } else {
        alert(`启动采集失败: ${result.message}`);
        setIsLoading(false);
      }
    } catch (error) {
      console.error('启动采集失败:', error);
      alert('启动采集失败');
      setIsLoading(false);
    }
  };

  // 停止采集
  const stopCollection = async () => {
    try {
      await fetch('/api/basic-data/stop', { method: 'POST' });
      await fetchProgress();
    } catch (error) {
      console.error('停止采集失败:', error);
    }
  };

  // 重置状态
  const resetCollection = async () => {
    try {
      await fetch('/api/basic-data/reset', { method: 'POST' });
      await fetchProgress();
    } catch (error) {
      console.error('重置状态失败:', error);
    }
  };

  // 启动简化版采集
  const startSimpleCollection = async () => {
    setIsSimpleLoading(true);
    try {
      const response = await fetch('/api/basic-data/simple-collect', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      const result = await response.json();
      
      if (result.success) {
        alert(`简化采集成功: ${result.message}`);
        await fetchProgress();
      } else {
        alert(`简化采集失败: ${result.message}`);
      }
    } catch (error) {
      console.error('简化采集失败:', error);
      alert('简化采集失败');
    } finally {
      setIsSimpleLoading(false);
    }
  };

  // 格式化时间
  const formatTime = (timeStr?: string) => {
    if (!timeStr) return 'N/A';
    return new Date(timeStr).toLocaleString();
  };

  // 格式化持续时间
  const formatDuration = (startTime?: string, endTime?: string) => {
    if (!startTime) return 'N/A';
    const start = new Date(startTime);
    const end = endTime ? new Date(endTime) : new Date();
    const diffMs = end.getTime() - start.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffSecs = Math.floor((diffMs % 60000) / 1000);
    return `${diffMins}m ${diffSecs}s`;
  };

  // 获取状态颜色
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'idle': return 'bg-gray-500';
      case 'running': return 'bg-blue-500';
      case 'completed': return 'bg-green-500';
      case 'error': return 'bg-red-500';
      default: return 'bg-gray-500';
    }
  };

  // 获取状态文本
  const getStatusText = (status: string) => {
    switch (status) {
      case 'idle': return '空闲';
      case 'running': return '运行中';
      case 'completed': return '已完成';
      case 'error': return '错误';
      default: return '未知';
    }
  };

  // 获取数据项状态颜色
  const getDataItemStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'bg-yellow-500';
      case 'success': return 'bg-green-500';
      case 'failed': return 'bg-red-500';
      case 'skipped': return 'bg-gray-500';
      default: return 'bg-gray-500';
    }
  };

  // 获取数据项状态文本
  const getDataItemStatusText = (status: string) => {
    switch (status) {
      case 'pending': return '等待中';
      case 'success': return '成功';
      case 'failed': return '失败';
      case 'skipped': return '跳过';
      default: return '未知';
    }
  };

  // 格式化数据项名称
  const formatDataItemName = (name: string) => {
    const nameMap: { [key: string]: string } = {
      'priceChange7d': '7日价格变化',
      'priceChange30d': '30日价格变化',
      'priceChange60d': '60日价格变化',
      'priceChange90d': '90日价格变化',
      'priceChange180d': '180日价格变化',
      'priceChange1y': '1年价格变化',
      'circulatingSupply': '流通供应量',
      'totalSupply': '总供应量',
      'circulatingToTotalRatio': '流通/总供应量比值',
      'volumeToMarketCapRatio': '交易量/市值比值',
      'marketCapToFDV': '市值/FDV比值',
      'orderBookDepth': '订单簿深度',
      'bidAskSpread': '买卖价差',
      'slippageCost': '滑点成本',
      'realVolumeRatio': '真实交易量比例',
      'top10ExchangeVolume': '前10大交易所交易量',
      'annualInflationRate': '年通胀率',
      'lockedRatio': '锁仓比例',
      'top10AddressConcentration': '前10地址集中度',
      'retailHoldingRatio': '散户持有比例',
      'dailyActiveAddresses': '日活跃地址数',
      'dailyTransactions': '日交易笔数',
      'dailyGasCost': '日均Gas费用',
      'monthlyCommits': '月度代码提交',
      'developerCount': '开发者数量',
      'dependentProjects': '依赖项目数',
      'priceToSalesRatio': 'P/S比率',
      'twitterEngagementRate': '推特互动率',
      'discordTelegramActivity': 'Discord/Telegram活跃度',
      'developerForumActivity': '开发者论坛活跃度'
    };
    return nameMap[name] || name;
  };

  // 组件挂载时获取初始状态
  useEffect(() => {
    fetchProgress();
  }, []);

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">基础数据采集</h1>
          <p className="text-slate-600 dark:text-slate-400 mt-2">
            一次性采集所有加密货币的详细基础数据，包括价格变化、供应量、链上活动、开发数据等
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={startCollection}
            disabled={isLoading || progress.status === 'running'}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {isLoading ? '启动中...' : '开始采集'}
          </Button>
          <Button
            onClick={startSimpleCollection}
            disabled={isSimpleLoading || progress.status === 'running'}
            className="bg-green-600 hover:bg-green-700"
          >
            {isSimpleLoading ? '测试中...' : '简化测试'}
          </Button>
          <Button
            onClick={() => window.location.href = '/web-scraper'}
            className="bg-purple-600 hover:bg-purple-700"
          >
            网页爬虫
          </Button>
          <Button
            onClick={stopCollection}
            disabled={progress.status !== 'running'}
            variant="destructive"
          >
            停止采集
          </Button>
          <Button
            onClick={resetCollection}
            disabled={progress.status === 'running'}
            variant="outline"
          >
            重置状态
          </Button>
        </div>
      </div>

      {/* 状态卡片 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <div className={`w-3 h-3 rounded-full ${getStatusColor(progress.status)}`}></div>
            采集状态
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <div className="text-center">
              <div className="text-2xl font-bold">{getStatusText(progress.status)}</div>
              <div className="text-sm text-slate-500 dark:text-slate-400">当前状态</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold">{progress.progress}%</div>
              <div className="text-sm text-slate-500 dark:text-slate-400">完成进度</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold">{progress.processedCoins}/{progress.totalCoins}</div>
              <div className="text-sm text-slate-500 dark:text-slate-400">已处理币种</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold">{formatDuration(progress.startTime, progress.endTime)}</div>
              <div className="text-sm text-slate-500 dark:text-slate-400">运行时间</div>
            </div>
          </div>

          {/* 数据项统计 */}
          {progress.totalDataItems && progress.totalDataItems > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600">{progress.successDataItems}</div>
                <div className="text-sm text-slate-500 dark:text-slate-400">成功采集</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-red-600">{progress.failedDataItems}</div>
                <div className="text-sm text-slate-500 dark:text-slate-400">采集失败</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-gray-600">{progress.totalDataItems - progress.successDataItems - progress.failedDataItems}</div>
                <div className="text-sm text-slate-500 dark:text-slate-400">跳过/等待</div>
              </div>
            </div>
          )}

          <div className="space-y-4">
            <div>
              <div className="flex justify-between text-sm mb-2">
                <span>当前步骤: {progress.currentStep}</span>
                <span>{progress.progress}%</span>
              </div>
              <Progress value={progress.progress} className="w-full" />
            </div>

            {progress.currentCoin && (
              <div className="text-sm text-slate-600 dark:text-slate-400">
                正在处理: <Badge variant="outline">{progress.currentCoin}</Badge>
              </div>
            )}

            {/* 显示详细状态按钮 */}
            {progress.status === 'running' && (
              <div className="flex justify-between items-center">
                <Button
                  onClick={() => setShowDetails(!showDetails)}
                  variant="outline"
                  size="sm"
                >
                  {showDetails ? '隐藏详情' : '显示详情'}
                </Button>
                <div className="text-sm text-slate-600 dark:text-slate-400">
                  数据项统计: {progress.successDataItems || 0} 成功, {progress.failedDataItems || 0} 失败, {(progress.totalDataItems || 0) - (progress.successDataItems || 0) - (progress.failedDataItems || 0)} 跳过/等待
                </div>
              </div>
            )}

            {progress.startTime && (
              <div className="text-sm text-slate-600 dark:text-slate-400">
                开始时间: {formatTime(progress.startTime)}
              </div>
            )}

            {progress.endTime && (
              <div className="text-sm text-slate-600 dark:text-slate-400">
                结束时间: {formatTime(progress.endTime)}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* 上一个加密货币详细状态 */}
      {showDetails && progress.coinDetails && progress.coinDetails.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Badge variant="outline">{progress.coinDetails[progress.coinDetails.length - 1].symbol}</Badge>
              上一个加密货币详细状态
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600">{progress.coinDetails[progress.coinDetails.length - 1].successItems}</div>
                <div className="text-sm text-slate-500 dark:text-slate-400">成功</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-red-600">{progress.coinDetails[progress.coinDetails.length - 1].failedItems}</div>
                <div className="text-sm text-slate-500 dark:text-slate-400">失败</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-gray-600">{progress.coinDetails[progress.coinDetails.length - 1].skippedItems}</div>
                <div className="text-sm text-slate-500 dark:text-slate-400">跳过</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold">{progress.coinDetails[progress.coinDetails.length - 1].totalItems}</div>
                <div className="text-sm text-slate-500 dark:text-slate-400">总计</div>
              </div>
            </div>

            <div className="space-y-2">
              <h4 className="font-semibold mb-3">数据项状态详情：</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                {progress.coinDetails[progress.coinDetails.length - 1].dataItems.map((item, index) => (
                  <div
                    key={index}
                    className={`p-3 rounded-lg border ${
                      item.status === 'success' ? 'bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800' :
                      item.status === 'failed' ? 'bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800' :
                      item.status === 'skipped' ? 'bg-gray-50 border-gray-200 dark:bg-gray-900/20 dark:border-gray-800' :
                      'bg-yellow-50 border-yellow-200 dark:bg-yellow-900/20 dark:border-yellow-800'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium text-sm">{formatDataItemName(item.name)}</span>
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${getDataItemStatusColor(item.status)}`}></div>
                        <span className="text-xs">{getDataItemStatusText(item.status)}</span>
                      </div>
                    </div>
                    {item.source && (
                      <div className="text-xs text-slate-500 dark:text-slate-400">
                        来源: {item.source}
                      </div>
                    )}
                    {item.error && (
                      <div className="text-xs text-red-600 dark:text-red-400 mt-1">
                        错误: {item.error}
                      </div>
                    )}
                    {item.value !== null && item.value !== undefined && (
                      <div className="text-xs text-green-600 dark:text-green-400 mt-1">
                        值: {typeof item.value === 'number' ? item.value.toFixed(4) : String(item.value)}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 已完成的加密货币列表 */}
      {showDetails && progress.coinDetails && progress.coinDetails.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>已完成的加密货币</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {progress.coinDetails.slice(-10).reverse().map((coin, index) => (
                <div key={index} className="border rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{coin.symbol}</Badge>
                      <span className="text-sm text-slate-600 dark:text-slate-400">{coin.name}</span>
                    </div>
                    <div className="flex items-center gap-4 text-sm">
                      <span className="text-green-600">{coin.successItems} 成功</span>
                      <span className="text-red-600">{coin.failedItems} 失败</span>
                      <span className="text-gray-600">{coin.skippedItems} 跳过</span>
                      {coin.duration && (
                        <span className="text-slate-500">
                          {Math.round(coin.duration / 1000)}s
                        </span>
                      )}
                    </div>
                  </div>
                  
                  {/* 数据项状态概览 */}
                  <div className="grid grid-cols-6 gap-1">
                    {coin.dataItems.map((item, itemIndex) => (
                      <div
                        key={itemIndex}
                        className={`w-4 h-4 rounded ${
                          item.status === 'success' ? 'bg-green-500' :
                          item.status === 'failed' ? 'bg-red-500' :
                          item.status === 'skipped' ? 'bg-gray-500' :
                          'bg-yellow-500'
                        }`}
                        title={`${formatDataItemName(item.name)}: ${getDataItemStatusText(item.status)}`}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* 错误信息 */}
      {progress.errors.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-red-600">错误信息</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {progress.errors.map((error, index) => (
                <Alert key={index} variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* 采集说明 */}
      <Card>
        <CardHeader>
          <CardTitle>采集说明</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <h3 className="font-semibold mb-2">采集的数据项包括：</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <h4 className="font-medium mb-2">价格变化数据</h4>
                  <ul className="text-sm text-slate-600 dark:text-slate-400 space-y-1">
                    <li>• 7日、30日、60日、90日涨跌</li>
                    <li>• 半年、一年涨跌</li>
                  </ul>
                </div>
                <div>
                  <h4 className="font-medium mb-2">供应量数据</h4>
                  <ul className="text-sm text-slate-600 dark:text-slate-400 space-y-1">
                    <li>• 流通供应量、总供应量</li>
                    <li>• 流通/总供应量比值</li>
                  </ul>
                </div>
                <div>
                  <h4 className="font-medium mb-2">链上活动</h4>
                  <ul className="text-sm text-slate-600 dark:text-slate-400 space-y-1">
                    <li>• 日活跃地址数、日交易笔数</li>
                    <li>• Gas费用消耗、地址集中度</li>
                  </ul>
                </div>
                <div>
                  <h4 className="font-medium mb-2">开发活动</h4>
                  <ul className="text-sm text-slate-600 dark:text-slate-400 space-y-1">
                    <li>• 月度代码提交次数</li>
                    <li>• 开发者数量、依赖项目数</li>
                  </ul>
                </div>
              </div>
            </div>

            <Separator />

            <div>
              <h3 className="font-semibold mb-2">数据来源：</h3>
              <div className="flex flex-wrap gap-2">
                {['CoinMarketCap', 'CoinGecko', 'Glassnode', 'Santiment', 'DeFiLlama', 'GitHub', 'Messari'].map((source) => (
                  <Badge key={source} variant="outline">{source}</Badge>
                ))}
              </div>
            </div>

            <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg">
              <h4 className="font-medium text-blue-900 dark:text-blue-100 mb-2">注意事项：</h4>
              <ul className="text-sm text-blue-800 dark:text-blue-200 space-y-1">
                <li>• 采集过程可能需要较长时间，请耐心等待</li>
                <li>• 采集过程中可以随时停止，已采集的数据会保留</li>
                <li>• 部分数据源需要API密钥，可能无法获取完整数据</li>
                <li>• 建议在网络状况良好时进行采集</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default BasicDataCollection;
