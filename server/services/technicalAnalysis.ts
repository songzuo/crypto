/**
 * 技术分析服务
 * 基于交易量市值比率、RSI、MACD和EMA提供买卖推荐
 */

import axios from 'axios';
import { db } from '../db';
import { eq, desc, and, gte, or } from 'drizzle-orm';
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
  macd?: {
    macdLine: number;
    signalLine: number;
    histogram: number;
  };
  shortEma?: number;
  longEma?: number;
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

// 配置参数
const VOLUME_RATIO_BUY_THRESHOLD = 0.2; // 交易量市值比率大于20%为买入信号
const VOLUME_RATIO_SELL_THRESHOLD = 0.05; // 交易量市值比率低于5%为卖出信号
const RSI_OVERSOLD = 30; // RSI低于30为超卖
const RSI_OVERBOUGHT = 70; // RSI高于70为超买
const RSI_PERIOD = 14; // RSI周期
const MACD_FAST_PERIOD = 12; // MACD快线周期
const MACD_SLOW_PERIOD = 26; // MACD慢线周期
const MACD_SIGNAL_PERIOD = 9; // MACD信号线周期
const SHORT_EMA_PERIOD = 9; // 短期EMA周期
const LONG_EMA_PERIOD = 21; // 长期EMA周期

// 计算相对强弱指数 (RSI)
function calculateRSI(prices: number[], period: number = RSI_PERIOD): number {
  if (prices.length < period + 1) {
    return 50; // 默认值，数据不足
  }

  let gains = 0;
  let losses = 0;

  for (let i = 1; i <= period; i++) {
    const difference = prices[prices.length - i] - prices[prices.length - i - 1];
    if (difference >= 0) {
      gains += difference;
    } else {
      losses -= difference;
    }
  }

  if (losses === 0) {
    return 100; // 全是上涨，RSI=100
  }

  const rs = gains / losses;
  return 100 - (100 / (1 + rs));
}

// 计算指数移动平均线 (EMA)
function calculateEMA(prices: number[], period: number): number {
  if (prices.length < period) {
    return prices[prices.length - 1]; // 数据不足时返回最后一个价格
  }

  const k = 2 / (period + 1);
  let ema = prices.slice(0, period).reduce((sum, price) => sum + price, 0) / period;

  for (let i = period; i < prices.length; i++) {
    ema = prices[i] * k + ema * (1 - k);
  }

  return ema;
}

// 计算MACD
function calculateMACD(prices: number[], fastPeriod: number = MACD_FAST_PERIOD, slowPeriod: number = MACD_SLOW_PERIOD, signalPeriod: number = MACD_SIGNAL_PERIOD) {
  if (prices.length < slowPeriod + signalPeriod) {
    return {
      macdLine: 0,
      signalLine: 0,
      histogram: 0
    };
  }

  const fastEMA = calculateEMA(prices, fastPeriod);
  const slowEMA = calculateEMA(prices, slowPeriod);

  const macdLine = fastEMA - slowEMA;

  // 计算历史MACD线以生成信号线
  const macdLines = [];
  for (let i = prices.length - (slowPeriod + signalPeriod); i < prices.length; i++) {
    const priceSlice = prices.slice(0, i + 1);
    const fastSliceEMA = calculateEMA(priceSlice, fastPeriod);
    const slowSliceEMA = calculateEMA(priceSlice, slowPeriod);
    macdLines.push(fastSliceEMA - slowSliceEMA);
  }

  const signalLine = calculateEMA(macdLines, signalPeriod);
  const histogram = macdLine - signalLine;

  return {
    macdLine,
    signalLine,
    histogram
  };
}

// 从多个数据源获取历史价格数据
async function fetchHistoricalPrices(symbol: string, timeframe: string = '1h', limit: number = 100): Promise<PriceData[]> {
  // 添加随机延迟，防止所有请求同时发出
  const addRandomDelay = async () => {
    const delay = Math.floor(Math.random() * 500) + 100; // 100-600ms的随机延迟
    return new Promise(resolve => setTimeout(resolve, delay));
  };
  
  // 设置重试参数
  const maxRetries = 3;
  const retryDelay = 1000; // 初始重试延迟1秒
  
  // 从CryptoCompare获取数据的函数
  const fetchFromCryptoCompare = async (retryCount = 0): Promise<PriceData[]> => {
    try {
      await addRandomDelay();
      console.log(`尝试从CryptoCompare获取${symbol}的价格数据 (尝试 ${retryCount + 1}/${maxRetries})`);
      
      const response = await axios.get(`https://min-api.cryptocompare.com/data/v2/histo${timeframe.endsWith('d') ? 'day' : timeframe}`, {
        params: {
          fsym: symbol,
          tsym: 'USD',
          limit, // 获取最近的N个数据点
          api_key: process.env.CRYPTOCOMPARE_API_KEY || ''
        },
        timeout: 5000 // 5秒超时
      });

      if (response.data && response.data.Response === 'Success' && response.data.Data && response.data.Data.Data) {
        console.log(`成功从CryptoCompare获取${symbol}的价格数据`);
        return response.data.Data.Data.map((d: any) => ({
          timestamp: d.time * 1000, // 转换为毫秒
          close: d.close,
          high: d.high,
          low: d.low,
          open: d.open,
          volume: d.volumefrom
        }));
      }
      
      throw new Error('Invalid data format from CryptoCompare');
    } catch (error) {
      if (retryCount < maxRetries - 1) {
        const nextDelay = retryDelay * Math.pow(2, retryCount); // 指数退避
        console.log(`CryptoCompare获取失败，${nextDelay}ms后重试...`);
        await new Promise(resolve => setTimeout(resolve, nextDelay));
        return fetchFromCryptoCompare(retryCount + 1);
      }
      console.error(`CryptoCompare API获取${symbol}价格历史失败:`, error);
      throw error;
    }
  };
  
  // 从Alpha Vantage获取数据的函数
  const fetchFromAlphaVantage = async (retryCount = 0): Promise<PriceData[]> => {
    try {
      await addRandomDelay();
      console.log(`尝试从Alpha Vantage获取${symbol}的价格数据 (尝试 ${retryCount + 1}/${maxRetries})`);
      
      // 根据时间框架确定函数和间隔
      const interval = timeframe === '1d' ? 'DIGITAL_CURRENCY_DAILY' : 
                      timeframe === '4h' ? 'DIGITAL_CURRENCY_INTRADAY' : 'DIGITAL_CURRENCY_INTRADAY';
      const outputsize = 'full'; // 或 'compact'
      
      const response = await axios.get('https://www.alphavantage.co/query', {
        params: {
          function: interval,
          symbol,
          market: 'USD',
          apikey: process.env.ALPHA_VANTAGE_API_KEY,
          outputsize,
          interval: timeframe === '1d' ? 'daily' : '60min' // Alpha Vantage支持的最小间隔是60分钟
        },
        timeout: 5000
      });
      
      // 解析Alpha Vantage响应
      if (response.data) {
        const timeSeriesKey = timeframe === '1d' ? 'Time Series (Digital Currency Daily)' : 
                              'Time Series (Digital Currency Intraday)';
        
        const timeSeries = response.data[timeSeriesKey];
        if (!timeSeries) {
          throw new Error('No time series data found in Alpha Vantage response');
        }
        
        // 将对象转换为数组并按时间排序
        const result: PriceData[] = [];
        for (const [dateStr, values] of Object.entries(timeSeries)) {
          // Alpha Vantage的时间戳格式不同，需要转换
          const timestamp = new Date(dateStr).getTime();
          result.push({
            timestamp,
            close: parseFloat(values['4a. close (USD)']),
            high: parseFloat(values['2a. high (USD)']),
            low: parseFloat(values['3a. low (USD)']),
            open: parseFloat(values['1a. open (USD)']),
            volume: parseFloat(values['5. volume'])
          });
        }
        
        // 按时间戳降序排序
        result.sort((a, b) => b.timestamp - a.timestamp);
        
        // 只取前limit个
        const limitedResult = result.slice(0, limit);
        console.log(`成功从Alpha Vantage获取${symbol}的价格数据，找到${limitedResult.length}个数据点`);
        return limitedResult;
      }
      
      throw new Error('Invalid data format from Alpha Vantage');
    } catch (error) {
      if (retryCount < maxRetries - 1) {
        const nextDelay = retryDelay * Math.pow(2, retryCount);
        console.log(`Alpha Vantage获取失败，${nextDelay}ms后重试...`);
        await new Promise(resolve => setTimeout(resolve, nextDelay));
        return fetchFromAlphaVantage(retryCount + 1);
      }
      console.error(`Alpha Vantage API获取${symbol}价格历史失败:`, error);
      throw error;
    }
  };
  
  // 从Tiingo获取数据
  const fetchFromTiingo = async (retryCount = 0): Promise<PriceData[]> => {
    try {
      await addRandomDelay();
      console.log(`尝试从Tiingo获取${symbol}的价格数据 (尝试 ${retryCount + 1}/${maxRetries})`);
      
      // 计算起始日期（根据时间框架和限制）
      const endDate = new Date();
      let startDate = new Date();
      if (timeframe === '1d') {
        startDate.setDate(startDate.getDate() - limit);
      } else if (timeframe === '4h') {
        startDate.setHours(startDate.getHours() - (limit * 4));
      } else {
        startDate.setHours(startDate.getHours() - limit);
      }
      
      // 格式化日期为ISO字符串
      const startDateStr = startDate.toISOString().split('T')[0];
      const endDateStr = endDate.toISOString().split('T')[0];
      
      // Tiingo API使用ticker格式，可能需要转换symbol
      // 例如，转换BTC到bitcoin等
      const ticker = symbol.toLowerCase();
      
      const response = await axios.get(`https://api.tiingo.com/tiingo/crypto/prices`, {
        params: {
          tickers: ticker,
          startDate: startDateStr,
          endDate: endDateStr,
          resampleFreq: timeframe === '1d' ? '1day' : 
                        timeframe === '4h' ? '4hour' : '1hour',
          token: process.env.TIINGO_API_KEY
        },
        timeout: 5000
      });
      
      if (response.data && Array.isArray(response.data) && response.data.length > 0) {
        // Tiingo返回的是数组，每个项目包含priceData
        const priceData = response.data[0].priceData;
        if (priceData && priceData.length > 0) {
          const result = priceData.map((item: any) => ({
            timestamp: new Date(item.date).getTime(),
            close: item.close,
            high: item.high,
            low: item.low,
            open: item.open,
            volume: item.volume || 0
          }));
          
          console.log(`成功从Tiingo获取${symbol}的价格数据，找到${result.length}个数据点`);
          return result.slice(0, limit);
        }
      }
      
      throw new Error('Invalid data format from Tiingo');
    } catch (error) {
      if (retryCount < maxRetries - 1) {
        const nextDelay = retryDelay * Math.pow(2, retryCount);
        console.log(`Tiingo获取失败，${nextDelay}ms后重试...`);
        await new Promise(resolve => setTimeout(resolve, nextDelay));
        return fetchFromTiingo(retryCount + 1);
      }
      console.error(`Tiingo API获取${symbol}价格历史失败:`, error);
      throw error;
    }
  };
  
  // 从Finnhub获取数据
  const fetchFromFinnhub = async (retryCount = 0): Promise<PriceData[]> => {
    try {
      await addRandomDelay();
      console.log(`尝试从Finnhub获取${symbol}的价格数据 (尝试 ${retryCount + 1}/${maxRetries})`);
      
      // 计算起始和结束时间（Unix时间戳，秒）
      const endTime = Math.floor(Date.now() / 1000);
      let startTime;
      
      if (timeframe === '1d') {
        startTime = endTime - (limit * 24 * 60 * 60);
      } else if (timeframe === '4h') {
        startTime = endTime - (limit * 4 * 60 * 60);
      } else {
        startTime = endTime - (limit * 60 * 60);
      }
      
      // Finnhub API使用的resolution参数
      const resolution = timeframe === '1d' ? 'D' : 
                        timeframe === '4h' ? '240' : '60';
      
      // 对于加密货币，Finnhub使用特殊格式的符号，如BINANCE:BTCUSDT
      // 这里假设输入的symbol已经是币种名称，需要添加交易所前缀
      const ticker = `BINANCE:${symbol.toUpperCase()}USDT`;
      
      const response = await axios.get('https://finnhub.io/api/v1/crypto/candle', {
        params: {
          symbol: ticker,
          resolution,
          from: startTime,
          to: endTime,
          token: process.env.FINNHUB_API_KEY
        },
        timeout: 5000
      });
      
      if (response.data && response.data.s === 'ok' && Array.isArray(response.data.t)) {
        // Finnhub返回的是分开的数组
        const { t, o, h, l, c, v } = response.data;
        const result: PriceData[] = [];
        
        for (let i = 0; i < t.length; i++) {
          result.push({
            timestamp: t[i] * 1000, // 转换为毫秒
            open: o[i],
            high: h[i],
            low: l[i],
            close: c[i],
            volume: v[i]
          });
        }
        
        console.log(`成功从Finnhub获取${symbol}的价格数据，找到${result.length}个数据点`);
        return result;
      }
      
      throw new Error('Invalid data format from Finnhub');
    } catch (error) {
      if (retryCount < maxRetries - 1) {
        const nextDelay = retryDelay * Math.pow(2, retryCount);
        console.log(`Finnhub获取失败，${nextDelay}ms后重试...`);
        await new Promise(resolve => setTimeout(resolve, nextDelay));
        return fetchFromFinnhub(retryCount + 1);
      }
      console.error(`Finnhub API获取${symbol}价格历史失败:`, error);
      throw error;
    }
  };
  
  // 从CoinGecko获取数据
  const fetchFromCoinGecko = async (retryCount = 0): Promise<PriceData[]> => {
    try {
      await addRandomDelay();
      console.log(`尝试从CoinGecko获取${symbol}的价格数据 (尝试 ${retryCount + 1}/${maxRetries})`);
      
      const days = timeframe === '1d' ? 100 : timeframe === '4h' ? 25 : 5;
      const response = await axios.get(`https://api.coingecko.com/api/v3/coins/${symbol.toLowerCase()}/market_chart`, {
        params: {
          vs_currency: 'usd',
          days,
          interval: timeframe === '1d' ? 'daily' : null
        },
        timeout: 5000
      });

      if (response.data && response.data.prices) {
        const result = response.data.prices.map((p: [number, number]) => ({
          timestamp: p[0], // 毫秒时间戳
          close: p[1]
        }));
        console.log(`成功从CoinGecko获取${symbol}的价格数据，找到${result.length}个数据点`);
        return result;
      }
      
      throw new Error('Invalid data format from CoinGecko');
    } catch (error) {
      if (retryCount < maxRetries - 1) {
        const nextDelay = retryDelay * Math.pow(2, retryCount);
        console.log(`CoinGecko获取失败，${nextDelay}ms后重试...`);
        await new Promise(resolve => setTimeout(resolve, nextDelay));
        return fetchFromCoinGecko(retryCount + 1);
      }
      console.error(`CoinGecko API获取${symbol}价格历史失败:`, error);
      throw error;
    }
  };
  
  // 从CoinCap获取数据
  const fetchFromCoinCap = async (retryCount = 0): Promise<PriceData[]> => {
    try {
      await addRandomDelay();
      console.log(`尝试从CoinCap获取${symbol}的价格数据 (尝试 ${retryCount + 1}/${maxRetries})`);
      
      const interval = timeframe === '1d' ? 'd1' : timeframe === '4h' ? 'h4' : 'h1';
      const response = await axios.get(`https://api.coincap.io/v2/assets/${symbol.toLowerCase()}/history`, {
        params: {
          interval,
          start: Date.now() - (limit * (
            timeframe === '1d' ? 86400000 : 
            timeframe === '4h' ? 14400000 : 
            3600000
          )),
          end: Date.now()
        },
        timeout: 5000
      });

      if (response.data && response.data.data) {
        const result = response.data.data.map((d: any) => ({
          timestamp: new Date(d.time).getTime(),
          close: parseFloat(d.priceUsd)
        }));
        console.log(`成功从CoinCap获取${symbol}的价格数据，找到${result.length}个数据点`);
        return result;
      }
      
      throw new Error('Invalid data format from CoinCap');
    } catch (error) {
      if (retryCount < maxRetries - 1) {
        const nextDelay = retryDelay * Math.pow(2, retryCount);
        console.log(`CoinCap获取失败，${nextDelay}ms后重试...`);
        await new Promise(resolve => setTimeout(resolve, nextDelay));
        return fetchFromCoinCap(retryCount + 1);
      }
      console.error(`CoinCap API获取${symbol}价格历史失败:`, error);
      throw error;
    }
  };
  
  // 主函数：依次尝试所有数据源
  async function tryAllDataSources(): Promise<PriceData[]> {
    const dataSources = [
      { name: 'Alpha Vantage', fetchFn: fetchFromAlphaVantage },
      { name: 'Tiingo', fetchFn: fetchFromTiingo },
      { name: 'Finnhub', fetchFn: fetchFromFinnhub },
      { name: 'CryptoCompare', fetchFn: fetchFromCryptoCompare },
      { name: 'CoinGecko', fetchFn: fetchFromCoinGecko },
      { name: 'CoinCap', fetchFn: fetchFromCoinCap }
    ];
    
    // 依次尝试每个数据源
    for (const source of dataSources) {
      try {
        console.log(`尝试从${source.name}获取${symbol}的价格数据...`);
        const data = await source.fetchFn();
        if (data && data.length > 0) {
          console.log(`成功从${source.name}获取${symbol}的价格数据，共${data.length}个数据点`);
          return data;
        }
        console.log(`从${source.name}获取的数据为空，尝试下一个数据源`);
      } catch (error) {
        console.error(`从${source.name}获取${symbol}价格数据失败:`, error);
        // 继续尝试下一个数据源
      }
    }
    
    // 如果所有数据源都失败，返回空数组
    console.error(`所有数据源获取${symbol}价格数据都失败`);
    return [];
  }
  
  // 执行主函数
  return tryAllDataSources();
}

// 计算所有技术指标
async function calculateTechnicalIndicators(symbol: string, timeframe: string = '1h'): Promise<TechnicalData> {
  try {
    // 从API获取历史价格
    const priceData = await fetchHistoricalPrices(symbol, timeframe);
    
    if (priceData.length === 0) {
      console.warn(`无法获取${symbol}的价格数据，跳过技术分析`);
      return {};
    }

    // 提取收盘价
    const closePrices = priceData.map(data => data.close);
    
    // 计算RSI
    const rsi = calculateRSI(closePrices);
    
    // 计算MACD
    const macd = calculateMACD(closePrices);
    
    // 计算EMA
    const shortEma = calculateEMA(closePrices, SHORT_EMA_PERIOD);
    const longEma = calculateEMA(closePrices, LONG_EMA_PERIOD);
    
    return {
      rsi,
      macd,
      shortEma,
      longEma
    };
  } catch (error) {
    console.error(`计算${symbol}技术指标时出错:`, error);
    return {};
  }
}

// 从交易量市值比率数据中获取信号
function getVolumeRatioSignal(ratio: number): 'buy' | 'sell' | 'neutral' {
  if (ratio >= VOLUME_RATIO_BUY_THRESHOLD) {
    return 'buy';
  } else if (ratio <= VOLUME_RATIO_SELL_THRESHOLD) {
    return 'sell';
  }
  return 'neutral';
}

// 从RSI获取信号
function getRSISignal(rsi: number, previousRSI?: number): 'buy' | 'sell' | 'neutral' {
  // 买入信号：RSI跌至30以下并回升
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
    // 买入信号：MACD快线(DIF)自下向上穿越慢线(DEA)，柱状图转正
    const currentCrossUp = macd.macdLine > macd.signalLine;
    const previousCrossDown = previousMacd.macdLine <= previousMacd.signalLine;
    const histogramTurningPositive = macd.histogram > 0 && previousMacd.histogram <= 0;
    
    if ((currentCrossUp && previousCrossDown) || histogramTurningPositive) {
      return 'buy'; // 金叉信号
    }
    
    // 卖出信号：MACD快线自上向下跌破慢线，柱状图转负
    const currentCrossDown = macd.macdLine < macd.signalLine;
    const previousCrossUp = previousMacd.macdLine >= previousMacd.signalLine;
    const histogramTurningNegative = macd.histogram < 0 && previousMacd.histogram >= 0;
    
    if ((currentCrossDown && previousCrossUp) || histogramTurningNegative) {
      return 'sell'; // 死叉信号
    }
  } 
  // 没有前一周期数据时的简单判断
  else {
    // 简单判断当前快线与慢线的关系和柱状图状态
    if (macd.histogram > 0 && macd.macdLine > macd.signalLine) {
      return 'buy'; // 可能是金叉之后
    } else if (macd.histogram < 0 && macd.macdLine < macd.signalLine) {
      return 'sell'; // 可能是死叉之后
    }
  }
  
  return 'neutral';
}

// 从EMA获取信号 - 判断金叉死叉
function getEMASignal(
  shortEma: number, 
  longEma: number, 
  previousShortEma?: number, 
  previousLongEma?: number
): 'buy' | 'sell' | 'neutral' {
  
  // 有前期数据时的精确金叉/死叉判断
  if (previousShortEma !== undefined && previousLongEma !== undefined) {
    // 短期均线上穿长期均线，金叉
    const currentCrossUp = shortEma > longEma;
    const previousCrossDown = previousShortEma <= previousLongEma;
    
    if (currentCrossUp && previousCrossDown) {
      return 'buy'; // 金叉信号
    }
    
    // 短期均线下穿长期均线，死叉
    const currentCrossDown = shortEma < longEma;
    const previousCrossUp = previousShortEma >= previousLongEma;
    
    if (currentCrossDown && previousCrossUp) {
      return 'sell'; // 死叉信号
    }
  } 
  // 没有前期数据时的简单位置判断
  else {
    if (shortEma > longEma) {
      return 'buy'; // 短期EMA在长期EMA上方
    } else if (shortEma < longEma) {
      return 'sell'; // 短期EMA在长期EMA下方
    }
  }
  
  return 'neutral';
}

// 组合所有信号得出最终推荐
function getCombinedSignal(volumeRatio: number, technicalData: TechnicalData): SignalData {
  // 获取各个指标的信号
  const volumeRatioSignal = getVolumeRatioSignal(volumeRatio);
  
  // 如果无法获取技术指标，则仅基于交易量比率做出决策
  if (!technicalData.rsi && !technicalData.macd && !technicalData.shortEma) {
    return {
      volumeRatioSignal,
      rsiSignal: 'neutral',
      macdSignal: 'neutral',
      emaSignal: 'neutral',
      combinedSignal: volumeRatioSignal === 'buy' ? 'buy' : volumeRatioSignal === 'sell' ? 'sell' : 'neutral',
      signalStrength: volumeRatioSignal === 'neutral' ? 3 : volumeRatioSignal === 'buy' ? 4 : 2,
      recommendationType: 'day_trade' // 默认为日内交易
    };
  }

  const rsiSignal = technicalData.rsi ? getRSISignal(technicalData.rsi) : 'neutral';
  const macdSignal = technicalData.macd ? getMACDSignal(technicalData.macd) : 'neutral';
  const emaSignal = (technicalData.shortEma && technicalData.longEma) ? 
                    getEMASignal(technicalData.shortEma, technicalData.longEma) : 
                    'neutral';

  // 计算买入和卖出信号数量
  let buySignals = 0;
  let sellSignals = 0;

  if (volumeRatioSignal === 'buy') buySignals++;
  if (volumeRatioSignal === 'sell') sellSignals++;
  
  if (rsiSignal === 'buy') buySignals++;
  if (rsiSignal === 'sell') sellSignals++;
  
  if (macdSignal === 'buy') buySignals++;
  if (macdSignal === 'sell') sellSignals++;
  
  if (emaSignal === 'buy') buySignals++;
  if (emaSignal === 'sell') sellSignals++;

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

// 运行技术分析并存储到数据库
export async function runTechnicalAnalysis(timeframe: string = '1h'): Promise<{ batchId: number, entriesCount: number }> {
  console.log(`5:${new Date().getMinutes()}:${new Date().getSeconds()} AM [technical-analysis] 开始执行技术分析...`);
  try {
    // 获取最新的交易量市值比率批次
    const [latestBatch] = await db.select()
      .from(volumeToMarketCapBatches)
      .orderBy(desc(volumeToMarketCapBatches.id))
      .limit(1);

    if (!latestBatch) {
      throw new Error('找不到最新的交易量市值比率批次');
    }

    console.log(`5:${new Date().getMinutes()}:${new Date().getSeconds()} AM [technical-analysis] 使用交易量市值比率批次 #${latestBatch.id}`);

    // 获取此批次中的所有比率数据
    const ratios = await db.select()
      .from(volumeToMarketCapRatios)
      .where(eq(volumeToMarketCapRatios.batchId, latestBatch.id))
      .orderBy(desc(volumeToMarketCapRatios.volumeToMarketCapRatio));

    console.log(`5:${new Date().getMinutes()}:${new Date().getSeconds()} AM [technical-analysis] 找到 ${ratios.length} 个交易量市值比率记录`);

    // 创建新的技术分析批次
    const [newBatch] = await db.insert(technicalAnalysisBatches)
      .values({
        entriesCount: 0, // 暂时设为0，稍后更新
        timeframe,
        description: `技术分析 (${timeframe}) - 基于交易量市值比率批次 #${latestBatch.id}`,
        volumeRatioBatchId: latestBatch.id
      })
      .returning();

    console.log(`5:${new Date().getMinutes()}:${new Date().getSeconds()} AM [technical-analysis] 创建了新的技术分析批次 #${newBatch.id}`);

    // 分析每个加密货币并存储结果
    const entries = [];
    const limit = 100; // 增加分析币种的数量以获得更全面的结果
    
    // 添加对已处理加密货币的计数
    let successCount = 0;
    let errorCount = 0;
    
    console.log(`5:${new Date().getMinutes()}:${new Date().getSeconds()} AM [technical-analysis] 开始处理最多 ${limit} 个加密货币`);
    
    // 为数据收集添加并发限制，避免一次性发送太多请求
    const chunkSize = 5; // 每批处理的币种数量
    for (let i = 0; i < Math.min(ratios.length, limit); i += chunkSize) {
      const currentChunk = ratios.slice(i, i + chunkSize);
      
      // 使用Promise.all并发处理一小批加密货币，但仍保持批次较小以避免API限制
      const chunkPromises = currentChunk.map(async (ratio) => {
        try {
          // 获取加密货币详情
          const [crypto] = await db.select()
            .from(cryptocurrencies)
            .where(eq(cryptocurrencies.id, ratio.cryptocurrencyId));
    
          if (!crypto) return null;
    
          console.log(`5:${new Date().getMinutes()}:${new Date().getSeconds()} AM [technical-analysis] 分析 ${crypto.symbol} (${crypto.name})`);
    
          // 计算技术指标
          const technicalData = await calculateTechnicalIndicators(crypto.symbol, timeframe);
          
          // 检查是否成功获取了技术指标数据
          if (!technicalData || (
              !technicalData.rsi && 
              (!technicalData.macd || !technicalData.macd.macdLine) && 
              !technicalData.shortEma
          )) {
            console.log(`技术分析: ${crypto.symbol} 没有足够的技术指标数据，跳过`);
            errorCount++;
            return null;
          }
          
          // 获取综合信号
          const signalData = getCombinedSignal(ratio.volumeToMarketCapRatio, technicalData);
          
          // 创建新的技术分析记录
          const entry = {
            batchId: newBatch.id,
            cryptocurrencyId: crypto.id,
            name: crypto.name,
            symbol: crypto.symbol,
            // 交易量市值比率相关
            volumeToMarketCapRatio: ratio.volumeToMarketCapRatio,
            volumeRatioSignal: signalData.volumeRatioSignal,
            // RSI相关
            rsiValue: technicalData.rsi,
            rsiSignal: signalData.rsiSignal,
            // MACD相关
            macdLine: technicalData.macd?.macdLine,
            signalLine: technicalData.macd?.signalLine,
            histogram: technicalData.macd?.histogram,
            macdSignal: signalData.macdSignal,
            // EMA相关
            shortEma: technicalData.shortEma,
            longEma: technicalData.longEma,
            emaSignal: signalData.emaSignal,
            // 综合分析
            combinedSignal: signalData.combinedSignal,
            signalStrength: signalData.signalStrength,
            recommendationType: signalData.recommendationType
          };
          
          successCount++;
          return entry;
        } catch (error) {
          console.error(`技术分析处理 ${ratio.cryptocurrencyId} 时出错:`, error);
          errorCount++;
          return null;
        }
      });
      
      // 等待当前批次处理完成
      const chunkResults = await Promise.all(chunkPromises);
      
      // 过滤掉null结果并添加到结果集
      entries.push(...chunkResults.filter(entry => entry !== null));
      
      // 在批次之间添加短暂延迟以减轻API压力
      if (i + chunkSize < Math.min(ratios.length, limit)) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    console.log(`5:${new Date().getMinutes()}:${new Date().getSeconds()} AM [technical-analysis] 处理完成。成功: ${successCount}, 失败: ${errorCount}, 总有效条目: ${entries.length}`);
    
    
    // 批量插入分析结果
    if (entries.length > 0) {
      await db.insert(technicalAnalysisEntries).values(entries);
    }
    
    // 更新批次中的记录数
    await db.update(technicalAnalysisBatches)
      .set({ entriesCount: entries.length })
      .where(eq(technicalAnalysisBatches.id, newBatch.id));
    
    console.log(`5:${new Date().getMinutes()}:${new Date().getSeconds()} AM [technical-analysis] 技术分析完成，分析了 ${entries.length} 个加密货币`);
    
    return {
      batchId: newBatch.id,
      entriesCount: entries.length
    };
  } catch (error) {
    console.error('执行技术分析时出错:', error);
    throw error;
  }
}

// 获取最新批次的技术分析结果
export async function getLatestTechnicalAnalysis(signal?: string, limit: number = 10) {
  try {
    // 获取最新的批次
    const [latestBatch] = await db.select()
      .from(technicalAnalysisBatches)
      .orderBy(desc(technicalAnalysisBatches.id))
      .limit(1);
    
    if (!latestBatch) {
      return { batch: null, entries: [] };
    }
    
    // 基本查询
    let entries = await db.select()
      .from(technicalAnalysisEntries)
      .where(eq(technicalAnalysisEntries.batchId, latestBatch.id));
    
    // 如果指定了信号类型，则过滤结果
    if (signal) {
      if (signal === 'buy') {
        entries = entries.filter(entry => entry.combinedSignal === 'buy');
      } else if (signal === 'strong_buy') {
        entries = entries.filter(entry => entry.combinedSignal === 'strong_buy');
      } else if (signal === 'sell') {
        entries = entries.filter(entry => entry.combinedSignal === 'sell');
      } else if (signal === 'strong_sell') {
        entries = entries.filter(entry => entry.combinedSignal === 'strong_sell');
      } else if (signal === 'any_buy') {
        entries = entries.filter(entry => 
          entry.combinedSignal === 'buy' || entry.combinedSignal === 'strong_buy'
        );
      } else if (signal === 'any_sell') {
        entries = entries.filter(entry => 
          entry.combinedSignal === 'sell' || entry.combinedSignal === 'strong_sell'
        );
      }
    }
    
    // 排序并限制结果数量
    entries = entries
      .sort((a, b) => (b.signalStrength || 0) - (a.signalStrength || 0))
      .slice(0, limit);
    
    return {
      batch: latestBatch,
      entries
    };
  } catch (error) {
    console.error('获取最新技术分析结果时出错:', error);
    throw error;
  }
}

// 获取所有技术分析批次
export async function getTechnicalAnalysisBatches(limit: number = 10) {
  try {
    return await db.select()
      .from(technicalAnalysisBatches)
      .orderBy(desc(technicalAnalysisBatches.id))
      .limit(limit);
  } catch (error) {
    console.error('获取技术分析批次时出错:', error);
    throw error;
  }
}

// 此函数已在下方重新定义，删除此处重复声明

// 获取指定批次的技术分析结果
export async function getTechnicalAnalysisByBatchId(batchId: number, signal?: string, limit: number = 50) {
  try {
    // 先获取批次信息
    const [batch] = await db.select()
      .from(technicalAnalysisBatches)
      .where(eq(technicalAnalysisBatches.id, batchId));
    
    if (!batch) {
      return { batch: null, entries: [] };
    }
    
    // 基本查询
    let entries = await db.select()
      .from(technicalAnalysisEntries)
      .where(eq(technicalAnalysisEntries.batchId, batchId));
    
    // 如果指定了信号类型，则过滤结果
    if (signal) {
      if (signal === 'buy') {
        entries = entries.filter(entry => entry.combinedSignal === 'buy');
      } else if (signal === 'strong_buy') {
        entries = entries.filter(entry => entry.combinedSignal === 'strong_buy');
      } else if (signal === 'sell') {
        entries = entries.filter(entry => entry.combinedSignal === 'sell');
      } else if (signal === 'strong_sell') {
        entries = entries.filter(entry => entry.combinedSignal === 'strong_sell');
      } else if (signal === 'any_buy') {
        entries = entries.filter(entry => 
          entry.combinedSignal === 'buy' || entry.combinedSignal === 'strong_buy'
        );
      } else if (signal === 'any_sell') {
        entries = entries.filter(entry => 
          entry.combinedSignal === 'sell' || entry.combinedSignal === 'strong_sell'
        );
      }
    }
    
    // 排序并限制结果数量
    entries = entries
      .sort((a, b) => (b.signalStrength || 0) - (a.signalStrength || 0))
      .slice(0, limit);
    
    return {
      batch,
      entries
    };
  } catch (error) {
    console.error(`获取批次 ${batchId} 的技术分析结果时出错:`, error);
    throw error;
  }
}

// 手动运行技术分析
export async function manualRunTechnicalAnalysis() {
  console.log('手动触发技术分析任务...');
  return await runTechnicalAnalysis('1h');
}

// 解析错误
export function parseError(error: any): string {
  if (error.response) {
    return `API错误: ${error.response.status} - ${error.response.statusText}`;
  } else if (error.request) {
    return '请求错误: 服务器未响应';
  } else {
    return `错误: ${error.message}`;
  }
}