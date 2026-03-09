import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { db } from '../db';
import { cryptocurrencies } from '@shared/schema';
import { eq } from 'drizzle-orm';

// VINE币种历史数据接口
interface VINEHistoricalData {
  symbol: string;
  name: string;
  timestamp: string;
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  marketCap?: number;
  source: string;
  verified: boolean;
  aiEnhanced?: boolean;
}

// 采集进度接口
interface VINEProgress {
  status: 'idle' | 'running' | 'completed' | 'failed';
  currentStep: string;
  progress: number; // 0-100
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

// 全局进度状态
let vineProgress: VINEProgress = {
  status: 'idle',
  currentStep: '准备就绪',
  progress: 0,
  collectedDays: 0,
  targetDays: 0,
  currentDate: '',
  startDate: '',
  endDate: ''
};

// 采集运行标志
let isVINECollectionRunning = false;

// 创建VINE目录
const VINE_DIR = path.join(process.cwd(), 'vine');
if (!fs.existsSync(VINE_DIR)) {
  fs.mkdirSync(VINE_DIR, { recursive: true });
}

// 数据存储文件路径
const getDataFilePath = (symbol: string) => path.join(VINE_DIR, `${symbol.toLowerCase()}_historical_data.json`);
const getProgressFilePath = (symbol: string) => path.join(VINE_DIR, `${symbol.toLowerCase()}_progress.json`);

// 保存数据到文件
function saveDataToFile(symbol: string, data: VINEHistoricalData[]): void {
  try {
    const filePath = getDataFilePath(symbol);
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
    console.log(`✅ ${symbol} 数据已保存到文件: ${filePath}`);
  } catch (error) {
    console.error(`❌ ${symbol} 数据保存失败:`, error);
  }
}

// 从文件加载数据
function loadDataFromFile(symbol: string): VINEHistoricalData[] {
  try {
    const filePath = getDataFilePath(symbol);
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error(`❌ ${symbol} 数据加载失败:`, error);
  }
  return [];
}

// 保存进度到文件
function saveProgressToFile(symbol: string, progress: VINEProgress): void {
  try {
    const filePath = getProgressFilePath(symbol);
    fs.writeFileSync(filePath, JSON.stringify(progress, null, 2), 'utf8');
  } catch (error) {
    console.error(`❌ ${symbol} 进度保存失败:`, error);
  }
}

// 从文件加载进度
function loadProgressFromFile(symbol: string): VINEProgress | null {
  try {
    const filePath = getProgressFilePath(symbol);
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error(`❌ ${symbol} 进度加载失败:`, error);
  }
  return null;
}

// 多API数据源配置 - 10+种采集方法
const VINE_DATA_SOURCES = [
  // 1. CoinGecko API
  {
    name: 'CoinGecko',
    priority: 1,
    timeout: 30000,
    headers: {
      'Accept': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    },
    buildUrl: (symbol: string, startDate: string, endDate: string) =>
      `https://api.coingecko.com/api/v3/coins/${symbol.toLowerCase()}/market_chart/range?vs_currency=usd&from=${new Date(startDate).getTime() / 1000}&to=${new Date(endDate).getTime() / 1000}`,
    transform: (data: any, symbol: string, date: string): VINEHistoricalData[] => {
      if (!data.prices || !Array.isArray(data.prices)) return [];
      
      return data.prices.map((priceData: [number, number], index: number) => {
        const timestamp = priceData[0];
        const price = priceData[1];
        const volume = data.total_volumes?.[index]?.[1] || 0;
        const marketCap = data.market_caps?.[index]?.[1] || 0;
        
        return {
          symbol: symbol.toUpperCase(),
          name: 'VINE',
          timestamp: new Date(timestamp).toISOString(),
          date: new Date(timestamp).toISOString().split('T')[0],
          open: price,
          high: price,
          low: price,
          close: price,
          volume: volume,
          marketCap: marketCap,
          source: 'CoinGecko',
          verified: true
        };
      });
    }
  },
  
  // 2. CryptoCompare API
  {
    name: 'CryptoCompare',
    priority: 2,
    timeout: 30000,
    headers: {
      'Accept': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    },
    buildUrl: (symbol: string, startDate: string, endDate: string) =>
      `https://min-api.cryptocompare.com/data/v2/histoday?fsym=${symbol}&tsym=USD&limit=2000&toTs=${Math.floor(new Date(endDate).getTime() / 1000)}`,
    transform: (data: any, symbol: string, date: string): VINEHistoricalData[] => {
      if (!data.Data || !data.Data.Data || !Array.isArray(data.Data.Data)) return [];
      
      return data.Data.Data.map((dayData: any) => ({
        symbol: symbol.toUpperCase(),
        name: 'VINE',
        timestamp: new Date(dayData.time * 1000).toISOString(),
        date: new Date(dayData.time * 1000).toISOString().split('T')[0],
        open: dayData.open,
        high: dayData.high,
        low: dayData.low,
        close: dayData.close,
        volume: dayData.volumeto,
        marketCap: dayData.mktcap,
        source: 'CryptoCompare',
        verified: true
      }));
    }
  },
  
  // 3. Alpha Vantage API
  {
    name: 'AlphaVantage',
    priority: 3,
    timeout: 30000,
    headers: {
      'Accept': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    },
    buildUrl: (symbol: string) =>
      `https://www.alphavantage.co/query?function=DIGITAL_CURRENCY_DAILY&symbol=${symbol}&market=USD&apikey=demo`,
    transform: (data: any, symbol: string, date: string): VINEHistoricalData[] => {
      if (!data['Time Series (Digital Currency Daily)']) return [];
      
      return Object.entries(data['Time Series (Digital Currency Daily)']).map(([dateStr, dayData]: [string, any]) => ({
        symbol: symbol.toUpperCase(),
        name: 'VINE',
        timestamp: new Date(dateStr).toISOString(),
        date: dateStr,
        open: parseFloat(dayData['1a. open (USD)']),
        high: parseFloat(dayData['2a. high (USD)']),
        low: parseFloat(dayData['3a. low (USD)']),
        close: parseFloat(dayData['4a. close (USD)']),
        volume: parseFloat(dayData['5. volume']),
        marketCap: parseFloat(dayData['6. market cap (USD)']),
        source: 'AlphaVantage',
        verified: true
      }));
    }
  },
  
  // 4. CoinMarketCap API
  {
    name: 'CoinMarketCap',
    priority: 4,
    timeout: 30000,
    headers: {
      'Accept': 'application/json',
      'X-CMC_PRO_API_KEY': 'b7473e43-0c05-46a7-b82e-726a04985baa',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    },
    buildUrl: (symbol: string) =>
      `https://pro-api.coinmarketcap.com/v1/cryptocurrency/ohlcv/historical?id=1&time_start=2013-04-28&time_end=${new Date().toISOString().split('T')[0]}`,
    transform: (data: any, symbol: string, date: string): VINEHistoricalData[] => {
      if (!data.data || !data.data.quotes) return [];
      
      return data.data.quotes.map((quote: any) => ({
        symbol: symbol.toUpperCase(),
        name: 'VINE',
        timestamp: quote.timestamp,
        date: new Date(quote.timestamp).toISOString().split('T')[0],
        open: quote.quote.USD.open,
        high: quote.quote.USD.high,
        low: quote.quote.USD.low,
        close: quote.quote.USD.close,
        volume: quote.quote.USD.volume,
        marketCap: quote.quote.USD.market_cap,
        source: 'CoinMarketCap',
        verified: true
      }));
    }
  },
  
  // 5. CoinAPI
  {
    name: 'CoinAPI',
    priority: 5,
    timeout: 30000,
    headers: {
      'Accept': 'application/json',
      'X-CoinAPI-Key': 'demo-key',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    },
    buildUrl: (symbol: string, startDate: string, endDate: string) =>
      `https://rest.coinapi.io/v1/ohlcv/${symbol}/USD/history?period_id=1DAY&time_start=${startDate}&time_end=${endDate}`,
    transform: (data: any, symbol: string, date: string): VINEHistoricalData[] => {
      if (!Array.isArray(data)) return [];
      
      return data.map((dayData: any) => ({
        symbol: symbol.toUpperCase(),
        name: 'VINE',
        timestamp: dayData.time_period_start,
        date: dayData.time_period_start.split('T')[0],
        open: dayData.price_open,
        high: dayData.price_high,
        low: dayData.price_low,
        close: dayData.price_close,
        volume: dayData.volume_traded,
        marketCap: dayData.market_cap,
        source: 'CoinAPI',
        verified: true
      }));
    }
  },
  
  // 6. Nomics API
  {
    name: 'Nomics',
    priority: 6,
    timeout: 30000,
    headers: {
      'Accept': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    },
    buildUrl: (symbol: string, startDate: string, endDate: string) =>
      `https://api.nomics.com/v1/currencies/sparkline?key=demo-key&ids=${symbol}&start=${startDate}&end=${endDate}`,
    transform: (data: any, symbol: string, date: string): VINEHistoricalData[] => {
      if (!Array.isArray(data) || data.length === 0) return [];
      
      return data[0].prices.map((priceData: any) => ({
        symbol: symbol.toUpperCase(),
        name: 'VINE',
        timestamp: priceData.timestamp,
        date: priceData.timestamp.split('T')[0],
        open: priceData.price,
        high: priceData.price,
        low: priceData.price,
        close: priceData.price,
        volume: priceData.volume,
        marketCap: priceData.market_cap,
        source: 'Nomics',
        verified: true
      }));
    }
  },
  
  // 7. 币安API
  {
    name: 'Binance',
    priority: 7,
    timeout: 30000,
    headers: {
      'Accept': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    },
    buildUrl: (symbol: string, startDate: string, endDate: string) =>
      `https://api.binance.com/api/v3/klines?symbol=${symbol}USDT&interval=1d&startTime=${new Date(startDate).getTime()}&endTime=${new Date(endDate).getTime()}&limit=1000`,
    transform: (data: any, symbol: string, date: string): VINEHistoricalData[] => {
      if (!Array.isArray(data)) return [];
      
      return data.map((kline: any[]) => ({
        symbol: symbol.toUpperCase(),
        name: 'VINE',
        timestamp: new Date(kline[0]).toISOString(),
        date: new Date(kline[0]).toISOString().split('T')[0],
        open: parseFloat(kline[1]),
        high: parseFloat(kline[2]),
        low: parseFloat(kline[3]),
        close: parseFloat(kline[4]),
        volume: parseFloat(kline[5]),
        marketCap: 0,
        source: 'Binance',
        verified: true
      }));
    }
  },
  
  // 8. 欧易API
  {
    name: 'OKX',
    priority: 8,
    timeout: 30000,
    headers: {
      'Accept': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    },
    buildUrl: (symbol: string) =>
      `https://www.okx.com/api/v5/market/history-candles?instId=${symbol}-USDT-SWAP&bar=1D&limit=100`,
    transform: (data: any, symbol: string, date: string): VINEHistoricalData[] => {
      if (!data.data || !Array.isArray(data.data)) return [];
      
      return data.data.map((candle: string[]) => ({
        symbol: symbol.toUpperCase(),
        name: 'VINE',
        timestamp: new Date(parseInt(candle[0])).toISOString(),
        date: new Date(parseInt(candle[0])).toISOString().split('T')[0],
        open: parseFloat(candle[1]),
        high: parseFloat(candle[2]),
        low: parseFloat(candle[3]),
        close: parseFloat(candle[4]),
        volume: parseFloat(candle[5]),
        marketCap: 0,
        source: 'OKX',
        verified: true
      }));
    }
  },
  
  // 9. 火币API
  {
    name: 'Huobi',
    priority: 9,
    timeout: 30000,
    headers: {
      'Accept': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    },
    buildUrl: (symbol: string) =>
      `https://api.huobi.pro/market/history/kline?symbol=${symbol.toLowerCase()}usdt&period=1day&size=200`,
    transform: (data: any, symbol: string, date: string): VINEHistoricalData[] => {
      if (!data.data || !Array.isArray(data.data)) return [];
      
      return data.data.map((kline: any) => ({
        symbol: symbol.toUpperCase(),
        name: 'VINE',
        timestamp: new Date(kline.id * 1000).toISOString(),
        date: new Date(kline.id * 1000).toISOString().split('T')[0],
        open: kline.open,
        high: kline.high,
        low: kline.low,
        close: kline.close,
        volume: kline.vol,
        marketCap: 0,
        source: 'Huobi',
        verified: true
      }));
    }
  },
  
  // 10. 币印API
  {
    name: 'CoinEx',
    priority: 10,
    timeout: 30000,
    headers: {
      'Accept': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    },
    buildUrl: (symbol: string) =>
      `https://api.coinex.com/v1/market/kline?market=${symbol}USDT&type=1day&limit=100`,
    transform: (data: any, symbol: string, date: string): VINEHistoricalData[] => {
      if (!data.data || !Array.isArray(data.data)) return [];
      
      return data.data.map((kline: any) => ({
        symbol: symbol.toUpperCase(),
        name: 'VINE',
        timestamp: new Date(kline[0] * 1000).toISOString(),
        date: new Date(kline[0] * 1000).toISOString().split('T')[0],
        open: parseFloat(kline[1]),
        high: parseFloat(kline[2]),
        low: parseFloat(kline[3]),
        close: parseFloat(kline[4]),
        volume: parseFloat(kline[5]),
        marketCap: 0,
        source: 'CoinEx',
        verified: true
      }));
    }
  }
];

// 更新进度函数
function updateVINEProgress(step: string, progress: number, collectedDays: number, currentDate: string, status: VINEProgress['status'] = 'running') {
  vineProgress = {
    ...vineProgress,
    status,
    currentStep: step,
    progress,
    collectedDays,
    currentDate,
    endTime: status === 'completed' || status === 'failed' ? new Date() : undefined
  };
  
  console.log(`📊 [${progress.toFixed(1)}%] ${step} | 已采集: ${collectedDays}/${vineProgress.targetDays}天 | 当前日期: ${currentDate} | 状态: ${status}`);
}

// 获取VINE采集进度
export function getVINEProgress(): VINEProgress {
  return vineProgress;
}

// 重置VINE采集进度
export function resetVINEProgress() {
  vineProgress = {
    status: 'idle',
    currentStep: '准备就绪',
    progress: 0,
    collectedDays: 0,
    targetDays: 0,
    currentDate: '',
    startDate: '',
    endDate: ''
  };
  console.log('🔄 VINE采集进度已重置');
}

// 保存数据到文件
function saveVINEDataToFile(data: VINEHistoricalData[], symbol: string): void {
  const symbolDir = path.join(VINE_DIR, symbol.toLowerCase());
  if (!fs.existsSync(symbolDir)) {
    fs.mkdirSync(symbolDir, { recursive: true });
  }
  
  const filePath = path.join(symbolDir, 'historical_data.json');
  
  // 读取现有数据
  let existingData: VINEHistoricalData[] = [];
  if (fs.existsSync(filePath)) {
    try {
      const fileContent = fs.readFileSync(filePath, 'utf-8');
      existingData = JSON.parse(fileContent);
    } catch (error) {
      console.log(`❌ 读取现有数据失败: ${error}`);
    }
  }
  
  // 合并数据（去重）
  const existingDates = new Set(existingData.map(item => item.date));
  const newData = data.filter(item => !existingDates.has(item.date));
  
  const mergedData = [...existingData, ...newData];
  
  // 按日期排序
  mergedData.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  
  // 保存到文件
  fs.writeFileSync(filePath, JSON.stringify(mergedData, null, 2), 'utf-8');
  
  console.log(`💾 已保存 ${newData.length} 条新数据到 ${filePath}`);
}

// AI辅助数据验证和补充
import { validateBatchDataWithAI, enhanceDataWithAI } from './aiDataValidator';

async function validateAndEnhanceDataWithAI(data: VINEHistoricalData[]): Promise<VINEHistoricalData[]> {
  try {
    // 使用AI进行批量验证
    const validationResult = await validateBatchDataWithAI(data);
    
    // 对验证通过的数据进行AI增强
    const enhancedData = await Promise.all(
      validationResult.validData.map(async (item) => {
        try {
          const enhanced = await enhanceDataWithAI(item);
          return {
            ...item,
            ...enhanced,
            verified: true,
            aiEnhanced: true
          };
        } catch (error) {
          // AI增强失败，返回原始验证数据
          return {
            ...item,
            verified: true,
            aiEnhanced: false
          };
        }
      })
    );
    
    // 对验证失败的数据进行基础验证
    const basicValidatedData = validationResult.invalidData.map(item => ({
      ...item,
      verified: item.open > 0 && item.high >= item.low && item.close >= 0 && item.volume >= 0,
      aiEnhanced: false
    }));
    
    return [...enhancedData, ...basicValidatedData];
    
  } catch (error) {
    console.log('❌ AI验证失败，使用基础验证逻辑');
    
    // AI验证失败时使用基础验证
    return data.map(item => ({
      ...item,
      verified: item.open > 0 && item.high >= item.low && item.close >= 0 && item.volume >= 0,
      aiEnhanced: false
    }));
  }
}

// 主采集函数
export async function collectVINEHistoricalData(symbol: string = 'VINE'): Promise<{
  success: boolean;
  totalCollected: number;
  verifiedCount: number;
  error?: string;
}> {
  if (isVINECollectionRunning) {
    return { success: false, totalCollected: 0, verifiedCount: 0, error: 'VINE采集正在进行中' };
  }
  
  isVINECollectionRunning = true;
  vineProgress.startTime = new Date();
  
  try {
    // 确定采集日期范围（从币种创建日期到今天）
    const crypto = await db.select().from(cryptocurrencies).where(eq(cryptocurrencies.symbol, symbol)).limit(1);
    const startDate = crypto[0]?.createdAt ? new Date(crypto[0].createdAt).toISOString().split('T')[0] : '2013-01-01';
    const endDate = new Date().toISOString().split('T')[0];
    
    // 计算总天数
    const start = new Date(startDate);
    const end = new Date(endDate);
    const totalDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    
    vineProgress.targetDays = totalDays;
    vineProgress.startDate = startDate;
    vineProgress.endDate = endDate;
    
    updateVINEProgress('开始VINE历史数据采集...', 5, 0, startDate);
    
    let allCollectedData: VINEHistoricalData[] = [];
    let collectedDays = 0;
    
    // 按日期循环采集
    const currentDate = new Date(start);
    while (currentDate <= end) {
      const dateStr = currentDate.toISOString().split('T')[0];
      
      // 尝试从多个API源获取数据
      let dailyData: VINEHistoricalData[] = [];
      
      for (const source of VINE_DATA_SOURCES.sort((a, b) => a.priority - b.priority)) {
        try {
          updateVINEProgress(`从${source.name}采集数据...`, 
            Math.min(90, 5 + (collectedDays / totalDays) * 85), 
            collectedDays, dateStr);
          
          const response = await axios.get(source.buildUrl(symbol, startDate, dateStr), {
            timeout: source.timeout,
            headers: source.headers
          });
          
          const transformedData = source.transform(response.data, symbol, dateStr);
          dailyData = [...dailyData, ...transformedData];
          
          console.log(`✅ ${source.name}: 获取到${transformedData.length}条数据`);
          
          // 短暂延迟避免API限制
          await new Promise(resolve => setTimeout(resolve, 500));
          
        } catch (error: any) {
          console.log(`❌ ${source.name}采集失败: ${error.message}`);
        }
      }
      
      // 过滤出当前日期的数据
      const todayData = dailyData.filter(item => item.date === dateStr);
      
      if (todayData.length > 0) {
        // 数据验证和去重
        const verifiedData = await validateAndEnhanceDataWithAI(todayData);
        allCollectedData = [...allCollectedData, ...verifiedData];
        collectedDays++;
        
        // 每采集10天保存一次
        if (collectedDays % 10 === 0) {
          saveVINEDataToFile(allCollectedData, symbol);
        }
      }
      
      // 更新进度
      const progress = Math.min(95, 5 + (collectedDays / totalDays) * 90);
      updateVINEProgress(`采集进度`, progress, collectedDays, dateStr);
      
      // 移动到下一天
      currentDate.setDate(currentDate.getDate() + 1);
      
      // 每天采集后延迟1秒
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    // 最终保存
    saveVINEDataToFile(allCollectedData, symbol);
    
    // 统计验证数据
    const verifiedData = allCollectedData.filter(item => item.verified);
    
    updateVINEProgress('采集完成', 100, collectedDays, endDate, 'completed');
    
    const result = {
      success: true,
      totalCollected: allCollectedData.length,
      verifiedCount: verifiedData.length
    };
    
    vineProgress.results = result;
    
    console.log(`🎉 VINE历史数据采集完成！`);
    console.log(`📊 最终结果: 采集${allCollectedData.length}条数据，验证通过${verifiedData.length}条`);
    console.log(`⏱️ 耗时: ${Math.round((vineProgress.endTime!.getTime() - vineProgress.startTime!.getTime()) / 1000)} 秒`);
    
    return result;
    
  } catch (error: any) {
    console.error('❌ VINE历史数据采集失败:', error);
    updateVINEProgress('采集失败', 100, vineProgress.collectedDays, vineProgress.currentDate, 'failed');
    vineProgress.results = { success: false, totalCollected: 0, verifiedCount: 0, error: error.message };
    return { success: false, totalCollected: 0, verifiedCount: 0, error: error.message };
  } finally {
    isVINECollectionRunning = false;
  }
}

// 检查数据完整性并补充缺失数据
export async function checkAndRepairVINEData(symbol: string = 'VINE'): Promise<{
  success: boolean;
  repairedCount: number;
  missingDates: string[];
  error?: string;
}> {
  const symbolDir = path.join(VINE_DIR, symbol.toLowerCase());
  const filePath = path.join(symbolDir, 'historical_data.json');
  
  if (!fs.existsSync(filePath)) {
    return { success: false, repairedCount: 0, missingDates: [], error: '数据文件不存在' };
  }
  
  try {
    const fileContent = fs.readFileSync(filePath, 'utf-8');
    const existingData: VINEHistoricalData[] = JSON.parse(fileContent);
    
    // 找出缺失的日期
    const existingDates = new Set(existingData.map(item => item.date));
    const crypto = await db.select().from(cryptocurrencies).where(eq(cryptocurrencies.symbol, symbol)).limit(1);
    const startDate = crypto[0]?.createdAt ? new Date(crypto[0].createdAt).toISOString().split('T')[0] : '2013-01-01';
    const endDate = new Date().toISOString().split('T')[0];
    
    const start = new Date(startDate);
    const end = new Date(endDate);
    const missingDates: string[] = [];
    
    const currentDate = new Date(start);
    while (currentDate <= end) {
      const dateStr = currentDate.toISOString().split('T')[0];
      if (!existingDates.has(dateStr)) {
        missingDates.push(dateStr);
      }
      currentDate.setDate(currentDate.getDate() + 1);
    }
    
    if (missingDates.length === 0) {
      return { success: true, repairedCount: 0, missingDates: [] };
    }
    
    // 补充缺失数据
    let repairedCount = 0;
    for (const dateStr of missingDates) {
      try {
        // 尝试从API获取缺失数据
        for (const source of VINE_DATA_SOURCES.sort((a, b) => a.priority - b.priority)) {
          try {
            const response = await axios.get(source.buildUrl(symbol, dateStr, dateStr), {
              timeout: source.timeout,
              headers: source.headers
            });
            
            const transformedData = source.transform(response.data, symbol, dateStr);
            const todayData = transformedData.filter(item => item.date === dateStr);
            
            if (todayData.length > 0) {
              const verifiedData = await validateAndEnhanceDataWithAI(todayData);
              const newData = [...existingData, ...verifiedData];
              newData.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
              
              fs.writeFileSync(filePath, JSON.stringify(newData, null, 2), 'utf-8');
              repairedCount++;
              console.log(`✅ 补充缺失数据: ${dateStr}`);
              break;
            }
          } catch (error) {
            // 继续尝试下一个API源
            continue;
          }
        }
        
        // 延迟避免API限制
        await new Promise(resolve => setTimeout(resolve, 500));
        
      } catch (error) {
        console.log(`❌ 补充数据失败: ${dateStr}`);
      }
    }
    
    return { success: true, repairedCount, missingDates };
    
  } catch (error: any) {
    return { success: false, repairedCount: 0, missingDates: [], error: error.message };
  }
}

// 获取VINE采集进度
export function getVINEProgress(): VINEProgress {
  return vineProgress;
}

// 重置VINE采集进度
export function resetVINEProgress(): void {
  vineProgress = {
    status: 'idle',
    currentStep: '准备就绪',
    progress: 0,
    collectedDays: 0,
    targetDays: 0,
    currentDate: '',
    startDate: '',
    endDate: ''
  };
  isVINECollectionRunning = false;
}

// 检查并修复VINE数据
export async function checkAndRepairVINEData(symbol: string = 'VINE'): Promise<{
  success: boolean;
  repairedCount: number;
  totalCount: number;
  message: string;
}> {
  try {
    // 加载现有数据
    const existingData = loadDataFromFile(symbol);
    if (existingData.length === 0) {
      return {
        success: false,
        repairedCount: 0,
        totalCount: 0,
        message: '没有找到可修复的数据'
      };
    }

    // 更新进度
    vineProgress.status = 'running';
    vineProgress.currentStep = '检查并修复数据';
    vineProgress.progress = 10;

    console.log(`🔍 开始检查 ${symbol} 数据，共 ${existingData.length} 条记录`);

    let repairedCount = 0;
    const repairedData: VINEHistoricalData[] = [];

    // 检查每条数据的完整性
    for (let i = 0; i < existingData.length; i++) {
      const data = existingData[i];
      
      // 更新进度
      vineProgress.progress = 10 + Math.floor((i / existingData.length) * 80);
      vineProgress.currentStep = `检查数据 ${i + 1}/${existingData.length}`;

      // 检查数据完整性
      const isComplete = data.open && data.high && data.low && data.close && data.volume && data.date;
      const isReasonable = data.high >= data.low && data.open >= 0 && data.close >= 0;

      if (!isComplete || !isReasonable) {
        // 尝试从其他数据源修复
        try {
          const repaired = await repairDataFromMultipleSources(symbol, data.date);
          if (repaired) {
            repairedData.push(repaired);
            repairedCount++;
            console.log(`✅ 修复 ${symbol} ${data.date} 的数据`);
          } else {
            // 保留原始数据但标记为未验证
            repairedData.push({
              ...data,
              verified: false,
              source: `${data.source} (修复失败)`
            });
          }
        } catch (error) {
          // 修复失败，保留原始数据
          repairedData.push({
            ...data,
            verified: false,
            source: `${data.source} (修复失败)`
          });
        }
      } else {
        // 数据完整且合理，保留
        repairedData.push(data);
      }
    }

    // 保存修复后的数据
    saveDataToFile(symbol, repairedData);

    // 更新进度
    vineProgress.status = 'completed';
    vineProgress.progress = 100;
    vineProgress.currentStep = '数据修复完成';
    vineProgress.results = {
      success: true,
      totalCollected: repairedData.length,
      verifiedCount: repairedData.filter(d => d.verified).length
    };

    console.log(`✅ ${symbol} 数据修复完成: 修复了 ${repairedCount} 条记录`);

    return {
      success: true,
      repairedCount,
      totalCount: existingData.length,
      message: `成功修复了 ${repairedCount} 条记录`
    };

  } catch (error: any) {
    vineProgress.status = 'failed';
    vineProgress.currentStep = '数据修复失败';
    vineProgress.results = {
      success: false,
      totalCollected: 0,
      verifiedCount: 0,
      error: error.message
    };

    return {
      success: false,
      repairedCount: 0,
      totalCount: 0,
      message: error.message
    };
  }
}

// 从多个数据源修复数据
async function repairDataFromMultipleSources(symbol: string, date: string): Promise<VINEHistoricalData | null> {
  const dataFromSources: VINEHistoricalData[] = [];

  // 尝试从不同的数据源获取数据
  for (const source of VINE_DATA_SOURCES) {
    try {
      const url = source.buildUrl(symbol, date, date);
      const response = await axios.get(url, {
        timeout: source.timeout,
        headers: source.headers
      });

      const transformedData = source.transform(response.data, symbol, date);
      if (transformedData && transformedData.length > 0) {
        dataFromSources.push(...transformedData.map(d => ({
          ...d,
          source: source.name
        })));
      }
    } catch (error) {
      // 单个数据源失败，继续尝试其他数据源
      continue;
    }
  }

  if (dataFromSources.length === 0) {
    return null;
  }

  // 使用AI进行多源数据对比和验证
  try {
    const { compareMultipleSourcesWithAI } = await import('./aiDataValidator');
    const comparisonResult = await compareMultipleSourcesWithAI(dataFromSources);
    
    if (comparisonResult.consensusData && comparisonResult.confidence > 0.7) {
      return {
        ...comparisonResult.consensusData,
        verified: true,
        aiEnhanced: true,
        source: '多源修复 + AI验证'
      };
    }
  } catch (error) {
    // AI验证失败，使用简单逻辑
    console.log('❌ AI验证失败，使用简单修复逻辑');
  }

  // 简单修复逻辑：选择第一个有效数据源
  const validData = dataFromSources.filter(d => 
    d.open && d.high && d.low && d.close && d.volume && d.high >= d.low
  );

  if (validData.length > 0) {
    return {
      ...validData[0],
      verified: true,
      source: `${validData[0].source} (修复)`
    };
  }

  return null;
}

// 获取VINE采集进度
export function getVINEProgress(): VINEProgress {
  return vineProgress;
}

// 重置VINE采集进度
export function resetVINEProgress(): void {
  vineProgress = {
    status: 'idle',
    currentStep: '准备就绪',
    progress: 0,
    collectedDays: 0,
    targetDays: 0,
    currentDate: '',
    startDate: '',
    endDate: ''
  };
  isVINECollectionRunning = false;
}

// 检查并修复VINE数据
export async function checkAndRepairVINEData(symbol: string = 'VINE'): Promise<{
  success: boolean;
  repairedCount: number;
  totalCount: number;
  message: string;
}> {
  try {
    // 加载现有数据
    const existingData = loadDataFromFile(symbol);
    if (existingData.length === 0) {
      return {
        success: false,
        repairedCount: 0,
        totalCount: 0,
        message: '没有找到可修复的数据'
      };
    }

    // 更新进度
    vineProgress.status = 'running';
    vineProgress.currentStep = '检查并修复数据';
    vineProgress.progress = 10;

    console.log(`🔍 开始检查 ${symbol} 数据，共 ${existingData.length} 条记录`);

    let repairedCount = 0;
    const repairedData: VINEHistoricalData[] = [];

    // 检查每条数据的完整性
    for (let i = 0; i < existingData.length; i++) {
      const data = existingData[i];
      
      // 更新进度
      vineProgress.progress = 10 + Math.floor((i / existingData.length) * 80);
      vineProgress.currentStep = `检查数据 ${i + 1}/${existingData.length}`;

      // 检查数据完整性
      const isComplete = data.open && data.high && data.low && data.close && data.volume && data.date;
      const isReasonable = data.high >= data.low && data.open >= 0 && data.close >= 0;

      if (!isComplete || !isReasonable) {
        // 尝试从其他数据源修复
        try {
          const repaired = await repairDataFromMultipleSources(symbol, data.date);
          if (repaired) {
            repairedData.push(repaired);
            repairedCount++;
            console.log(`✅ 修复 ${symbol} ${data.date} 的数据`);
          } else {
            // 保留原始数据但标记为未验证
            repairedData.push({
              ...data,
              verified: false,
              source: `${data.source} (修复失败)`
            });
          }
        } catch (error) {
          // 修复失败，保留原始数据
          repairedData.push({
            ...data,
            verified: false,
            source: `${data.source} (修复失败)`
          });
        }
      } else {
        // 数据完整且合理，保留
        repairedData.push(data);
      }
    }

    // 保存修复后的数据
    saveDataToFile(symbol, repairedData);

    // 更新进度
    vineProgress.status = 'completed';
    vineProgress.progress = 100;
    vineProgress.currentStep = '数据修复完成';
    vineProgress.results = {
      success: true,
      totalCollected: repairedData.length,
      verifiedCount: repairedData.filter(d => d.verified).length
    };

    console.log(`✅ ${symbol} 数据修复完成: 修复了 ${repairedCount} 条记录`);

    return {
      success: true,
      repairedCount,
      totalCount: existingData.length,
      message: `成功修复了 ${repairedCount} 条记录`
    };

  } catch (error: any) {
    vineProgress.status = 'failed';
    vineProgress.currentStep = '数据修复失败';
    vineProgress.results = {
      success: false,
      totalCollected: 0,
      verifiedCount: 0,
      error: error.message
    };

    return {
      success: false,
      repairedCount: 0,
      totalCount: 0,
      message: error.message
    };
  }
}

// 从多个数据源修复数据
async function repairDataFromMultipleSources(symbol: string, date: string): Promise<VINEHistoricalData | null> {
  const dataFromSources: VINEHistoricalData[] = [];

  // 尝试从不同的数据源获取数据
  for (const source of VINE_DATA_SOURCES) {
    try {
      const url = source.buildUrl(symbol, date, date);
      const response = await axios.get(url, {
        timeout: source.timeout,
        headers: source.headers
      });

      const transformedData = source.transform(response.data, symbol, date);
      if (transformedData && transformedData.length > 0) {
        dataFromSources.push(...transformedData.map(d => ({
          ...d,
          source: source.name
        })));
      }
    } catch (error) {
      // 单个数据源失败，继续尝试其他数据源
      continue;
    }
  }

  if (dataFromSources.length === 0) {
    return null;
  }

  // 使用AI进行多源数据对比和验证
  try {
    const { compareMultipleSourcesWithAI } = await import('./aiDataValidator');
    const comparisonResult = await compareMultipleSourcesWithAI(dataFromSources);
    
    if (comparisonResult.consensusData && comparisonResult.confidence > 0.7) {
      return {
        ...comparisonResult.consensusData,
        verified: true,
        aiEnhanced: true,
        source: '多源修复 + AI验证'
      };
    }
  } catch (error) {
    // AI验证失败，使用简单逻辑
    console.log('❌ AI验证失败，使用简单修复逻辑');
  }

  // 简单修复逻辑：选择第一个有效数据源
  const validData = dataFromSources.filter(d => 
    d.open && d.high && d.low && d.close && d.volume && d.high >= d.low
  );

  if (validData.length > 0) {
    return {
      ...validData[0],
      verified: true,
      source: `${validData[0].source} (修复)`
    };
  }

  return null;
}