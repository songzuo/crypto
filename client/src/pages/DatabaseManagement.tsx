import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { RefreshCw, Database, Trash2, AlertTriangle, CheckCircle } from 'lucide-react';
import { useState } from 'react';

export default function DatabaseManagement() {
  const queryClient = useQueryClient();
  const [isDeduplicating, setIsDeduplicating] = useState(false);

  // 查询重复状态
  const { data: duplicateStatus, isLoading, refetch } = useQuery({
    queryKey: ['database-duplicate-status'],
    queryFn: async () => {
      const response = await fetch('/api/database/duplicate-status');
      if (!response.ok) {
        throw new Error('Failed to fetch duplicate status');
      }
      return response.json();
    },
    refetchInterval: 30000, // 每30秒刷新一次
  });

  // 去重操作
  const deduplicateMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/database/deduplicate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      if (!response.ok) {
        throw new Error('Failed to deduplicate database');
      }
      return response.json();
    },
    onSuccess: (data) => {
      console.log('数据库去重完成:', data);
      refetch();
      setIsDeduplicating(false);
    },
    onError: (error) => {
      console.error('数据库去重失败:', error);
      setIsDeduplicating(false);
    },
  });

  const handleDeduplicate = () => {
    setIsDeduplicating(true);
    deduplicateMutation.mutate();
  };

  if (isLoading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center h-64">
          <RefreshCw className="w-8 h-8 animate-spin" />
          <span className="ml-2">正在加载数据库状态...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">数据库管理</h1>
          <p className="text-gray-600 mt-2">
            管理加密货币数据库，处理重复数据并优化存储
          </p>
        </div>
        <Button onClick={() => refetch()}>
          <RefreshCw className="h-4 w-4 mr-2" />
          刷新状态
        </Button>
      </div>

      {/* 数据库状态概览 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Database className="h-5 w-5 mr-2" />
            数据库状态概览
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="text-center">
              <div className="text-3xl font-bold text-blue-600">
                {duplicateStatus?.totalRecords?.toLocaleString() || 0}
              </div>
              <div className="text-sm text-gray-500">总记录数</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-green-600">
                {duplicateStatus?.uniqueNames?.toLocaleString() || 0}
              </div>
              <div className="text-sm text-gray-500">唯一名称数</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-red-600">
                {duplicateStatus?.duplicateCount?.toLocaleString() || 0}
              </div>
              <div className="text-sm text-gray-500">重复记录数</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 重复数据问题 */}
      {duplicateStatus?.duplicateCount > 0 && (
        <Card className="border-red-200 bg-red-50">
          <CardHeader>
            <CardTitle className="flex items-center text-red-700">
              <AlertTriangle className="h-5 w-5 mr-2" />
              检测到重复数据
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <p className="text-red-600">
                数据库中发现 <strong>{duplicateStatus.duplicateCount}</strong> 条重复记录。
                这可能导致数据分析不准确和存储空间浪费。
              </p>
              
              <div className="flex items-center justify-between">
                <span>数据利用率:</span>
                <Badge variant="destructive">
                  {((duplicateStatus.uniqueNames / duplicateStatus.totalRecords) * 100).toFixed(1)}%
                </Badge>
              </div>
              
              <Button 
                onClick={handleDeduplicate} 
                disabled={isDeduplicating || deduplicateMutation.isPending}
                className="w-full bg-red-600 hover:bg-red-700"
              >
                <Trash2 className={`w-4 h-4 mr-2 ${isDeduplicating ? 'animate-spin' : ''}`} />
                {isDeduplicating ? '正在去重处理...' : '立即清理重复数据'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 数据清洁状态 */}
      {duplicateStatus?.duplicateCount === 0 && (
        <Card className="border-green-200 bg-green-50">
          <CardHeader>
            <CardTitle className="flex items-center text-green-700">
              <CheckCircle className="h-5 w-5 mr-2" />
              数据库状态良好
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-green-600">
              数据库中没有发现重复记录。所有数据都是唯一的，数据质量良好。
            </p>
            <div className="flex items-center justify-between mt-4">
              <span>数据利用率:</span>
              <Badge variant="secondary" className="bg-green-100 text-green-800">
                100%
              </Badge>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 最严重的重复项 */}
      {duplicateStatus?.topDuplicates?.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>重复最严重的项目</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {duplicateStatus.topDuplicates.map((duplicate: any, index: number) => (
                <div key={index} className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                  <div className="font-medium">{duplicate.name}</div>
                  <Badge variant="destructive">
                    {duplicate.count} 个重复
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* 去重结果 */}
      {deduplicateMutation.data && (
        <Card className="border-green-200 bg-green-50">
          <CardHeader>
            <CardTitle className="text-green-700">去重操作完成</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 text-green-600">
              <p>✅ 处理了 {deduplicateMutation.data.processedDuplicates} 个重复名称</p>
              <p>✅ 删除了 {deduplicateMutation.data.removedRecords} 条重复记录</p>
              <p>✅ 当前总记录数: {deduplicateMutation.data.finalCount}</p>
              <p>✅ 唯一名称数: {deduplicateMutation.data.uniqueNames}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 操作说明 */}
      <Card>
        <CardHeader>
          <CardTitle>操作说明</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 text-sm text-gray-600">
            <p>• <strong>数据去重</strong>: 自动合并相同名称的加密货币，保留数据最完整的版本</p>
            <p>• <strong>智能选择</strong>: 系统会根据数据完整性和更新时间选择最佳记录</p>
            <p>• <strong>防重复机制</strong>: 未来的数据收集会自动检查并防止重复插入</p>
            <p>• <strong>安全操作</strong>: 去重过程不会丢失任何重要数据，只删除真正的重复项</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}