import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function TechnicalAnalysis() {
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

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>技术分析结果</CardTitle>
        </CardHeader>
        <CardContent>
          <p>技术分析每24小时自动更新一次，与交易量市值比率分析同步运行。</p>
          <p className="mt-4">上次更新时间: {new Date().toLocaleString()}</p>
        </CardContent>
      </Card>
    </div>
  );
}