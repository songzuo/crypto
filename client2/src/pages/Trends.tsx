import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { CalendarDays, TrendingUp, RefreshCw } from "lucide-react";
import { formatDistanceToNow } from 'date-fns';

interface WordFrequency {
  word: string;
  count: number;
}

interface TrendAnalysisResult {
  timestamp: string;        // 当前请求时间戳
  topWords: WordFrequency[];
  lastRunTime: string | null; // 上次分析运行时间
}

function WordFrequencyItem({ word, count, maxCount }: { word: string; count: number; maxCount: number }) {
  const percentage = (count / maxCount) * 100;
  
  return (
    <div className="flex flex-col space-y-1 mb-3">
      <div className="flex justify-between items-center">
        <span className="text-sm font-medium">{word}</span>
        <span className="text-xs text-gray-500">{count}次</span>
      </div>
      <Progress value={percentage} className="h-2" />
    </div>
  );
}

export default function Trends() {
  const [refreshInterval, setRefreshInterval] = useState<number>(300000); // 5 minutes

  const { data, isLoading, error, refetch, dataUpdatedAt } = useQuery({
    queryKey: ['/api/trends'],
    refetchInterval: refreshInterval
  });

  if (isLoading) {
    return (
      <div className="container mx-auto p-4 max-w-7xl">
        <Card className="mb-6">
          <CardHeader>
            <Skeleton className="h-8 w-[250px] mb-2" />
            <Skeleton className="h-4 w-[350px]" />
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-4">
              {Array(15).fill(0).map((_, i) => (
                <div key={i} className="space-y-2">
                  <Skeleton className="h-4 w-[80px]" />
                  <Skeleton className="h-2 w-full" />
                </div>
              ))}
            </div>
            <div className="space-y-4">
              {Array(15).fill(0).map((_, i) => (
                <div key={i} className="space-y-2">
                  <Skeleton className="h-4 w-[80px]" />
                  <Skeleton className="h-2 w-full" />
                </div>
              ))}
            </div>
          </CardContent>
          <CardFooter>
            <Skeleton className="h-4 w-[200px]" />
          </CardFooter>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto p-4 max-w-7xl">
        <Card className="bg-red-50">
          <CardHeader>
            <CardTitle>数据加载错误</CardTitle>
            <CardDescription>无法加载趋势数据</CardDescription>
          </CardHeader>
          <CardContent>
            <p>尝试刷新页面或稍后再试</p>
          </CardContent>
          <CardFooter>
            <button 
              onClick={() => refetch()} 
              className="flex items-center px-4 py-2 bg-primary text-white rounded-md hover:bg-primary/90"
            >
              <RefreshCw className="mr-2 h-4 w-4" /> 重试
            </button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  // 解析数据
  const trends = data as TrendAnalysisResult;
  
  if (!trends || !trends.topWords || trends.topWords.length === 0) {
    return (
      <div className="container mx-auto p-4 max-w-7xl">
        <Card>
          <CardHeader>
            <CardTitle>暂无趋势数据</CardTitle>
            <CardDescription>系统正在收集加密货币新闻</CardDescription>
          </CardHeader>
          <CardContent>
            <p>请等待系统收集足够的新闻数据以生成趋势分析</p>
          </CardContent>
          <CardFooter>
            <button 
              onClick={() => refetch()} 
              className="flex items-center px-4 py-2 bg-primary text-white rounded-md hover:bg-primary/90"
            >
              <RefreshCw className="mr-2 h-4 w-4" /> 刷新
            </button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  // 计算最大频率值，用于进度条百分比
  const maxCount = Math.max(...trends.topWords.map(item => item.count));
  
  // 将词汇分为两组，每组15个
  const firstColumn = trends.topWords.slice(0, 15);
  const secondColumn = trends.topWords.slice(15, 30);

  return (
    <div className="container mx-auto p-4 max-w-7xl">
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <div>
              <CardTitle className="flex items-center text-2xl">
                <TrendingUp className="mr-2 h-6 w-6 text-primary" />
                加密货币热门趋势词汇
              </CardTitle>
              <CardDescription>
                基于最新加密货币新闻的关键词频率分析
              </CardDescription>
            </div>
            <button 
              onClick={() => refetch()} 
              className="flex items-center p-2 rounded-full hover:bg-gray-100"
              title="手动刷新数据"
            >
              <RefreshCw className="h-5 w-5 text-gray-500" />
            </button>
          </div>
        </CardHeader>
        
        <CardContent>
          <Tabs defaultValue="frequency" className="mb-6">
            <TabsList className="mb-4">
              <TabsTrigger value="frequency">频率排序</TabsTrigger>
              <TabsTrigger value="alphabetical">字母排序</TabsTrigger>
            </TabsList>
            
            <TabsContent value="frequency">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div>
                  <h3 className="font-medium mb-4 text-primary">热门词汇 1-15</h3>
                  {firstColumn.map((item, index) => (
                    <WordFrequencyItem 
                      key={index} 
                      word={item.word} 
                      count={item.count} 
                      maxCount={maxCount} 
                    />
                  ))}
                </div>
                
                <div>
                  <h3 className="font-medium mb-4 text-primary">热门词汇 16-30</h3>
                  {secondColumn.map((item, index) => (
                    <WordFrequencyItem 
                      key={index} 
                      word={item.word} 
                      count={item.count} 
                      maxCount={maxCount} 
                    />
                  ))}
                </div>
              </div>
            </TabsContent>
            
            <TabsContent value="alphabetical">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div>
                  <h3 className="font-medium mb-4 text-primary">按字母排序 (A-M)</h3>
                  {trends.topWords
                    .slice()
                    .sort((a, b) => a.word.localeCompare(b.word))
                    .filter(item => item.word.toLowerCase() < 'n')
                    .slice(0, 15)
                    .map((item, index) => (
                      <WordFrequencyItem 
                        key={index} 
                        word={item.word} 
                        count={item.count} 
                        maxCount={maxCount} 
                      />
                    ))
                  }
                </div>
                
                <div>
                  <h3 className="font-medium mb-4 text-primary">按字母排序 (N-Z)</h3>
                  {trends.topWords
                    .slice()
                    .sort((a, b) => a.word.localeCompare(b.word))
                    .filter(item => item.word.toLowerCase() >= 'n')
                    .slice(0, 15)
                    .map((item, index) => (
                      <WordFrequencyItem 
                        key={index} 
                        word={item.word} 
                        count={item.count} 
                        maxCount={maxCount} 
                      />
                    ))
                  }
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
        
        <CardFooter className="text-sm text-gray-500 flex items-center">
          <CalendarDays className="h-4 w-4 mr-2" />
          {trends.lastRunTime 
            ? `最后更新: ${new Intl.DateTimeFormat('zh-CN', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                hour12: false
              }).format(new Date(trends.lastRunTime))} - 每5分钟更新一次`
            : `分析时间: ${new Intl.DateTimeFormat('zh-CN', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                hour12: false
              }).format(new Date(trends.timestamp))} - 每5分钟更新一次`
          }
        </CardFooter>
      </Card>
    </div>
  );
}