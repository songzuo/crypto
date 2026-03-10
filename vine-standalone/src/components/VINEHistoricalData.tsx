import React, { useState, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
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
} from 'lucide-react'

// VINE采集进度接口
interface VINEProgress {
  status: 'idle' | 'running' | 'completed' | 'failed'
  currentStep: string
  progress: number
  collectedDays: number
  targetDays: number
  currentDate: string
  startDate: string
  endDate: string
  results?: {
    success: boolean
    totalCollected: number
    verifiedCount: number
    error?: string
  }
  startTime?: Date
  endTime?: Date
}

const VINEHistoricalData = () => {
  const [symbol, setSymbol] = useState('VINE')
  const [isCollecting, setIsCollecting] = useState(false)
  const [isRepairing, setIsRepairing] = useState(false)
  const queryClient = useQueryClient()

  // 获取进度
  const { data: progress, isLoading } = useQuery({
    queryKey: ['vine-progress'],
    queryFn: async () => {
      const response = await fetch('http://localhost:5000/api/vine/progress')
      if (!response.ok) throw new Error('获取进度失败')
      return response.json() as VINEProgress
    },
    refetchInterval: 2000, // 每2秒刷新一次
  })

  // 开始采集
  const startCollection = async () => {
    setIsCollecting(true)
    try {
      const response = await fetch('http://localhost:5000/api/vine/collect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol }),
      })
      
      if (!response.ok) throw new Error('启动采集失败')
      
      // 刷新进度
      queryClient.invalidateQueries({ queryKey: ['vine-progress'] })
    } catch (error) {
      console.error('启动采集失败:', error)
    } finally {
      setIsCollecting(false)
    }
  }

  // 停止采集
  const stopCollection = async () => {
    try {
      const response = await fetch('http://localhost:5000/api/vine/stop', {
        method: 'POST',
      })
      
      if (!response.ok) throw new Error('停止采集失败')
      
      // 刷新进度
      queryClient.invalidateQueries({ queryKey: ['vine-progress'] })
    } catch (error) {
      console.error('停止采集失败:', error)
    }
  }

  // 重置进度
  const resetProgress = async () => {
    try {
      const response = await fetch('http://localhost:5000/api/vine/reset', {
        method: 'POST',
      })
      
      if (!response.ok) throw new Error('重置失败')
      
      // 刷新进度
      queryClient.invalidateQueries({ queryKey: ['vine-progress'] })
    } catch (error) {
      console.error('重置失败:', error)
    }
  }

  // 数据修复
  const repairData = async () => {
    setIsRepairing(true)
    try {
      const response = await fetch('http://localhost:5000/api/vine/repair', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol }),
      })
      
      if (!response.ok) throw new Error('数据修复失败')
      
      // 刷新进度
      queryClient.invalidateQueries({ queryKey: ['vine-progress'] })
    } catch (error) {
      console.error('数据修复失败:', error)
    } finally {
      setIsRepairing(false)
    }
  }

  // 获取状态颜色
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'running': return 'text-green-600'
      case 'completed': return 'text-blue-600'
      case 'failed': return 'text-red-600'
      default: return 'text-gray-600'
    }
  }

  // 获取状态图标
  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'running': return <Zap className="w-5 h-5 animate-pulse" />
      case 'completed': return <CheckCircle className="w-5 h-5" />
      case 'failed': return <AlertCircle className="w-5 h-5" />
      default: return <Clock className="w-5 h-5" />
    }
  }

  return (
    <div className="max-w-6xl mx-auto">
      {/* 控制面板 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <div className="bg-white rounded-lg shadow-lg p-6">
          <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <Database className="w-6 h-6" />
            数据采集控制
          </h2>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                币种符号
              </label>
              <input
                type="text"
                value={symbol}
                onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="输入币种符号，如：VINE"
              />
            </div>
            
            <div className="flex gap-2">
              <button
                onClick={startCollection}
                disabled={isCollecting || progress?.status === 'running'}
                className="flex-1 bg-green-600 text-white py-2 px-4 rounded-md hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                <Play className="w-4 h-4" />
                {isCollecting ? '启动中...' : '开始采集'}
              </button>
              
              <button
                onClick={stopCollection}
                disabled={progress?.status !== 'running'}
                className="flex-1 bg-red-600 text-white py-2 px-4 rounded-md hover:bg-red-700 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                <Square className="w-4 h-4" />
                停止采集
              </button>
            </div>
            
            <div className="flex gap-2">
              <button
                onClick={resetProgress}
                className="flex-1 bg-yellow-600 text-white py-2 px-4 rounded-md hover:bg-yellow-700 flex items-center justify-center gap-2"
              >
                <RotateCcw className="w-4 h-4" />
                重置进度
              </button>
              
              <button
                onClick={repairData}
                disabled={isRepairing}
                className="flex-1 bg-purple-600 text-white py-2 px-4 rounded-md hover:bg-purple-700 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                <Download className="w-4 h-4" />
                {isRepairing ? '修复中...' : '数据修复'}
              </button>
            </div>
          </div>
        </div>

        {/* 进度显示 */}
        <div className="bg-white rounded-lg shadow-lg p-6">
          <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <BarChart3 className="w-6 h-6" />
            采集进度
          </h2>
          
          {isLoading ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
              <p className="mt-2 text-gray-600">加载中...</p>
            </div>
          ) : progress ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700">状态</span>
                <div className={`flex items-center gap-2 ${getStatusColor(progress.status)}`}>
                  {getStatusIcon(progress.status)}
                  <span className="font-medium capitalize">{progress.status}</span>
                </div>
              </div>
              
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span>进度</span>
                  <span>{progress.progress}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div 
                    className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${progress.progress}%` }}
                  ></div>
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-gray-600">已采集天数</span>
                  <div className="font-medium">{progress.collectedDays}</div>
                </div>
                <div>
                  <span className="text-gray-600">目标天数</span>
                  <div className="font-medium">{progress.targetDays}</div>
                </div>
              </div>
              
              <div className="text-sm">
                <span className="text-gray-600">当前步骤</span>
                <div className="font-medium mt-1">{progress.currentStep}</div>
              </div>
              
              {progress.results && (
                <div className="bg-gray-50 rounded-lg p-3">
                  <div className="text-sm text-gray-600 mb-2">采集结果</div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>总数据量: {progress.results.totalCollected}</div>
                    <div>已验证: {progress.results.verifiedCount}</div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              无法连接到服务器，请确保后端服务正在运行
            </div>
          )}
        </div>
      </div>

      {/* 数据展示 */}
      <div className="bg-white rounded-lg shadow-lg p-6">
        <h2 className="text-xl font-semibold mb-4">历史数据</h2>
        <div className="text-center py-8 text-gray-500">
          数据展示功能将在采集完成后可用
        </div>
      </div>
    </div>
  )
}

export default VINEHistoricalData