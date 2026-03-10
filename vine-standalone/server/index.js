import express from 'express'
import cors from 'cors'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = express()
const PORT = 5000

// 中间件
app.use(cors())
app.use(express.json())

// 创建VINE目录
const VINE_DIR = path.join(process.cwd(), 'vine')
if (!fs.existsSync(VINE_DIR)) {
  fs.mkdirSync(VINE_DIR, { recursive: true })
}

// 全局进度状态
let vineProgress = {
  status: 'idle',
  currentStep: '准备就绪',
  progress: 0,
  collectedDays: 0,
  targetDays: 365,
  currentDate: '',
  startDate: '2023-01-01',
  endDate: '2023-12-31',
  startTime: null,
  endTime: null
}

// 采集运行标志
let isVINECollectionRunning = false

// 模拟数据采集函数
async function simulateVINECollection(symbol) {
  if (isVINECollectionRunning) return
  
  isVINECollectionRunning = true
  vineProgress.status = 'running'
  vineProgress.startTime = new Date()
  
  try {
    // 模拟采集过程
    for (let i = 0; i <= 100; i += 10) {
      if (!isVINECollectionRunning) break
      
      vineProgress.progress = i
      vineProgress.collectedDays = Math.floor(i / 100 * vineProgress.targetDays)
      vineProgress.currentStep = `采集 ${symbol} 数据 (${i}%)`
      
      // 模拟采集延迟
      await new Promise(resolve => setTimeout(resolve, 1000))
    }
    
    if (isVINECollectionRunning) {
      vineProgress.status = 'completed'
      vineProgress.endTime = new Date()
      vineProgress.results = {
        success: true,
        totalCollected: vineProgress.targetDays,
        verifiedCount: vineProgress.targetDays
      }
    }
  } catch (error) {
    vineProgress.status = 'failed'
    vineProgress.currentStep = `采集失败: ${error.message}`
  } finally {
    isVINECollectionRunning = false
  }
}

// API路由

// 获取进度
app.get('/api/vine/progress', (req, res) => {
  res.json(vineProgress)
})

// 开始采集
app.post('/api/vine/collect', async (req, res) => {
  const { symbol = 'VINE' } = req.body
  
  if (isVINECollectionRunning) {
    return res.status(400).json({ error: '采集正在进行中' })
  }
  
  // 重置进度
  vineProgress = {
    status: 'running',
    currentStep: '开始采集',
    progress: 0,
    collectedDays: 0,
    targetDays: 365,
    currentDate: '',
    startDate: '2023-01-01',
    endDate: '2023-12-31',
    startTime: new Date(),
    endTime: null
  }
  
  // 异步开始采集
  simulateVINECollection(symbol)
  
  res.json({ message: '采集已启动', symbol })
})

// 停止采集
app.post('/api/vine/stop', (req, res) => {
  isVINECollectionRunning = false
  vineProgress.status = 'idle'
  vineProgress.currentStep = '采集已停止'
  res.json({ message: '采集已停止' })
})

// 重置进度
app.post('/api/vine/reset', (req, res) => {
  isVINECollectionRunning = false
  vineProgress = {
    status: 'idle',
    currentStep: '准备就绪',
    progress: 0,
    collectedDays: 0,
    targetDays: 365,
    currentDate: '',
    startDate: '2023-01-01',
    endDate: '2023-12-31',
    startTime: null,
    endTime: null
  }
  res.json({ message: '进度已重置' })
})

// 数据修复
app.post('/api/vine/repair', (req, res) => {
  const { symbol = 'VINE' } = req.body
  
  // 模拟数据修复
  setTimeout(() => {
    vineProgress.currentStep = `${symbol} 数据修复完成`
  }, 2000)
  
  res.json({ message: '数据修复已启动', symbol })
})

// 获取数据
app.get('/api/vine/data', (req, res) => {
  const { symbol = 'VINE', startDate, endDate } = req.query
  
  // 模拟返回数据
  const mockData = {
    symbol,
    data: [],
    total: 0,
    startDate: startDate || '2023-01-01',
    endDate: endDate || '2023-12-31'
  }
  
  res.json(mockData)
})

// 健康检查
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// 启动服务器
app.listen(PORT, () => {
  console.log(`🚀 VINE历史数据采集系统后端服务运行在 http://localhost:${PORT}`)
  console.log(`📊 API文档: http://localhost:${PORT}/api/vine`)
  console.log(`💚 健康检查: http://localhost:${PORT}/health`)
})