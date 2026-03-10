import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface DataItemStatus {
  name: string;
  status: 'pending' | 'success' | 'failed' | 'skipped';
  source?: string;
  error?: string;
  value?: any;
}

interface CoinScrapingDetails {
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

interface ScraperStatus {
  isRunning: boolean;
  currentWebsite: string;
  processedCoins: number;
  totalCoins: number;
  errors: string[];
  startTime?: string;
  endTime?: string;
  lastCoin?: string;
  coinDetails?: CoinScrapingDetails[];
  currentCoinDetails?: CoinScrapingDetails;
  totalDataItems?: number;
  successDataItems?: number;
  failedDataItems?: number;
}

const WebScraper: React.FC = () => {
  const [status, setStatus] = useState<ScraperStatus>({
    isRunning: false,
    currentWebsite: '',
    processedCoins: 0,
    totalCoins: 0,
    errors: []
  });
  const [isLoading, setIsLoading] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [selectedWebsite, setSelectedWebsite] = useState('');
  const [showDataItems, setShowDataItems] = useState(false);

  // 获取爬虫状态
  const fetchStatus = async () => {
    try {
      const response = await fetch('/api/web-scraper/status');
      const data = await response.json();
      setStatus(data);
    } catch (error) {
      console.error('获取爬虫状态失败:', error);
    }
  };

  // 获取测试详细状态
  const fetchTestDetails = async () => {
    try {
      const response = await fetch('/api/web-scraper/test-details', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      const data = await response.json();
      setStatus(data);
    } catch (error) {
      console.error('获取测试详细状态失败:', error);
    }
  };

  // 启动爬虫
  const startScraping = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/web-scraper/start', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      const result = await response.json();
      
      if (result.success) {
        // 开始轮询状态
        const interval = setInterval(fetchStatus, 2000);
        
        // 当爬虫完成时停止轮询
        const checkComplete = () => {
          if (!status.isRunning) {
            clearInterval(interval);
            setIsLoading(false);
          } else {
            setTimeout(checkComplete, 1000);
          }
        };
        checkComplete();
      } else {
        alert(`启动爬虫失败: ${result.message}`);
        setIsLoading(false);
      }
    } catch (error) {
      console.error('启动爬虫失败:', error);
      alert('启动爬虫失败');
      setIsLoading(false);
    }
  };

  // 停止爬虫
  const stopScraping = async () => {
    try {
      await fetch('/api/web-scraper/stop', { method: 'POST' });
      await fetchStatus();
    } catch (error) {
      console.error('停止爬虫失败:', error);
    }
  };

  // 重置状态
  const resetStatus = async () => {
    try {
      await fetch('/api/web-scraper/reset', { method: 'POST' });
      await fetchStatus();
    } catch (error) {
      console.error('重置状态失败:', error);
    }
  };

  // 测试单个网站
  const testWebsite = async () => {
    if (!selectedWebsite) {
      alert('请选择要测试的网站');
      return;
    }
    
    setIsTesting(true);
    try {
      const response = await fetch('/api/web-scraper/test-website', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ websiteName: selectedWebsite })
      });
      const result = await response.json();
      
      if (result.success) {
        alert(`测试成功: ${result.message}`);
      } else {
        alert(`测试失败: ${result.message}`);
      }
    } catch (error) {
      console.error('测试网站失败:', error);
      alert('测试网站失败');
    } finally {
      setIsTesting(false);
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
  const getStatusColor = (isRunning: boolean) => {
    return isRunning ? 'bg-blue-500' : 'bg-gray-500';
  };

  // 获取状态文本
  const getStatusText = (isRunning: boolean) => {
    return isRunning ? '运行中' : '空闲';
  };

  // 计算进度百分比
  const getProgressPercentage = () => {
    if (status.totalCoins === 0) return 0;
    return Math.round((status.processedCoins / status.totalCoins) * 100);
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
    fetchStatus();
  }, []);

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">网页爬虫</h1>
          <p className="text-slate-600 dark:text-slate-400 mt-2">
            使用浏览器自动化工具爬取专业加密货币网站，支持网站轮换和反爬虫策略
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={startScraping}
            disabled={isLoading || status.isRunning}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {isLoading ? '启动中...' : '开始爬取'}
          </Button>
          <Button
            onClick={stopScraping}
            disabled={!status.isRunning}
            variant="destructive"
          >
            停止爬取
          </Button>
          <Button
            onClick={resetStatus}
            disabled={status.isRunning}
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
            <div className={`w-3 h-3 rounded-full ${getStatusColor(status.isRunning)}`}></div>
            爬虫状态
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <div className="text-center">
              <div className="text-2xl font-bold">{getStatusText(status.isRunning)}</div>
              <div className="text-sm text-slate-500 dark:text-slate-400">当前状态</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold">{getProgressPercentage()}%</div>
              <div className="text-sm text-slate-500 dark:text-slate-400">完成进度</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold">{status.processedCoins}/{status.totalCoins}</div>
              <div className="text-sm text-slate-500 dark:text-slate-400">已处理币种</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold">{formatDuration(status.startTime, status.endTime)}</div>
              <div className="text-sm text-slate-500 dark:text-slate-400">运行时间</div>
            </div>
          </div>

          {/* 数据项统计 */}
          {status.totalDataItems && status.totalDataItems > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600">{status.successDataItems || 0}</div>
                <div className="text-sm text-slate-500 dark:text-slate-400">成功采集</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-red-600">{status.failedDataItems || 0}</div>
                <div className="text-sm text-slate-500 dark:text-slate-400">采集失败</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-gray-600">{(status.totalDataItems || 0) - (status.successDataItems || 0) - (status.failedDataItems || 0)}</div>
                <div className="text-sm text-slate-500 dark:text-slate-400">跳过/等待</div>
              </div>
            </div>
          )}

          <div className="space-y-4">
            <div>
              <div className="flex justify-between text-sm mb-2">
                <span>当前网站: {status.currentWebsite || '无'}</span>
                <span>{getProgressPercentage()}%</span>
              </div>
              <Progress value={getProgressPercentage()} className="w-full" />
            </div>

            {status.lastCoin && (
              <div className="text-sm text-slate-600 dark:text-slate-400">
                正在处理: <Badge variant="outline">{status.lastCoin}</Badge>
              </div>
            )}

            {/* 显示详细状态按钮 */}
            <div className="flex justify-between items-center">
              <div className="flex gap-2">
                <Button
                  onClick={() => setShowDetails(!showDetails)}
                  variant="outline"
                  size="sm"
                >
                  {showDetails ? '隐藏详情' : '显示详情'}
                </Button>
                <Button
                  onClick={() => setShowDataItems(!showDataItems)}
                  variant="outline"
                  size="sm"
                >
                  {showDataItems ? '隐藏数据项' : '显示数据项'}
                </Button>
                <Button
                  onClick={fetchTestDetails}
                  variant="outline"
                  size="sm"
                  className="bg-green-100 hover:bg-green-200"
                >
                  测试数据
                </Button>
              </div>
              <div className="text-sm text-slate-600 dark:text-slate-400">
                错误数量: {status.errors.length}
              </div>
            </div>

            {status.startTime && (
              <div className="text-sm text-slate-600 dark:text-slate-400">
                开始时间: {formatTime(status.startTime)}
              </div>
            )}

            {status.endTime && (
              <div className="text-sm text-slate-600 dark:text-slate-400">
                结束时间: {formatTime(status.endTime)}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* 测试单个网站 */}
      <Card>
        <CardHeader>
          <CardTitle>测试单个网站</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4 items-end">
            <div className="flex-1">
              <label className="text-sm font-medium mb-2 block">选择网站</label>
              <Select value={selectedWebsite} onValueChange={setSelectedWebsite}>
                <SelectTrigger>
                  <SelectValue placeholder="选择要测试的网站" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="CoinMarketCap">CoinMarketCap</SelectItem>
                  <SelectItem value="CoinGecko">CoinGecko</SelectItem>
                  <SelectItem value="CoinRanking">CoinRanking</SelectItem>
                  <SelectItem value="Crypto.com">Crypto.com</SelectItem>
                  <SelectItem value="Coinbase">Coinbase</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button
              onClick={testWebsite}
              disabled={isTesting || !selectedWebsite}
              className="bg-green-600 hover:bg-green-700"
            >
              {isTesting ? '测试中...' : '测试网站'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* 数据项详情显示 */}
      {showDataItems && status.coinDetails && status.coinDetails.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Badge variant="outline">{status.coinDetails[status.coinDetails.length - 1].symbol}</Badge>
              上一个加密货币数据项状态
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600">{status.coinDetails[status.coinDetails.length - 1].successItems}</div>
                <div className="text-sm text-slate-500 dark:text-slate-400">成功</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-red-600">{status.coinDetails[status.coinDetails.length - 1].failedItems}</div>
                <div className="text-sm text-slate-500 dark:text-slate-400">失败</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-gray-600">{status.coinDetails[status.coinDetails.length - 1].skippedItems}</div>
                <div className="text-sm text-slate-500 dark:text-slate-400">跳过</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold">{status.coinDetails[status.coinDetails.length - 1].totalItems}</div>
                <div className="text-sm text-slate-500 dark:text-slate-400">总计</div>
              </div>
            </div>

            <div className="space-y-2">
              <h4 className="font-semibold mb-3">数据项状态详情：</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                {status.coinDetails[status.coinDetails.length - 1].dataItems.map((item, index) => (
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

      {/* 错误信息 */}
      {status.errors.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-red-600">错误信息</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {status.errors.map((error, index) => (
                <Alert key={index} variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* 爬虫说明 */}
      <Card>
        <CardHeader>
          <CardTitle>爬虫说明</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <h3 className="font-semibold mb-2">支持的网站：</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <h4 className="font-medium mb-2">主要网站</h4>
                  <ul className="text-sm text-slate-600 dark:text-slate-400 space-y-1">
                    <li>• CoinMarketCap - 全球最大的加密货币数据平台</li>
                    <li>• CoinGecko - 独立的加密货币数据聚合器</li>
                    <li>• CoinRanking - 加密货币排名和价格数据</li>
                  </ul>
                </div>
                <div>
                  <h4 className="font-medium mb-2">交易所网站</h4>
                  <ul className="text-sm text-slate-600 dark:text-slate-400 space-y-1">
                    <li>• Crypto.com - 全球领先的加密货币交易所</li>
                    <li>• Coinbase - 美国最大的加密货币交易所</li>
                    <li>• Kraken - 老牌加密货币交易所</li>
                  </ul>
                </div>
              </div>
            </div>

            <Separator />

            <div>
              <h3 className="font-semibold mb-2">爬取的数据项（30项）：</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <div>
                  <h4 className="font-medium mb-2">价格变化数据（6项）</h4>
                  <ul className="text-sm text-slate-600 dark:text-slate-400 space-y-1">
                    <li>• 7日、30日、60日涨跌</li>
                    <li>• 90日、半年、一年涨跌</li>
                  </ul>
                </div>
                <div>
                  <h4 className="font-medium mb-2">供应量数据（3项）</h4>
                  <ul className="text-sm text-slate-600 dark:text-slate-400 space-y-1">
                    <li>• 流通供应量、总供应量</li>
                    <li>• 流通/总供应量比值</li>
                  </ul>
                </div>
                <div>
                  <h4 className="font-medium mb-2">链上活动（3项）</h4>
                  <ul className="text-sm text-slate-600 dark:text-slate-400 space-y-1">
                    <li>• 日活跃地址数、日交易笔数</li>
                    <li>• Gas费用消耗、地址集中度</li>
                  </ul>
                </div>
                <div>
                  <h4 className="font-medium mb-2">开发活动（3项）</h4>
                  <ul className="text-sm text-slate-600 dark:text-slate-400 space-y-1">
                    <li>• 月度代码提交次数</li>
                    <li>• 开发者数量、依赖项目数</li>
                  </ul>
                </div>
                <div>
                  <h4 className="font-medium mb-2">交易数据（5项）</h4>
                  <ul className="text-sm text-slate-600 dark:text-slate-400 space-y-1">
                    <li>• 订单簿深度、买卖价差</li>
                    <li>• 滑点成本、真实交易量比例</li>
                    <li>• 前10大交易所交易量</li>
                  </ul>
                </div>
                <div>
                  <h4 className="font-medium mb-2">社交媒体（3项）</h4>
                  <ul className="text-sm text-slate-600 dark:text-slate-400 space-y-1">
                    <li>• 推特互动率</li>
                    <li>• Discord/Telegram活跃度</li>
                    <li>• 开发者论坛活跃度</li>
                  </ul>
                </div>
              </div>
            </div>

            <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg">
              <h4 className="font-medium text-blue-900 dark:text-blue-100 mb-2">注意事项：</h4>
              <ul className="text-sm text-blue-800 dark:text-blue-200 space-y-1">
                <li>• 爬虫会自动轮换不同网站，避免单一网站压力过大</li>
                <li>• 使用随机延迟和人类行为模拟，降低被检测风险</li>
                <li>• 支持断点续传，可以随时停止和重启</li>
                <li>• 数据会实时更新到现有的加密货币表中</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default WebScraper;
