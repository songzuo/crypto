/**
 * 技术分析服务
 * 基于交易量市值比率、RSI、MACD和EMA提供买卖推荐
 */

import axios from 'axios';
import { db } from '../db';
import { eq, desc, and, gte, or, sql } from 'drizzle-orm';
import { 
  insertTechnicalAnalysisBatchSchema,
  technicalAnalysisBatches,
  technicalAnalysisEntries,
  insertTechnicalAnalysisEntrySchema,
  volumeToMarketCapRatios,
  volumeToMarketCapBatches,
  cryptocurrencies
} from '@shared/schema';

// 技术指标计算
interface PriceData {
  timestamp: number; // Unix timestamp in milliseconds
  close: number;
  high?: number;
  low?: number;
  open?: number;
  volume?: number;
}

interface TechnicalData {
  volumeToMarketCapRatio?: number;
  rsi?: number;
  previousRSI?: number; // 添加前一个周期的RSI值
  macd?: {
    macdLine: number;
    signalLine: number;
    histogram: number;
  };
  previousMacd?: {
    macdLine: number;
    signalLine: number;
    histogram: number;
  };
  shortEma?: number;
  longEma?: number;
  previousShortEma?: number;
  previousLongEma?: number;
}

interface SignalData {
  volumeRatioSignal: 'buy' | 'sell' | 'neutral';
  rsiSignal: 'buy' | 'sell' | 'neutral';
  macdSignal: 'buy' | 'sell' | 'neutral';
  emaSignal: 'buy' | 'sell' | 'neutral';
  combinedSignal: 'strong_buy' | 'buy' | 'neutral' | 'sell' | 'strong_sell';
  signalStrength: number; // 1-5
  recommendationType: 'day_trade' | 'swing_trade' | 'position';
}

// 配置常量
const RSI_PERIOD = 14;
const RSI_OVERSOLD = 30;
const RSI_OVERBOUGHT = 70;
const MACD_FAST_PERIOD = 8;  // 从12减少到8，提高对价格变动的敏感度
const MACD_SLOW_PERIOD = 17; // 从26减少到17，提高对价格变动的敏感度
const MACD_SIGNAL_PERIOD = 9;
const SHORT_EMA_PERIOD = 5;  // 从9减少到5，提高对价格变动的敏感度
const LONG_EMA_PERIOD = 13;  // 从21减少到13，提高对价格变动的敏感度

// 配置各API接口密钥
const ALPHA_VANTAGE_KEY = process.env.ALPHA_VANTAGE_API_KEY;
const TIINGO_API_KEY = process.env.TIINGO_API_KEY;
const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY;
const COINMARKETCAP_API_KEY = process.env.COINMARKETCAP_API_KEY;
const CRYPTOCOMPARE_API_KEY = process.env.CRYPTOCOMPARE_API_KEY;
const COINAPI_KEY = process.env.COINAPI_KEY;
const COINLAYER_API_KEY = process.env.COINLAYER_API_KEY;

// 计算RSI
function calculateRSI(prices: number[], period: number = RSI_PERIOD): number {
  if (prices.length < period + 1) {
    throw new Error(`计算RSI需要至少${period + 1}个数据点`);
  }
  
  let gains = 0;
  let losses = 0;
  
  // 计算初始平均涨跌幅
  for (let i = 1; i <= period; i++) {
    const change = prices[i-1] - prices[i];
    if (change >= 0) {
      gains += change;
    } else {
      losses -= change;
    }
  }
  
  let avgGain = gains / period;
  let avgLoss = losses / period;
  
  // 计算后续平均涨跌幅和RSI
  for (let i = period + 1; i < prices.length; i++) {
    const change = prices[i-1] - prices[i];
    if (change >= 0) {
      avgGain = (avgGain * (period - 1) + change) / period;
      avgLoss = (avgLoss * (period - 1)) / period;
    } else {
      avgGain = (avgGain * (period - 1)) / period;
      avgLoss = (avgLoss * (period - 1) - change) / period;
    }
  }
  
  // 计算相对强度
  if (avgLoss === 0) {
    return 100; // 防止除以零
  }
  
  const RS = avgGain / avgLoss;
  const RSI = 100 - (100 / (1 + RS));
  
  return parseFloat(RSI.toFixed(2));
}

// 计算EMA
function calculateEMA(prices: number[], period: number): number {
  if (prices.length < period) {
    throw new Error(`计算EMA需要至少${period}个数据点`);
  }
  
  const multiplier = 2 / (period + 1);
  let ema = prices.slice(0, period).reduce((a, b) => a + b, 0) / period;
  
  for (let i = period; i < prices.length; i++) {
    ema = (prices[i] - ema) * multiplier + ema;
  }
  
  return parseFloat(ema.toFixed(2));
}

// 计算MACD
function calculateMACD(prices: number[], fastPeriod: number = MACD_FAST_PERIOD, slowPeriod: number = MACD_SLOW_PERIOD, signalPeriod: number = MACD_SIGNAL_PERIOD) {
  if (prices.length < slowPeriod + signalPeriod) {
    throw new Error(`计算MACD需要至少${slowPeriod + signalPeriod}个数据点`);
  }
  
  // 计算快速和慢速EMA
  const fastEMA = calculateEMA(prices, fastPeriod);
  const slowEMA = calculateEMA(prices, slowPeriod);
  
  // MACD线是快速EMA减去慢速EMA
  const macdLine = fastEMA - slowEMA;
  
  // 创建MACD历史值数组用于计算信号线
  const macdLineHistory = [];
  
  // 计算MACD历史值
  for (let i = prices.length - (slowPeriod + signalPeriod); i < prices.length; i++) {
    const slice = prices.slice(0, i + 1);
    const fastEMA = calculateEMA(slice, fastPeriod);
    const slowEMA = calculateEMA(slice, slowPeriod);
    macdLineHistory.push(fastEMA - slowEMA);
  }
  
  // 信号线是MACD线的EMA
  const signalLine = calculateEMA(macdLineHistory, signalPeriod);
  
  // 柱状图是MACD线与信号线之差
  const histogram = macdLine - signalLine;
  
  return {
    macdLine: parseFloat(macdLine.toFixed(4)),
    signalLine: parseFloat(signalLine.toFixed(4)),
    histogram: parseFloat(histogram.toFixed(4))
  };
}

// 从多个数据源获取历史价格数据
async function fetchHistoricalPrices(symbol: string, timeframe: string = '1h', limit: number = 100): Promise<PriceData[]> {
  // 添加随机延迟，防止所有请求同时发出
  const addRandomDelay = async () => {
    const delay = Math.floor(Math.random() * 500) + 100; // 100-600ms的随机延迟
    await new Promise(resolve => setTimeout(resolve, delay));
  };

  // 使用所有可用的数据源尝试获取价格或直接获取技术指标
  async function tryAllDataSources(): Promise<PriceData[]> {
    // 尝试直接从Alpha Vantage获取技术指标
    try {
      console.log(`尝试直接从Alpha Vantage获取${symbol}的技术指标...`);
      const indicators = await fetchIndicatorsDirectly(symbol, timeframe);
      if (indicators && indicators.length > 0) {
        console.log(`成功直接获取${symbol}的技术指标，为了保持一致性将转换为价格数据格式`);
        // 如果成功获取了指标，转换为PriceData格式
        return indicators.map(indicator => ({
          timestamp: indicator.timestamp,
          close: indicator.close || 0,
          // 为保持一致性添加其他必要字段
          high: indicator.close || 0,
          low: indicator.close || 0,
          open: indicator.close || 0,
          // 附加技术指标字段，这些将在后续处理中被利用
          rsi: indicator.rsi,
          macd: indicator.macd,
          ema: indicator.ema
        }));
      }
    } catch (e) {
      console.warn(`直接获取${symbol}技术指标失败:`, e);
      // 如果直接获取指标失败，继续尝试获取价格数据
    }
    
    // 传统方法：先获取价格，再计算指标
    const dataSources = [
      fetchFromAlphaVantage,
      fetchFromTiingo,
      fetchFromFinnhub,
      fetchFromCoinMarketCap,
      fetchFromCryptoCompare,
      fetchFromCoinAPI,
      fetchFromCoinLayer
    ];
    
    // 打乱数据源顺序，避免总是使用同一顺序
    const shuffledSources = [...dataSources].sort(() => Math.random() - 0.5);
    
    for (const source of shuffledSources) {
      try {
        await addRandomDelay(); // 在请求之前添加随机延迟
        const prices = await source(symbol, timeframe, limit);
        if (prices && prices.length > 0) {
          return prices;
        }
      } catch (e) {
        console.warn(`使用${source.name}获取${symbol}价格失败:`, e);
        // 继续尝试下一个数据源
      }
    }
    
    throw new Error(`无法从所有数据源获取${symbol}的价格历史数据`);
  }
  
  // 新增: 直接从Alpha Vantage获取技术指标
  interface TechnicalIndicator {
    timestamp: number;
    close?: number;
    rsi?: number;
    macd?: { 
      macdLine: number; 
      signalLine: number; 
      histogram: number;
    };
    ema?: number;
  }
  
  async function fetchIndicatorsDirectly(symbol: string, timeframe: string): Promise<TechnicalIndicator[]> {
    if (!ALPHA_VANTAGE_KEY) {
      throw new Error('Alpha Vantage API key is not configured');
    }
    
    // 格式化符号，移除"-USD"后缀，如"BTC-USD" -> "BTC"
    const formattedSymbol = symbol.replace('-USD', '');
    
    // 设置时间间隔参数
    const interval = timeframe === '1d' ? 'daily' : 
                    timeframe === '1h' ? '60min' : 
                    timeframe === '30m' ? '30min' : 
                    timeframe === '15m' ? '15min' : 
                    timeframe === '5m' ? '5min' : '60min';
                    
    // 使用RSI、MACD和EMA三个不同的调用
    const results: TechnicalIndicator[] = [];
    
    try {
      // 获取RSI
      const rsiUrl = `https://www.alphavantage.co/query?function=RSI&symbol=${formattedSymbol}&interval=${interval}&time_period=14&series_type=close&apikey=${ALPHA_VANTAGE_KEY}`;
      const rsiResponse = await axios.get(rsiUrl, { timeout: 5000 });
      
      if (rsiResponse.data && rsiResponse.data['Technical Analysis: RSI']) {
        const rsiData = rsiResponse.data['Technical Analysis: RSI'];
        
        for (const [dateStr, values] of Object.entries(rsiData)) {
          const timestamp = new Date(dateStr).getTime();
          const existingEntry = results.find(r => r.timestamp === timestamp);
          
          if (existingEntry) {
            existingEntry.rsi = parseFloat((values as any).RSI);
          } else {
            results.push({
              timestamp,
              rsi: parseFloat((values as any).RSI)
            });
          }
        }
      }
      
      // 获取MACD
      const macdUrl = `https://www.alphavantage.co/query?function=MACD&symbol=${formattedSymbol}&interval=${interval}&series_type=close&apikey=${ALPHA_VANTAGE_KEY}`;
      const macdResponse = await axios.get(macdUrl, { timeout: 5000 });
      
      if (macdResponse.data && macdResponse.data['Technical Analysis: MACD']) {
        const macdData = macdResponse.data['Technical Analysis: MACD'];
        
        for (const [dateStr, values] of Object.entries(macdData)) {
          const timestamp = new Date(dateStr).getTime();
          const existingEntry = results.find(r => r.timestamp === timestamp);
          
          if (existingEntry) {
            existingEntry.macd = {
              macdLine: parseFloat((values as any).MACD),
              signalLine: parseFloat((values as any).MACD_Signal),
              histogram: parseFloat((values as any).MACD_Hist)
            };
          } else {
            results.push({
              timestamp,
              macd: {
                macdLine: parseFloat((values as any).MACD),
                signalLine: parseFloat((values as any).MACD_Signal),
                histogram: parseFloat((values as any).MACD_Hist)
              }
            });
          }
        }
      }
      
      // 获取EMA
      const emaUrl = `https://www.alphavantage.co/query?function=EMA&symbol=${formattedSymbol}&interval=${interval}&time_period=9&series_type=close&apikey=${ALPHA_VANTAGE_KEY}`;
      const emaResponse = await axios.get(emaUrl, { timeout: 5000 });
      
      if (emaResponse.data && emaResponse.data['Technical Analysis: EMA']) {
        const emaData = emaResponse.data['Technical Analysis: EMA'];
        
        for (const [dateStr, values] of Object.entries(emaData)) {
          const timestamp = new Date(dateStr).getTime();
          const existingEntry = results.find(r => r.timestamp === timestamp);
          
          if (existingEntry) {
            existingEntry.ema = parseFloat((values as any).EMA);
          } else {
            results.push({
              timestamp,
              ema: parseFloat((values as any).EMA)
            });
          }
        }
      }
      
      // 获取价格数据以附加到指标上
      try {
        const priceUrl = `https://www.alphavantage.co/query?function=CRYPTO_INTRADAY&symbol=${formattedSymbol}&market=USD&interval=${interval}&apikey=${ALPHA_VANTAGE_KEY}`;
        const priceResponse = await axios.get(priceUrl, { timeout: 5000 });
        
        if (priceResponse.data && priceResponse.data['Time Series Crypto (60min)']) {
          const priceData = priceResponse.data['Time Series Crypto (60min)'];
          
          for (const [dateStr, values] of Object.entries(priceData)) {
            const timestamp = new Date(dateStr).getTime();
            const existingEntry = results.find(r => r.timestamp === timestamp);
            
            if (existingEntry) {
              existingEntry.close = parseFloat((values as any)['4. close']);
            }
          }
        }
      } catch (e) {
        console.warn(`获取价格数据失败:`, e);
        // 价格数据不是必须的，所以继续处理
      }
      
      // 仅返回同时具有rsi、macd和ema的条目
      const completeResults = results.filter(r => r.rsi && r.macd && r.ema);
      
      if (completeResults.length > 0) {
        console.log(`成功直接获取${completeResults.length}个完整的技术指标数据点`);
        return completeResults;
      } else {
        throw new Error('无法获取足够的完整技术指标数据点');
      }
    } catch (e) {
      console.error(`直接获取技术指标失败:`, e);
      throw e;
    }
  }
  
  // 直接从Alpha Vantage获取RSI技术指标
async function fetchRSIFromAlphaVantage(symbol: string, timeframe: string): Promise<number | null> {
  if (!ALPHA_VANTAGE_KEY) {
    console.warn('Alpha Vantage API key not configured');
    return null;
  }
  
  try {
    // 格式化参数
    const formattedSymbol = symbol.replace('-USD', '');
    const interval = timeframeToAlphaVantageInterval(timeframe);
    
    // 构建API URL - 使用专门的RSI端点
    const url = `https://www.alphavantage.co/query?function=RSI&symbol=${formattedSymbol}&interval=${interval}&time_period=14&series_type=close&apikey=${ALPHA_VANTAGE_KEY}`;
    
    console.log(`请求Alpha Vantage RSI数据: ${formattedSymbol}`);
    
    const response = await axios.get(url, { timeout: 10000 });
    const data = response.data;
    
    if (data && data['Technical Analysis: RSI']) {
      const rsiData = data['Technical Analysis: RSI'];
      const dates = Object.keys(rsiData).sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
      
      if (dates.length > 0) {
        const latestDate = dates[0];
        const rsiValue = parseFloat(rsiData[latestDate]['RSI']);
        console.log(`成功从Alpha Vantage获取${symbol}的RSI指标: ${rsiValue}`);
        return rsiValue;
      }
    } else if (data && data['Note'] && data['Note'].includes('call frequency')) {
      // API频率限制处理
      console.warn(`Alpha Vantage API频率限制: ${data['Note']}`);
      // 随机延迟1-3秒后可以重试
      await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 2000));
      return null;
    }
    
    console.warn(`从Alpha Vantage获取RSI数据失败:`, data);
    return null;
  } catch (error) {
    console.error(`从Alpha Vantage获取RSI指标时出错:`, error);
    return null;
  }
}

// 直接从Alpha Vantage获取MACD技术指标
async function fetchMACDFromAlphaVantage(symbol: string, timeframe: string): Promise<{
  macdLine: number,
  signalLine: number,
  histogram: number
} | null> {
  if (!ALPHA_VANTAGE_KEY) {
    console.warn('Alpha Vantage API key not configured');
    return null;
  }
  
  try {
    // 格式化参数
    const formattedSymbol = symbol.replace('-USD', '');
    const interval = timeframeToAlphaVantageInterval(timeframe);
    
    // 构建API URL - 使用专门的MACD端点
    const url = `https://www.alphavantage.co/query?function=MACD&symbol=${formattedSymbol}&interval=${interval}&series_type=close&fastperiod=12&slowperiod=26&signalperiod=9&apikey=${ALPHA_VANTAGE_KEY}`;
    
    console.log(`请求Alpha Vantage MACD数据: ${formattedSymbol}`);
    
    const response = await axios.get(url, { timeout: 10000 });
    const data = response.data;
    
    if (data && data['Technical Analysis: MACD']) {
      const macdData = data['Technical Analysis: MACD'];
      const dates = Object.keys(macdData).sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
      
      if (dates.length > 0) {
        const latestDate = dates[0];
        const macdLine = parseFloat(macdData[latestDate]['MACD']);
        const signalLine = parseFloat(macdData[latestDate]['MACD_Signal']);
        const histogram = parseFloat(macdData[latestDate]['MACD_Hist']);
        
        console.log(`成功从Alpha Vantage获取${symbol}的MACD指标: MACD=${macdLine}, Signal=${signalLine}, Hist=${histogram}`);
        
        // 返回当前MACD值，并单独存储前一个数据点，用于金叉/死叉检测
        const result = { 
          macdLine, 
          signalLine, 
          histogram 
        };
        
        // 如果有前一个周期数据，保存在technicalData.previousMacd中
        if (dates.length > 1) {
          const previousDate = dates[1];
          const previousMacdLine = parseFloat(macdData[previousDate]['MACD']);
          const previousSignalLine = parseFloat(macdData[previousDate]['MACD_Signal']);
          const previousHistogram = parseFloat(macdData[previousDate]['MACD_Hist']);
          
          // 在调用函数内部单独设置previousMacd
          result.previousMacd = {
            macdLine: previousMacdLine,
            signalLine: previousSignalLine,
            histogram: previousHistogram
          };
        }
        
        return result;
      }
    } else if (data && data['Note'] && data['Note'].includes('call frequency')) {
      // API频率限制处理
      console.warn(`Alpha Vantage API频率限制: ${data['Note']}`);
      await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 2000));
      return null;
    }
    
    console.warn(`从Alpha Vantage获取MACD数据失败:`, data);
    return null;
  } catch (error) {
    console.error(`从Alpha Vantage获取MACD指标时出错:`, error);
    return null;
  }
}

// 直接从Alpha Vantage获取EMA技术指标
async function fetchEMAFromAlphaVantage(symbol: string, timeframe: string): Promise<{
  shortEma: number,
  longEma: number,
  previousShortEma?: number,
  previousLongEma?: number
} | null> {
  if (!ALPHA_VANTAGE_KEY) {
    console.warn('Alpha Vantage API key not configured');
    return null;
  }
  
  try {
    // 格式化参数
    const formattedSymbol = symbol.replace('-USD', '');
    const interval = timeframeToAlphaVantageInterval(timeframe);
    
    // 获取短期EMA (9)
    const shortEmaUrl = `https://www.alphavantage.co/query?function=EMA&symbol=${formattedSymbol}&interval=${interval}&time_period=${SHORT_EMA_PERIOD}&series_type=close&apikey=${ALPHA_VANTAGE_KEY}`;
    console.log(`请求Alpha Vantage 短期EMA数据: ${formattedSymbol}`);
    const shortEmaResponse = await axios.get(shortEmaUrl, { timeout: 10000 });
    
    // 避免API频率限制
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // 获取长期EMA (21)
    const longEmaUrl = `https://www.alphavantage.co/query?function=EMA&symbol=${formattedSymbol}&interval=${interval}&time_period=${LONG_EMA_PERIOD}&series_type=close&apikey=${ALPHA_VANTAGE_KEY}`;
    console.log(`请求Alpha Vantage 长期EMA数据: ${formattedSymbol}`);
    const longEmaResponse = await axios.get(longEmaUrl, { timeout: 10000 });
    
    const shortEmaData = shortEmaResponse.data;
    const longEmaData = longEmaResponse.data;
    
    // 检查API限制
    if ((shortEmaData && shortEmaData['Note'] && shortEmaData['Note'].includes('call frequency')) ||
        (longEmaData && longEmaData['Note'] && longEmaData['Note'].includes('call frequency'))) {
      console.warn(`Alpha Vantage API频率限制`);
      await new Promise(resolve => setTimeout(resolve, 2000 + Math.random() * 3000));
      return null;
    }
    
    // 处理数据
    if (shortEmaData['Technical Analysis: EMA'] && longEmaData['Technical Analysis: EMA']) {
      const shortEmaValues = shortEmaData['Technical Analysis: EMA'];
      const longEmaValues = longEmaData['Technical Analysis: EMA'];
      
      const shortDates = Object.keys(shortEmaValues).sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
      const longDates = Object.keys(longEmaValues).sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
      
      if (shortDates.length > 0 && longDates.length > 0) {
        const latestShortDate = shortDates[0];
        const latestLongDate = longDates[0];
        
        const shortEma = parseFloat(shortEmaValues[latestShortDate]['EMA']);
        const longEma = parseFloat(longEmaValues[latestLongDate]['EMA']);
        
        console.log(`成功从Alpha Vantage获取${symbol}的EMA指标: 短期EMA(${SHORT_EMA_PERIOD})=${shortEma}, 长期EMA(${LONG_EMA_PERIOD})=${longEma}`);
        
        const result: any = {
          shortEma,
          longEma
        };
        
        // 如果有前一天的数据，用于检测金叉/死叉
        if (shortDates.length > 1 && longDates.length > 1) {
          const previousShortDate = shortDates[1];
          const previousLongDate = longDates[1];
          
          result.previousShortEma = parseFloat(shortEmaValues[previousShortDate]['EMA']);
          result.previousLongEma = parseFloat(longEmaValues[previousLongDate]['EMA']);
        }
        
        return result;
      }
    }
    
    console.warn(`从Alpha Vantage获取EMA数据失败:`, shortEmaData, longEmaData);
    return null;
  } catch (error) {
    console.error(`从Alpha Vantage获取EMA指标时出错:`, error);
    return null;
  }
}

// 从Finnhub获取技术指标集合
async function fetchTechnicalIndicatorsFromFinnhub(symbol: string, timeframe: string): Promise<TechnicalData | null> {
  if (!FINNHUB_API_KEY) {
    console.warn('Finnhub API key not configured');
    return null;
  }
  
  try {
    // 格式化参数
    const formattedSymbol = symbol.replace('-USD', '');
    const resolution = timeframeToFinnhubResolution(timeframe);
    
    // 计算时间范围（30天数据）
    const to = Math.floor(Date.now() / 1000);
    const from = to - 30 * 24 * 60 * 60; // 30天前
    
    // 获取RSI
    const rsiUrl = `https://finnhub.io/api/v1/indicator?symbol=${formattedSymbol}&resolution=${resolution}&from=${from}&to=${to}&indicator=rsi&timeperiod=14&token=${FINNHUB_API_KEY}`;
    console.log(`请求Finnhub RSI数据: ${formattedSymbol}`);
    const rsiResponse = await axios.get(rsiUrl, { timeout: 10000 });
    
    // 避免API频率限制
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // 获取MACD
    const macdUrl = `https://finnhub.io/api/v1/indicator?symbol=${formattedSymbol}&resolution=${resolution}&from=${from}&to=${to}&indicator=macd&token=${FINNHUB_API_KEY}`;
    console.log(`请求Finnhub MACD数据: ${formattedSymbol}`);
    const macdResponse = await axios.get(macdUrl, { timeout: 10000 });
    
    // 避免API频率限制
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // 获取EMA短期
    const shortEmaUrl = `https://finnhub.io/api/v1/indicator?symbol=${formattedSymbol}&resolution=${resolution}&from=${from}&to=${to}&indicator=ema&timeperiod=${SHORT_EMA_PERIOD}&token=${FINNHUB_API_KEY}`;
    console.log(`请求Finnhub 短期EMA数据: ${formattedSymbol}`);
    const shortEmaResponse = await axios.get(shortEmaUrl, { timeout: 10000 });
    
    // 避免API频率限制
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // 获取EMA长期
    const longEmaUrl = `https://finnhub.io/api/v1/indicator?symbol=${formattedSymbol}&resolution=${resolution}&from=${from}&to=${to}&indicator=ema&timeperiod=${LONG_EMA_PERIOD}&token=${FINNHUB_API_KEY}`;
    console.log(`请求Finnhub 长期EMA数据: ${formattedSymbol}`);
    const longEmaResponse = await axios.get(longEmaUrl, { timeout: 10000 });
    
    // 处理RSI数据
    const rsiData = rsiResponse.data;
    const rsi = rsiData && rsiData.rsi && rsiData.rsi.length > 0 ? rsiData.rsi[rsiData.rsi.length - 1] : null;
    
    // 处理MACD数据
    const macdData = macdResponse.data;
    let macd = null;
    let previousMacd = null;
    
    if (macdData && macdData.macd && macdData.macdSignal && macdData.macdHist) {
      const length = macdData.macd.length;
      if (length > 0) {
        macd = {
          macdLine: macdData.macd[length - 1],
          signalLine: macdData.macdSignal[length - 1],
          histogram: macdData.macdHist[length - 1]
        };
        
        if (length > 1) {
          previousMacd = {
            macdLine: macdData.macd[length - 2],
            signalLine: macdData.macdSignal[length - 2],
            histogram: macdData.macdHist[length - 2]
          };
        }
      }
    }
    
    // 处理EMA数据
    const shortEmaData = shortEmaResponse.data;
    const longEmaData = longEmaResponse.data;
    let shortEma = null;
    let longEma = null;
    let previousShortEma = null;
    let previousLongEma = null;
    
    if (shortEmaData && shortEmaData.ema && longEmaData && longEmaData.ema) {
      const shortLength = shortEmaData.ema.length;
      const longLength = longEmaData.ema.length;
      
      if (shortLength > 0 && longLength > 0) {
        shortEma = shortEmaData.ema[shortLength - 1];
        longEma = longEmaData.ema[longLength - 1];
        
        if (shortLength > 1 && longLength > 1) {
          previousShortEma = shortEmaData.ema[shortLength - 2];
          previousLongEma = longEmaData.ema[longLength - 2];
        }
      }
    }
    
    // 整合结果
    const result: TechnicalData = {};
    
    if (rsi !== null) {
      result.rsi = rsi;
      console.log(`Finnhub ${symbol} RSI: ${rsi}`);
    }
    
    if (macd !== null) {
      result.macd = macd;
      console.log(`Finnhub ${symbol} MACD: ${macd.macdLine}, Signal: ${macd.signalLine}`);
      
      if (previousMacd !== null) {
        result.previousMacd = previousMacd;
      }
    }
    
    if (shortEma !== null && longEma !== null) {
      result.shortEma = shortEma;
      result.longEma = longEma;
      console.log(`Finnhub ${symbol} 短期EMA: ${shortEma}, 长期EMA: ${longEma}`);
      
      if (previousShortEma !== null && previousLongEma !== null) {
        result.previousShortEma = previousShortEma;
        result.previousLongEma = previousLongEma;
      }
    }
    
    if (Object.keys(result).length > 0) {
      return result;
    }
    
    console.warn(`从Finnhub获取技术指标数据失败`);
    return null;
  } catch (error) {
    console.error(`从Finnhub获取技术指标时出错:`, error);
    return null;
  }
}

// 辅助函数：转换timeframe到Finnhub的resolution格式
function timeframeToFinnhubResolution(timeframe: string): string {
  switch (timeframe) {
    case '1m': return '1';
    case '5m': return '5';
    case '15m': return '15';
    case '30m': return '30';
    case '1h': return '60';
    case '4h': return '240';
    case '1d': return 'D';
    case '1w': return 'W';
    case '1M': return 'M';
    default: return '60'; // 默认1小时
  }
}

// 辅助函数：转换timeframe到Alpha Vantage的interval格式
function timeframeToAlphaVantageInterval(timeframe: string): string {
  switch (timeframe) {
    case '1m': return '1min';
    case '5m': return '5min';
    case '15m': return '15min';
    case '30m': return '30min';
    case '1h': return '60min';
    case '1d': return 'daily';
    case '1w': return 'weekly';
    case '1M': return 'monthly';
    default: return '60min'; // 默认1小时
  }
}

// 从Alpha Vantage获取价格数据
async function fetchFromAlphaVantage(symbol: string, timeframe: string, limit: number): Promise<PriceData[]> {
  if (!ALPHA_VANTAGE_KEY) {
    throw new Error('Alpha Vantage API key is not configured');
  }
    
    // 格式化符号，移除"-USD"后缀，如"BTC-USD" -> "BTC"
    const formattedSymbol = symbol.replace('-USD', '');
    
    // 构建Alpha Vantage API URL
    const interval = timeframe === '1d' ? 'daily' : 'intraday';
    const url = `https://www.alphavantage.co/query?function=DIGITAL_CURRENCY_${interval.toUpperCase()}&symbol=${formattedSymbol}&market=USD&apikey=${ALPHA_VANTAGE_KEY}`;
    
    try {
      // 发送请求
      const response = await axios.get(url, {
        timeout: 5000
      });
      
      // 解析Alpha Vantage响应
      if (response.data) {
        try {
          const timeSeriesKey = timeframe === '1d' ? 'Time Series (Digital Currency Daily)' : 
                                'Time Series (Digital Currency Intraday)';
          
          const timeSeries = response.data[timeSeriesKey];
          if (!timeSeries) {
            throw new Error('No time series data found in Alpha Vantage response');
          }
          
          // 将对象转换为数组并按时间排序
          const result: PriceData[] = [];
          for (const [dateStr, valuesObj] of Object.entries(timeSeries)) {
            // 解决类型问题，确保类型安全
            const values = valuesObj as Record<string, string>;
            if (!values) continue;
            
            try {
              // Alpha Vantage的时间戳格式不同，需要转换
              const timestamp = new Date(dateStr).getTime();
              const closeKey = timeframe === '1d' ? '4a. close (USD)' : '4. close';
              const highKey = timeframe === '1d' ? '2a. high (USD)' : '2. high';
              const lowKey = timeframe === '1d' ? '3a. low (USD)' : '3. low';
              const openKey = timeframe === '1d' ? '1a. open (USD)' : '1. open';
              const volumeKey = '5. volume';
              
              // 确保所有必需数据都存在
              if (!values[closeKey]) {
                console.warn(`${symbol}: 在Alpha Vantage响应中找不到收盘价，跳过数据点: ${dateStr}`);
                continue;
              }
              
              result.push({
                timestamp,
                close: parseFloat(values[closeKey]),
                high: values[highKey] ? parseFloat(values[highKey]) : undefined,
                low: values[lowKey] ? parseFloat(values[lowKey]) : undefined,
                open: values[openKey] ? parseFloat(values[openKey]) : undefined,
                volume: values[volumeKey] ? parseFloat(values[volumeKey]) : undefined
              });
            } catch (parseError) {
              console.warn(`${symbol}: 解析Alpha Vantage数据点出错，跳过数据点: ${dateStr}`, parseError);
            }
          }
          
          // 按时间戳降序排序
          result.sort((a, b) => b.timestamp - a.timestamp);
          
          // 只取前limit个
          const limitedResult = result.slice(0, limit);
          console.log(`成功从Alpha Vantage获取${symbol}的价格数据，找到${limitedResult.length}个数据点`);
          return limitedResult;
        } catch (error) {
          console.error(`解析Alpha Vantage响应时出错:`, error);
          throw error;
        }
      }
      
      throw new Error('Invalid data format from Alpha Vantage');
    } catch (error) {
      console.error(`从Alpha Vantage获取${symbol}价格时出错:`, error);
      throw error;
    }
  }
  
  // 从Tiingo获取价格数据
  async function fetchFromTiingo(symbol: string, timeframe: string, limit: number): Promise<PriceData[]> {
    if (!TIINGO_API_KEY) {
      throw new Error('Tiingo API key is not configured');
    }
    
    // 格式化符号，移除"-USD"后缀，添加加密货币前缀
    const formattedSymbol = symbol.replace('-USD', 'USD');
    
    // 确定时间范围
    const now = new Date();
    const startDate = new Date();
    // 根据请求的数据点数量和时间框架设置开始日期
    if (timeframe === '1d') {
      startDate.setDate(now.getDate() - limit);
    } else {
      startDate.setHours(now.getHours() - limit);
    }
    
    // 格式化日期为YYYY-MM-DD
    const formatDate = (date: Date) => {
      return date.toISOString().split('T')[0];
    };
    
    // 构建Tiingo API URL
    const resampleFreq = timeframe === '1d' ? 'daily' : '1hour';
    const url = `https://api.tiingo.com/tiingo/crypto/prices?tickers=${formattedSymbol}&startDate=${formatDate(startDate)}&resampleFreq=${resampleFreq}&token=${TIINGO_API_KEY}`;
    
    try {
      // 发送请求
      const response = await axios.get(url, {
        timeout: 5000
      });
      
      // 解析Tiingo响应
      if (response.data && Array.isArray(response.data) && response.data.length > 0) {
        const cryptoData = response.data[0];
        
        if (cryptoData && cryptoData.priceData && Array.isArray(cryptoData.priceData)) {
          // 将Tiingo数据格式转换为我们需要的格式
          const priceData = cryptoData.priceData.map((data: any) => ({
            timestamp: new Date(data.date).getTime(),
            close: data.close,
            high: data.high,
            low: data.low,
            open: data.open,
            volume: data.volume
          }));
          
          // 按时间戳降序排序
          priceData.sort((a: PriceData, b: PriceData) => b.timestamp - a.timestamp);
          
          // 只取前limit个
          const limitedResult = priceData.slice(0, limit);
          console.log(`成功从Tiingo获取${symbol}的价格数据，找到${limitedResult.length}个数据点`);
          return limitedResult;
        }
      }
      
      throw new Error('Invalid data format from Tiingo');
    } catch (error) {
      console.error(`从Tiingo获取${symbol}价格时出错:`, error);
      throw error;
    }
  }
  
  // 从Finnhub获取价格数据
  async function fetchFromFinnhub(symbol: string, timeframe: string, limit: number): Promise<PriceData[]> {
    if (!FINNHUB_API_KEY) {
      throw new Error('Finnhub API key is not configured');
    }
    
    // 格式化符号，Finnhub对加密货币使用的是特殊格式
    const formattedSymbol = 'BINANCE:' + symbol.replace('-USD', 'USDT');
    
    // 确定时间范围和分辨率
    const now = Math.floor(Date.now() / 1000);
    const resolution = timeframe === '1d' ? 'D' : '60'; // D为日，60为小时
    const startTime = timeframe === '1d' 
                    ? now - (86400 * limit) // limit天的秒数
                    : now - (3600 * limit); // limit小时的秒数
    
    // 构建Finnhub API URL
    const url = `https://finnhub.io/api/v1/crypto/candle?symbol=${formattedSymbol}&resolution=${resolution}&from=${startTime}&to=${now}&token=${FINNHUB_API_KEY}`;
    
    try {
      // 发送请求
      const response = await axios.get(url, {
        timeout: 5000
      });
      
      // 解析Finnhub响应
      if (response.data && response.data.s === 'ok') {
        const { c, h, l, o, t, v } = response.data; // c: close, h: high, l: low, o: open, t: timestamp, v: volume
        
        if (Array.isArray(c) && c.length > 0) {
          // 将Finnhub数据转换为我们需要的格式
          const priceData: PriceData[] = [];
          
          for (let i = 0; i < c.length; i++) {
            priceData.push({
              timestamp: t[i] * 1000, // 转换为毫秒
              close: c[i],
              high: h[i],
              low: l[i],
              open: o[i],
              volume: v[i]
            });
          }
          
          // 按时间戳降序排序
          priceData.sort((a, b) => b.timestamp - a.timestamp);
          
          // 只取前limit个
          const limitedResult = priceData.slice(0, limit);
          console.log(`成功从Finnhub获取${symbol}的价格数据，找到${limitedResult.length}个数据点`);
          return limitedResult;
        }
      }
      
      throw new Error('Invalid data format from Finnhub');
    } catch (error) {
      console.error(`从Finnhub获取${symbol}价格时出错:`, error);
      throw error;
    }
  }
  
  // 从CoinMarketCap获取价格数据
  async function fetchFromCoinMarketCap(symbol: string, timeframe: string, limit: number): Promise<PriceData[]> {
    if (!COINMARKETCAP_API_KEY) {
      throw new Error('CoinMarketCap API key is not configured');
    }
    
    // 格式化符号
    const formattedSymbol = symbol.replace('-USD', '');
    
    // CoinMarketCap需要先获取加密货币ID
    try {
      // 先通过API查找加密货币ID
      const metadataUrl = `https://pro-api.coinmarketcap.com/v1/cryptocurrency/info?symbol=${formattedSymbol}`;
      const metadataResponse = await axios.get(metadataUrl, {
        headers: {
          'X-CMC_PRO_API_KEY': COINMARKETCAP_API_KEY
        },
        timeout: 5000
      });
      
      if (metadataResponse.data && metadataResponse.data.data && metadataResponse.data.data[formattedSymbol]) {
        const coinId = metadataResponse.data.data[formattedSymbol].id;
        
        // 确定时间间隔
        const interval = timeframe === '1d' ? 'daily' : 'hourly';
        
        // 获取OHLCV数据
        const ohlcvUrl = `https://pro-api.coinmarketcap.com/v1/cryptocurrency/ohlcv/historical?id=${coinId}&time_period=${interval}&count=${limit}`;
        const ohlcvResponse = await axios.get(ohlcvUrl, {
          headers: {
            'X-CMC_PRO_API_KEY': COINMARKETCAP_API_KEY
          },
          timeout: 5000
        });
        
        if (ohlcvResponse.data && ohlcvResponse.data.data && ohlcvResponse.data.data.quotes) {
          // 转换数据格式
          const priceData = ohlcvResponse.data.data.quotes.map((quote: any) => ({
            timestamp: new Date(quote.time_open).getTime(),
            open: quote.quote.USD.open,
            high: quote.quote.USD.high,
            low: quote.quote.USD.low,
            close: quote.quote.USD.close,
            volume: quote.quote.USD.volume
          }));
          
          // 按时间戳降序排序
          priceData.sort((a: PriceData, b: PriceData) => b.timestamp - a.timestamp);
          
          console.log(`成功从CoinMarketCap获取${symbol}的价格数据，找到${priceData.length}个数据点`);
          return priceData;
        }
      }
      
      throw new Error('Could not find crypto ID or invalid data format from CoinMarketCap');
    } catch (error) {
      console.error(`从CoinMarketCap获取${symbol}价格时出错:`, error);
      throw error;
    }
  }
  
  // 从CryptoCompare获取价格数据
  async function fetchFromCryptoCompare(symbol: string, timeframe: string, limit: number): Promise<PriceData[]> {
    if (!CRYPTOCOMPARE_API_KEY) {
      // CryptoCompare可以在没有API密钥的情况下工作，只是会有限制
      console.warn('CryptoCompare API key is not configured, using limited access');
    }
    
    // 格式化符号
    const formattedSymbol = symbol.replace('-USD', '');
    
    // 确定时间间隔
    const interval = timeframe === '1d' ? 'day' : 'hour';
    
    // 构建URL
    const url = `https://min-api.cryptocompare.com/data/v2/histo${interval}?fsym=${formattedSymbol}&tsym=USD&limit=${limit}`;
    
    try {
      // 发送请求
      const headers: Record<string, string> = {};
      if (CRYPTOCOMPARE_API_KEY) {
        headers['authorization'] = `Apikey ${CRYPTOCOMPARE_API_KEY}`;
      }
      
      const response = await axios.get(url, {
        headers,
        timeout: 5000
      });
      
      // 解析响应
      if (response.data && response.data.Data && response.data.Data.Data) {
        const priceData = response.data.Data.Data.map((data: any) => ({
          timestamp: data.time * 1000, // 转换为毫秒
          open: data.open,
          high: data.high,
          low: data.low,
          close: data.close,
          volume: data.volumefrom
        }));
        
        // 按时间戳降序排序（CryptoCompare的数据可能已经排序）
        priceData.sort((a: PriceData, b: PriceData) => b.timestamp - a.timestamp);
        
        console.log(`成功从CryptoCompare获取${symbol}的价格数据，找到${priceData.length}个数据点`);
        return priceData;
      }
      
      throw new Error('Invalid data format from CryptoCompare');
    } catch (error) {
      console.error(`从CryptoCompare获取${symbol}价格时出错:`, error);
      throw error;
    }
  }
  
  // 从CoinAPI获取价格数据
  async function fetchFromCoinAPI(symbol: string, timeframe: string, limit: number): Promise<PriceData[]> {
    if (!COINAPI_KEY) {
      throw new Error('CoinAPI key is not configured');
    }
    
    // 格式化符号
    const formattedSymbol = symbol.replace('-USD', '');
    
    // 确定时间段
    const periodId = timeframe === '1d' ? '1DAY' : '1HRS';
    
    // 构建URL
    const url = `https://rest.coinapi.io/v1/ohlcv/BITSTAMP_SPOT_${formattedSymbol}_USD/latest?period_id=${periodId}&limit=${limit}`;
    
    try {
      // 发送请求
      const response = await axios.get(url, {
        headers: {
          'X-CoinAPI-Key': COINAPI_KEY
        },
        timeout: 5000
      });
      
      // 解析响应
      if (response.data && Array.isArray(response.data)) {
        const priceData = response.data.map((data: any) => ({
          timestamp: new Date(data.time_period_start).getTime(),
          open: data.price_open,
          high: data.price_high,
          low: data.price_low,
          close: data.price_close,
          volume: data.volume_traded
        }));
        
        // 按时间戳降序排序
        priceData.sort((a: PriceData, b: PriceData) => b.timestamp - a.timestamp);
        
        console.log(`成功从CoinAPI获取${symbol}的价格数据，找到${priceData.length}个数据点`);
        return priceData;
      }
      
      throw new Error('Invalid data format from CoinAPI');
    } catch (error) {
      console.error(`从CoinAPI获取${symbol}价格时出错:`, error);
      throw error;
    }
  }
  
  // 从CoinLayer获取价格数据
  async function fetchFromCoinLayer(symbol: string, timeframe: string, limit: number): Promise<PriceData[]> {
    if (!COINLAYER_API_KEY) {
      throw new Error('CoinLayer API key is not configured');
    }
    
    // 格式化符号
    const formattedSymbol = symbol.replace('-USD', '');
    
    // CoinLayer只提供实时数据和历史每日数据
    // 如果需要小时数据但CoinLayer只有天数据，我们会返回空数组，让其他数据源尝试
    if (timeframe !== '1d') {
      throw new Error('CoinLayer only provides daily historical data');
    }
    
    // 获取过去limit天的数据
    const priceData: PriceData[] = [];
    const today = new Date();
    
    // 从今天往回获取limit天的数据
    for (let i = 0; i < limit; i++) {
      const date = new Date(today);
      date.setDate(today.getDate() - i);
      
      // 格式化日期为YYYY-MM-DD
      const dateString = date.toISOString().split('T')[0];
      
      try {
        const url = `http://api.coinlayer.com/${dateString}?access_key=${COINLAYER_API_KEY}&symbols=${formattedSymbol}`;
        const response = await axios.get(url, { timeout: 5000 });
        
        if (response.data && response.data.success && response.data.rates && response.data.rates[formattedSymbol]) {
          // CoinLayer只提供收盘价
          priceData.push({
            timestamp: date.getTime(),
            close: response.data.rates[formattedSymbol],
            // 没有其他价格数据
          });
        }
      } catch (error) {
        console.warn(`无法获取${dateString}的CoinLayer数据:`, error);
        // 继续获取其他日期的数据
      }
      
      // 添加延迟，避免API速率限制
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    
    if (priceData.length > 0) {
      // 按时间戳降序排序
      priceData.sort((a, b) => b.timestamp - a.timestamp);
      
      console.log(`成功从CoinLayer获取${symbol}的价格数据，找到${priceData.length}个数据点`);
      return priceData;
    }
    
    throw new Error('Could not retrieve enough data from CoinLayer');
  }
  
  // 尝试所有数据源
  return tryAllDataSources();
}

// 计算技术指标
async function calculateTechnicalIndicators(symbol: string, timeframe: string = '1h', volumeToMarketCapRatio?: number): Promise<TechnicalData> {
  console.log(`开始为${symbol}收集技术指标数据...`);
  
  // 初始化结果对象，如果有交易量市值比率，就先添加它
  const result: TechnicalData = {};
  if (volumeToMarketCapRatio !== undefined) {
    result.volumeToMarketCapRatio = volumeToMarketCapRatio;
    console.log(`${symbol}：使用交易量市值比率 ${volumeToMarketCapRatio} 作为分析基础`);
  }
  
  // 尝试直接从Alpha Vantage API获取RSI和MACD等技术指标
  let apiSuccessCount = 0;
  const totalApiCount = 3; // RSI, MACD, EMA
  
  // 1. 尝试获取RSI
  try {
    console.log(`${symbol}：尝试从Alpha Vantage直接获取RSI指标...`);
    // 调用已定义的RSI函数
    const rsiValue = await (async function() {
      if (!ALPHA_VANTAGE_KEY) {
        console.warn('Alpha Vantage API key not configured');
        return null;
      }
      
      try {
        // 格式化参数
        const formattedSymbol = symbol.replace('-USD', '');
        const interval = timeframeToAlphaVantageInterval(timeframe);
        
        // 构建API URL - 使用专门的RSI端点
        const url = `https://www.alphavantage.co/query?function=RSI&symbol=${formattedSymbol}&interval=${interval}&time_period=14&series_type=close&apikey=${ALPHA_VANTAGE_KEY}`;
        
        console.log(`请求Alpha Vantage RSI数据: ${formattedSymbol}`);
        
        const response = await axios.get(url, { timeout: 10000 });
        const data = response.data;
        
        if (data && data['Technical Analysis: RSI']) {
          const rsiData = data['Technical Analysis: RSI'];
          const dates = Object.keys(rsiData).sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
          
          if (dates.length > 0) {
            const latestDate = dates[0];
            const rsiValue = parseFloat(rsiData[latestDate]['RSI']);
            console.log(`成功从Alpha Vantage获取${symbol}的RSI指标: ${rsiValue}`);
            return rsiValue;
          }
        } else if (data && data['Note'] && data['Note'].includes('call frequency')) {
          // API频率限制处理
          console.warn(`Alpha Vantage API频率限制: ${data['Note']}`);
          // 随机延迟1-3秒后可以重试
          await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 2000));
          return null;
        }
        
        console.warn(`从Alpha Vantage获取RSI数据失败:`, data);
        return null;
      } catch (error) {
        console.error(`从Alpha Vantage获取RSI指标时出错:`, error);
        return null;
      }
    })();
    
    if (rsiValue !== null) {
      result.rsi = rsiValue;
      apiSuccessCount++;
      console.log(`${symbol}：成功获取RSI = ${rsiValue}`);
    }
  } catch (error) {
    console.warn(`${symbol}：从Alpha Vantage获取RSI失败:`, error);
  }
  
  // 2. 尝试获取MACD
  try {
    console.log(`${symbol}：尝试从Alpha Vantage直接获取MACD指标...`);
    const macdData = await (async function() {
      if (!ALPHA_VANTAGE_KEY) {
        console.warn('Alpha Vantage API key not configured');
        return null;
      }
      
      try {
        // 格式化参数
        const formattedSymbol = symbol.replace('-USD', '');
        const interval = timeframeToAlphaVantageInterval(timeframe);
        
        // 构建API URL - 使用专门的MACD端点
        const url = `https://www.alphavantage.co/query?function=MACD&symbol=${formattedSymbol}&interval=${interval}&series_type=close&fastperiod=12&slowperiod=26&signalperiod=9&apikey=${ALPHA_VANTAGE_KEY}`;
        
        console.log(`请求Alpha Vantage MACD数据: ${formattedSymbol}`);
        
        const response = await axios.get(url, { timeout: 10000 });
        const data = response.data;
        
        if (data && data['Technical Analysis: MACD']) {
          const macdData = data['Technical Analysis: MACD'];
          const dates = Object.keys(macdData).sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
          
          if (dates.length > 0) {
            const latestDate = dates[0];
            const macdLine = parseFloat(macdData[latestDate]['MACD']);
            const signalLine = parseFloat(macdData[latestDate]['MACD_Signal']);
            const histogram = parseFloat(macdData[latestDate]['MACD_Hist']);
            
            console.log(`成功从Alpha Vantage获取${symbol}的MACD指标: MACD=${macdLine}, Signal=${signalLine}, Hist=${histogram}`);
            
            // 构建返回对象
            const result = { 
              macdLine, 
              signalLine, 
              histogram 
            };
            
            // 如果有前一个周期数据，用于金叉/死叉检测
            if (dates.length > 1) {
              const previousDate = dates[1];
              const previousMacdLine = parseFloat(macdData[previousDate]['MACD']);
              const previousSignalLine = parseFloat(macdData[previousDate]['MACD_Signal']);
              const previousHistogram = parseFloat(macdData[previousDate]['MACD_Hist']);
              
              // 保存前一周期MACD数据
              result.previousMacd = {
                macdLine: previousMacdLine,
                signalLine: previousSignalLine,
                histogram: previousHistogram
              };
            }
            
            return result;
          }
        } else if (data && data['Note'] && data['Note'].includes('call frequency')) {
          // API频率限制处理
          console.warn(`Alpha Vantage API频率限制: ${data['Note']}`);
          await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 2000));
          return null;
        }
        
        console.warn(`从Alpha Vantage获取MACD数据失败:`, data);
        return null;
      } catch (error) {
        console.error(`从Alpha Vantage获取MACD指标时出错:`, error);
        return null;
      }
    })();
    
    if (macdData !== null) {
      result.macd = macdData;
      apiSuccessCount++;
      console.log(`${symbol}：成功获取MACD线 = ${macdData.macdLine}, 信号线 = ${macdData.signalLine}`);
    }
  } catch (error) {
    console.warn(`${symbol}：从Alpha Vantage获取MACD失败:`, error);
  }
  
  // 3. 尝试获取EMA
  try {
    console.log(`${symbol}：尝试从Alpha Vantage直接获取EMA指标...`);
    const emaData = await fetchEMAFromAlphaVantage(symbol, timeframe);
    if (emaData !== null) {
      result.shortEma = emaData.shortEma;
      result.longEma = emaData.longEma;
      result.previousShortEma = emaData.previousShortEma;
      result.previousLongEma = emaData.previousLongEma;
      apiSuccessCount++;
      console.log(`${symbol}：成功获取短期EMA = ${emaData.shortEma}, 长期EMA = ${emaData.longEma}`);
    }
  } catch (error) {
    console.warn(`${symbol}：从Alpha Vantage获取EMA失败:`, error);
  }
  
  // 如果部分Alpha Vantage API失败，尝试使用Finnhub作为备选
  if (apiSuccessCount < totalApiCount && FINNHUB_API_KEY) {
    try {
      console.log(`${symbol}：部分Alpha Vantage API失败，尝试使用Finnhub API补充...`);
      const finnhubData = await fetchTechnicalIndicatorsFromFinnhub(symbol, timeframe);
      if (finnhubData) {
        // 只填充缺失的指标
        if (!result.rsi && finnhubData.rsi) result.rsi = finnhubData.rsi;
        if (!result.macd && finnhubData.macd) result.macd = finnhubData.macd;
        if (!result.previousMacd && finnhubData.previousMacd) result.previousMacd = finnhubData.previousMacd;
        if (!result.shortEma && finnhubData.shortEma) result.shortEma = finnhubData.shortEma;
        if (!result.longEma && finnhubData.longEma) result.longEma = finnhubData.longEma;
        if (!result.previousShortEma && finnhubData.previousShortEma) result.previousShortEma = finnhubData.previousShortEma;
        if (!result.previousLongEma && finnhubData.previousLongEma) result.previousLongEma = finnhubData.previousLongEma;
        
        console.log(`${symbol}：成功从Finnhub补充部分技术指标数据`);
      }
    } catch (error) {
      console.warn(`${symbol}：从Finnhub获取技术指标失败:`, error);
    }
  }
  
  // 检查是否通过API获取了任何技术指标
  const hasApiTechnicalData = result.rsi !== undefined || 
                              (result.macd !== undefined && result.macd !== null) || 
                              (result.shortEma !== undefined && result.longEma !== undefined);
  
  // 如果API都失败，尝试获取历史价格并自己计算指标
  if (!hasApiTechnicalData) {
    try {
      console.log(`${symbol}：所有API获取指标失败，尝试获取历史价格数据并计算...`);
      const historicalPrices = await fetchHistoricalPrices(symbol, timeframe);
      
      if (historicalPrices.length >= 30) {
        console.log(`${symbol}：成功获取${historicalPrices.length}个历史价格数据点`);
        
        // 验证数据完整性
        const validPrices = historicalPrices.filter(p => p && typeof p.close === 'number' && !isNaN(p.close));
        if (validPrices.length >= 30) {
          // 确保按时间排序（新的在前）
          validPrices.sort((a, b) => b.timestamp - a.timestamp);
          
          // 提取价格
          const prices = validPrices.map(p => p.close);
          
          // 计算技术指标
          try {
            // 计算RSI（如果API未获取）
            if (result.rsi === undefined) {
              result.rsi = calculateRSI(prices);
              console.log(`${symbol}：已计算RSI = ${result.rsi}`);
            }
            
            // 计算MACD（如果API未获取）
            if (result.macd === undefined) {
              result.macd = calculateMACD(prices);
              console.log(`${symbol}：已计算MACD线 = ${result.macd.macdLine}, 信号线 = ${result.macd.signalLine}`);
            }
            
            // 计算EMA（如果API未获取）
            if (result.shortEma === undefined || result.longEma === undefined) {
              result.shortEma = calculateEMA(prices, SHORT_EMA_PERIOD);
              result.longEma = calculateEMA(prices, LONG_EMA_PERIOD);
              console.log(`${symbol}：已计算短期EMA = ${result.shortEma}, 长期EMA = ${result.longEma}`);
            }
            
            // 尝试计算前一个数据点的指标，用于检测金叉/死叉
            if (validPrices.length > 30) {
              const previousPrices = validPrices.slice(1).map(p => p.close);
              
              if (result.previousMacd === undefined) {
                result.previousMacd = calculateMACD(previousPrices);
              }
              if (result.previousShortEma === undefined) {
                result.previousShortEma = calculateEMA(previousPrices, SHORT_EMA_PERIOD);
              }
              if (result.previousLongEma === undefined) {
                result.previousLongEma = calculateEMA(previousPrices, LONG_EMA_PERIOD);
              }
            }
          } catch (error) {
            console.error(`${symbol}：计算技术指标时出错:`, error);
          }
        } else {
          console.warn(`${symbol}：过滤后剩余${validPrices.length}个有效数据点，不足以计算技术指标`);
        }
      } else {
        console.warn(`${symbol}：没有足够的历史价格数据来计算技术指标，只有${historicalPrices.length}个数据点`);
      }
    } catch (error) {
      console.warn(`${symbol}：获取历史价格数据失败:`, error);
    }
  }
  
  // 最终检查是否有任何技术指标数据
  const hasTechnicalData = result.rsi !== undefined || 
                          (result.macd !== undefined && result.macd !== null) || 
                          (result.shortEma !== undefined && result.longEma !== undefined);
                         
  console.log(`${symbol}技术指标收集完成，已获取数据: ${JSON.stringify(Object.keys(result))}`);
  return result;
}

// 判断交易量市值比率信号
function getVolumeRatioSignal(ratio: number): 'buy' | 'sell' | 'neutral' {
  if (ratio >= 0.20) { // 20%以上为买入信号倾向，但仍需技术指标确认
    return 'buy';
  } else if (ratio >= 0.05) { // 5%-20%之间为卖出信号倾向，但仍需技术指标确认
    return 'sell';
  } else { // 5%以下为中性信号
    return 'neutral';
  }
}

// 从RSI获取信号
function getRSISignal(rsi: number, previousRSI?: number): 'buy' | 'sell' | 'neutral' {
  // 买入信号：RSI降至30以下并回升
  if (previousRSI && rsi <= RSI_OVERSOLD && rsi > previousRSI) {
    return 'buy'; // RSI在超卖区间并回升，强烈买入信号
  }
  // 卖出信号：RSI升至70以上并回落
  else if (previousRSI && rsi >= RSI_OVERBOUGHT && rsi < previousRSI) {
    return 'sell'; // RSI在超买区间并回落，强烈卖出信号
  }
  // 备用信号判断（当没有前一个周期数据时）
  else if (rsi < RSI_OVERSOLD) {
    return 'buy'; // RSI低于30，超卖信号
  } else if (rsi > RSI_OVERBOUGHT) {
    return 'sell'; // RSI高于70，超买信号
  }
  return 'neutral';
}

// 从MACD获取信号
function getMACDSignal(
  macd: { macdLine: number, signalLine: number, histogram: number }, 
  previousMacd?: { macdLine: number, signalLine: number, histogram: number }
): 'buy' | 'sell' | 'neutral' {
  
  // 有之前数据时的精确金叉/死叉判断
  if (previousMacd) {
    // 金叉：MACD线从下方穿越信号线
    if (previousMacd.macdLine < previousMacd.signalLine && macd.macdLine >= macd.signalLine) {
      return 'buy';
    }
    // 死叉：MACD线从上方穿越信号线
    else if (previousMacd.macdLine > previousMacd.signalLine && macd.macdLine <= macd.signalLine) {
      return 'sell';
    }
  }
  
  // 没有之前数据时，使用直方图判断
  if (macd.histogram > 0 && macd.macdLine > 0) {
    // 直方图为正且MACD线在0以上，买入信号
    return 'buy';
  } else if (macd.histogram < 0 && macd.macdLine < 0) {
    // 直方图为负且MACD线在0以下，卖出信号
    return 'sell';
  }
  
  return 'neutral';
}

// 从EMA获取信号
function getEMASignal(
  shortEma: number,
  longEma: number,
  previousShortEma?: number,
  previousLongEma?: number
): 'buy' | 'sell' | 'neutral' {
  
  // 有之前数据时的精确金叉/死叉判断
  if (previousShortEma && previousLongEma) {
    // 金叉：短期EMA从下方穿越长期EMA
    if (previousShortEma < previousLongEma && shortEma >= longEma) {
      return 'buy';
    }
    // 死叉：短期EMA从上方穿越长期EMA
    else if (previousShortEma > previousLongEma && shortEma <= longEma) {
      return 'sell';
    }
  }
  
  // 没有之前数据时，使用当前EMA关系判断
  if (shortEma > longEma) {
    // 短期EMA在长期EMA上方，上升趋势
    return 'buy';
  } else if (shortEma < longEma) {
    // 短期EMA在长期EMA下方，下降趋势
    return 'sell';
  }
  
  return 'neutral';
}

// 获取综合信号
function getCombinedSignal(volumeRatio: number, technicalData: TechnicalData): SignalData {
  // 获取交易量市值比率信号
  const volumeRatioSignal = getVolumeRatioSignal(volumeRatio);
  
  // 检查是否至少有一个技术指标可用（RSI、MACD或EMA）
  const hasAtLeastOneIndicator = (technicalData.rsi !== undefined) || 
                               (technicalData.macd !== undefined) || 
                               (technicalData.shortEma !== undefined && technicalData.longEma !== undefined);
  
  // 如果没有任何技术指标数据，返回中性信号
  // 确保真正的技术分析必须使用至少一个技术指标，不能仅依靠交易量
  if (!hasAtLeastOneIndicator) {
    console.log(`${symbol}：没有技术指标数据，无法生成有效的技术分析信号，返回中性信号`);
    return {
      volumeRatioSignal,
      rsiSignal: 'neutral',
      macdSignal: 'neutral',
      emaSignal: 'neutral',
      combinedSignal: 'neutral',
      signalStrength: 1,
      recommendationType: 'position'
    };
  } else {
    // 增强基于交易量市值比率的分析逻辑
    let combinedSignal: 'strong_buy' | 'buy' | 'neutral' | 'sell' | 'strong_sell';
    let signalStrength: number;
    let recommendationType: 'day_trade' | 'swing_trade' | 'position' = 'day_trade';
    
    // 基于交易量市值比率的更细致判断
    if (volumeRatio > 50) {
      // 极高的交易量市值比率，强烈买入信号
      combinedSignal = 'strong_buy';
      signalStrength = 5;
      recommendationType = 'day_trade'; // 适合短线
    } else if (volumeRatio > 20) {
      // 高交易量市值比率，买入信号
      combinedSignal = 'buy';
      signalStrength = 4;
      recommendationType = 'day_trade';
    } else if (volumeRatio > 10) {
      // 中高交易量市值比率
      combinedSignal = volumeRatioSignal === 'buy' ? 'buy' : 'neutral';
      signalStrength = 3;
      recommendationType = 'swing_trade';
    } else if (volumeRatio > 5) {
      // 中等交易量市值比率
      combinedSignal = volumeRatioSignal === 'buy' ? 'buy' : 
                     volumeRatioSignal === 'sell' ? 'sell' : 'neutral';
      signalStrength = volumeRatioSignal === 'buy' ? 3 : 
                     volumeRatioSignal === 'sell' ? 2 : 3;
      recommendationType = 'swing_trade';
    } else if (volumeRatio < 1) {
      // 交易量极低
      combinedSignal = 'sell';
      signalStrength = 2;
      recommendationType = 'position';
    } else {
      // 默认情况
      combinedSignal = volumeRatioSignal === 'buy' ? 'buy' : 
                     volumeRatioSignal === 'sell' ? 'sell' : 'neutral';
      signalStrength = volumeRatioSignal === 'buy' ? 3 : 
                     volumeRatioSignal === 'sell' ? 2 : 3;
      recommendationType = 'position';
    }
    
    return {
      volumeRatioSignal,
      rsiSignal: 'neutral',
      macdSignal: 'neutral',
      emaSignal: 'neutral',
      combinedSignal,
      signalStrength,
      recommendationType
    };
  }

  // 使用带有前一周期数据的信号生成
  let rsiSignal: 'buy' | 'sell' | 'neutral' = 'neutral';
  if (technicalData.rsi !== undefined) {
    // 如果有前一周期的RSI数据用于趋势变化判断
    const previousRSI = technicalData.previousRSI;
    rsiSignal = getRSISignal(technicalData.rsi, previousRSI);
    console.log(`RSI(${technicalData.rsi.toFixed(2)})信号: ${rsiSignal}`);
  }
  
  let macdSignal: 'buy' | 'sell' | 'neutral' = 'neutral';
  if (technicalData.macd) {
    // 如果有前一周期MACD数据，用它判断金叉/死叉
    macdSignal = getMACDSignal(technicalData.macd, technicalData.previousMacd);
    console.log(`MACD信号(${technicalData.macd.macdLine.toFixed(4)}, ${technicalData.macd.signalLine.toFixed(4)}): ${macdSignal}`);
  }
  
  let emaSignal: 'buy' | 'sell' | 'neutral' = 'neutral';
  if (technicalData.shortEma !== undefined && technicalData.longEma !== undefined) {
    // 如果有前一周期的EMA数据，用它判断金叉/死叉
    emaSignal = getEMASignal(
      technicalData.shortEma, 
      technicalData.longEma,
      technicalData.previousShortEma,
      technicalData.previousLongEma
    );
    console.log(`EMA信号(短期:${technicalData.shortEma.toFixed(2)}, 长期:${technicalData.longEma.toFixed(2)}): ${emaSignal}`);
  }

  // 计算买入和卖出信号数量，并确保至少有一个技术指标与交易量方向一致
  let buySignals = 0;
  let sellSignals = 0;
  
  // 技术指标买入信号计数
  let techBuySignals = 0;
  let techSellSignals = 0;
  
  // 交易量信号
  if (volumeRatioSignal === 'buy') buySignals++;
  if (volumeRatioSignal === 'sell') sellSignals++;
  
  // 技术指标信号
  if (rsiSignal === 'buy') {
    buySignals++;
    techBuySignals++;
  }
  if (rsiSignal === 'sell') {
    sellSignals++;
    techSellSignals++;
  }
  
  if (macdSignal === 'buy') {
    buySignals++;
    techBuySignals++;
  }
  if (macdSignal === 'sell') {
    sellSignals++;
    techSellSignals++;
  }
  
  if (emaSignal === 'buy') {
    buySignals++;
    techBuySignals++;
  }
  if (emaSignal === 'sell') {
    sellSignals++;
    techSellSignals++;
  }
  
  // 验证是否至少有一个技术指标与交易量方向一致
  const hasTechBuyConfirmation = volumeRatioSignal === 'buy' && techBuySignals > 0;
  const hasTechSellConfirmation = volumeRatioSignal === 'sell' && techSellSignals > 0;
  
  // 特殊检查GHIBLI案例：RSI在中性区域（30-70之间）不应产生信号
  let rsiBuyIgnored = false;
  let rsiSellIgnored = false;
  
  if (technicalData.rsi !== undefined && technicalData.rsi > RSI_OVERSOLD && technicalData.rsi < RSI_OVERBOUGHT) {
    // RSI在中性区域，仅基于RSI的信号应被忽略
    console.log(`RSI为${technicalData.rsi.toFixed(2)}，处于中性区域，不应单独产生买入或卖出信号`);
    rsiBuyIgnored = rsiSignal === 'buy';
    rsiSellIgnored = rsiSignal === 'sell';
  }
  
  // 更严格的确认逻辑：
  // 1. 如果交易量显示买入，但没有技术指标确认，或者唯一的技术信号是中性区域的RSI，则忽略
  const realTechBuySignals = techBuySignals - (rsiBuyIgnored ? 1 : 0);
  const realTechSellSignals = techSellSignals - (rsiSellIgnored ? 1 : 0);
  
  const isValidBuySignal = volumeRatioSignal === 'buy' && realTechBuySignals > 0;
  const isValidSellSignal = volumeRatioSignal === 'sell' && realTechSellSignals > 0;
  
  // 如果没有技术指标确认交易量信号，则重置相应的信号计数
  if (volumeRatioSignal === 'buy' && !isValidBuySignal) {
    buySignals = 0; // 重置买入信号，因为没有有效的技术指标确认
    console.log(`交易量显示买入信号，但没有有效的技术指标确认，忽略此信号`);
  }
  
  if (volumeRatioSignal === 'sell' && !isValidSellSignal) {
    sellSignals = 0; // 重置卖出信号，因为没有有效的技术指标确认
    console.log(`交易量显示卖出信号，但没有有效的技术指标确认，忽略此信号`);
  }

  // 确定综合信号和信号强度
  let combinedSignal: 'strong_buy' | 'buy' | 'neutral' | 'sell' | 'strong_sell';
  let signalStrength: number;
  
  if (buySignals >= 3) {
    combinedSignal = 'strong_buy';
    signalStrength = 5;
  } else if (buySignals === 2) {
    combinedSignal = 'buy';
    signalStrength = 4;
  } else if (sellSignals >= 3) {
    combinedSignal = 'strong_sell';
    signalStrength = 1;
  } else if (sellSignals === 2) {
    combinedSignal = 'sell';
    signalStrength = 2;
  } else {
    combinedSignal = 'neutral';
    signalStrength = 3;
  }

  // 根据时间框架确定交易类型
  let recommendationType: 'day_trade' | 'swing_trade' | 'position' = 'day_trade';

  return {
    volumeRatioSignal,
    rsiSignal,
    macdSignal,
    emaSignal,
    combinedSignal,
    signalStrength,
    recommendationType
  };
}

// 这里移除了重复的函数定义

// 运行技术分析
export async function runTechnicalAnalysis(timeframe: string = '1h', specificVmcBatchId?: number): Promise<{ batchId: number, entriesCount: number }> {
  console.log(`开始技术分析，时间框架: ${timeframe}${specificVmcBatchId ? `, 使用指定的交易量市值批次 #${specificVmcBatchId}` : ''}`);
  
  try {
    // 查看当前技术分析批次表结构，确保正确创建
    const schema = await db.query.technicalAnalysisBatches.findFirst();
    console.log('技术分析批次表结构:', Object.keys(schema || {}));
    
    // 创建一个新的分析批次
    const [batchResult] = await db.insert(technicalAnalysisBatches).values({
      entriesCount: 0, // 初始化为0，后面会更新
      timeframe, // 时间框架
      description: specificVmcBatchId ? `基于交易量市值比率批次 #${specificVmcBatchId}的分析` : '常规分析',
      createdAt: new Date(),
    }).returning();
    
    const batchId = batchResult.id;
    console.log(`已创建技术分析批次 #${batchId}`);
    
    // 获取交易量市值比率数据 - 如果指定了批次ID，则使用指定的批次，否则使用最新的批次
    let vmcBatch;
    if (specificVmcBatchId) {
      vmcBatch = await db.query.volumeToMarketCapBatches.findFirst({
        where: eq(volumeToMarketCapBatches.id, specificVmcBatchId)
      });
      if (!vmcBatch) {
        console.error(`找不到指定的交易量市值比率批次 #${specificVmcBatchId}`);
        return { batchId, entriesCount: 0 };
      }
    } else {
      vmcBatch = await db.query.volumeToMarketCapBatches.findFirst({
        orderBy: desc(volumeToMarketCapBatches.createdAt)
      });
    }
    
    if (!vmcBatch) {
      console.error('找不到交易量市值比率数据');
      return { batchId, entriesCount: 0 };
    }
    
    console.log(`使用交易量市值比率批次 #${vmcBatch.id} 从 ${vmcBatch.createdAt}`);
    
    // 获取前100个加密货币的交易量市值比率数据
    const ratios = await db.query.volumeToMarketCapRatios.findMany({
      where: eq(volumeToMarketCapRatios.batchId, vmcBatch.id),
      orderBy: desc(volumeToMarketCapRatios.volumeToMarketCapRatio),
      limit: 100
    });
    
    if (ratios.length === 0) {
      console.error('没有找到交易量市值比率数据');
      return { batchId, entriesCount: 0 };
    }
    
    console.log(`找到${ratios.length}个交易量市值比率数据进行分析`);
    
    // 对每个加密货币进行分析
    let analysisCount = 0;
    for (const ratio of ratios) {
      try {
        // 获取货币信息 - 优先使用ID，如果ID为0则使用symbol进行匹配
        let crypto;
        if (ratio.cryptocurrencyId !== 0) {
          crypto = await db.query.cryptocurrencies.findFirst({
            where: eq(cryptocurrencies.id, ratio.cryptocurrencyId)
          });
        } else {
          // 使用symbol尝试匹配
          console.log(`尝试使用symbol '${ratio.symbol}' 查找加密货币...`);
          crypto = await db.query.cryptocurrencies.findFirst({
            where: eq(cryptocurrencies.symbol, ratio.symbol)
          });
          
          // 如果仍未找到，尝试使用name匹配
          if (!crypto && ratio.name) {
            console.log(`尝试使用name '${ratio.name}' 查找加密货币...`);
            crypto = await db.query.cryptocurrencies.findFirst({
              where: eq(cryptocurrencies.name, ratio.name)
            });
          }
        }
        
        if (!crypto) {
          console.warn(`无法找到加密货币: ID=${ratio.cryptocurrencyId}, Symbol=${ratio.symbol}, Name=${ratio.name}`);
          continue;
        }
        
        console.log(`分析 ${crypto.symbol} (${crypto.name})，交易量市值比率: ${ratio.volumeToMarketCapRatio}`);
        
        // 计算技术指标，将交易量市值比率传入，即使无法获取历史价格数据，也能提供基本分析
        const technicalData = await calculateTechnicalIndicators(crypto.symbol, timeframe, ratio.volumeToMarketCapRatio);
        
        // 获取综合信号
        const signalData = getCombinedSignal(ratio.volumeToMarketCapRatio, technicalData);
        
        // 存储分析结果
        await db.insert(technicalAnalysisEntries).values({
          batchId,
          cryptocurrencyId: crypto.id,
          symbol: crypto.symbol,
          name: crypto.name,
          volumeToMarketCapRatio: ratio.volumeToMarketCapRatio,
          rsiValue: technicalData.rsi || null,
          macdLine: technicalData.macd?.macdLine || null,
          signalLine: technicalData.macd?.signalLine || null,
          histogram: technicalData.macd?.histogram || null,
          shortEma: technicalData.shortEma || null,
          longEma: technicalData.longEma || null,
          volumeRatioSignal: signalData.volumeRatioSignal,
          rsiSignal: signalData.rsiSignal,
          macdSignal: signalData.macdSignal,
          emaSignal: signalData.emaSignal,
          combinedSignal: signalData.combinedSignal,
          signalStrength: signalData.signalStrength,
          recommendationType: signalData.recommendationType,
          analysisTime: new Date()
        });
        
        analysisCount++;
        console.log(`完成 ${crypto.symbol} 的分析，信号: ${signalData.combinedSignal}`);
      } catch (e) {
        console.error(`分析加密货币ID ${ratio.cryptocurrencyId} 时出错:`, e);
      }
    }
    
    console.log(`技术分析批次 #${batchId} 完成，分析了 ${analysisCount} 个加密货币`);
    
    // 更新批次中的条目计数
    await db.update(technicalAnalysisBatches)
      .set({ entriesCount: analysisCount })
      .where(eq(technicalAnalysisBatches.id, batchId));
    
    return { batchId, entriesCount: analysisCount };
  } catch (error) {
    console.error('执行技术分析时出错:', error);
    throw error;
  }
}

// 获取最新技术分析结果
export async function getLatestTechnicalAnalysis(signal?: string, limit: number = 10) {
  try {
    // 获取最新批次
    const latestBatch = await db.query.technicalAnalysisBatches.findFirst({
      orderBy: desc(technicalAnalysisBatches.createdAt)
    });
    
    if (!latestBatch) {
      return { batch: null, entries: [] };
    }
    
    // 构建查询条件
    let whereClause = eq(technicalAnalysisEntries.batchId, latestBatch.id);
    
    // 如果指定了信号类型，则添加额外的过滤条件
    if (signal) {
      whereClause = and(
        whereClause,
        eq(technicalAnalysisEntries.combinedSignal, signal)
      );
    }
    
    // 获取条目
    const entries = await db.query.technicalAnalysisEntries.findMany({
      where: whereClause,
      orderBy: [
        desc(technicalAnalysisEntries.signalStrength),
        desc(technicalAnalysisEntries.volumeToMarketCapRatio)
      ],
      limit
    });
    
    return { batch: latestBatch, entries };
  } catch (error) {
    console.error('获取最新技术分析时出错:', error);
    throw error;
  }
}

// 获取技术分析批次
export async function getTechnicalAnalysisBatches(limit: number = 10) {
  try {
    const batches = await db.query.technicalAnalysisBatches.findMany({
      orderBy: desc(technicalAnalysisBatches.createdAt),
      limit
    });
    
    return batches;
  } catch (error) {
    console.error('获取技术分析批次时出错:', error);
    throw error;
  }
}

// 根据批次ID获取技术分析结果
export async function getTechnicalAnalysisByBatchId(batchId: number, signal?: string, limit: number = 50) {
  try {
    // 获取批次
    const batch = await db.query.technicalAnalysisBatches.findFirst({
      where: eq(technicalAnalysisBatches.id, batchId)
    });
    
    if (!batch) {
      return { batch: null, entries: [] };
    }
    
    // 构建查询条件
    let whereClause = eq(technicalAnalysisEntries.batchId, batchId);
    
    // 如果指定了信号类型，则添加额外的过滤条件
    if (signal) {
      whereClause = and(
        whereClause,
        eq(technicalAnalysisEntries.combinedSignal, signal)
      );
    }
    
    // 获取条目
    const entries = await db.query.technicalAnalysisEntries.findMany({
      where: whereClause,
      orderBy: [
        desc(technicalAnalysisEntries.signalStrength),
        desc(technicalAnalysisEntries.volumeToMarketCapRatio)
      ],
      limit
    });
    
    return { batch, entries };
  } catch (error) {
    console.error(`获取批次ID ${batchId} 的技术分析时出错:`, error);
    throw error;
  }
}

// 手动执行技术分析 (用于测试)
export async function manualRunTechnicalAnalysis() {
  console.log('开始手动执行技术分析...');
  try {
    const { batchId, entriesCount } = await runTechnicalAnalysis();
    return { success: true, batchId, entriesCount };
  } catch (error) {
    console.error('手动执行技术分析时出错:', error);
    return { success: false, error: parseError(error) };
  }
}

// 解析错误消息
export function parseError(error: any): string {
  if (typeof error === 'string') return error;
  if (error instanceof Error) return error.message;
  return JSON.stringify(error);
}