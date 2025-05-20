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

// 从CryptoCompare获取历史价格数据
async function fetchHistoricalPrices(symbol: string, timeframe: string = '1h', limit: number = 100): Promise<PriceData[]> {
  try {
    // 尝试从CryptoCompare获取OHLCV数据
    const response = await axios.get(`https://min-api.cryptocompare.com/data/v2/histo${timeframe.endsWith('d') ? 'day' : timeframe}`, {
      params: {
        fsym: symbol,
        tsym: 'USD',
        limit, // 获取最近的N个数据点
        api_key: process.env.CRYPTOCOMPARE_API_KEY || ''
      }
    });

    if (response.data && response.data.Response === 'Success' && response.data.Data && response.data.Data.Data) {
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
    console.error(`获取${symbol}历史价格失败:`, error);
    // 尝试备用API
    try {
      // 尝试从CoinGecko获取价格历史
      const days = timeframe === '1d' ? 100 : timeframe === '4h' ? 25 : 5;
      const response = await axios.get(`https://api.coingecko.com/api/v3/coins/${symbol.toLowerCase()}/market_chart`, {
        params: {
          vs_currency: 'usd',
          days,
          interval: timeframe === '1d' ? 'daily' : null
        }
      });

      if (response.data && response.data.prices) {
        return response.data.prices.map((p: [number, number]) => ({
          timestamp: p[0], // 毫秒时间戳
          close: p[1]
        }));
      }
      
      throw new Error('Invalid data format from CoinGecko');
    } catch (geckoError) {
      console.error(`CoinGecko备用API失败:`, geckoError);
      // 最后尝试CoinCap API
      try {
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
          }
        });

        if (response.data && response.data.data) {
          return response.data.data.map((d: any) => ({
            timestamp: new Date(d.time).getTime(),
            close: parseFloat(d.priceUsd)
          }));
        }
        
        throw new Error('Invalid data format from CoinCap');
      } catch (coincapError) {
        console.error(`所有API获取价格历史失败:`, coincapError);
        return []; // 所有API都失败，返回空数组
      }
    }
  }
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
  if (rsi < RSI_OVERSOLD) {
    return 'buy'; // RSI低于30，超卖信号
  } else if (rsi > RSI_OVERBOUGHT) {
    return 'sell'; // RSI高于70，超买信号
  } else if (previousRSI && previousRSI < RSI_OVERSOLD && rsi >= RSI_OVERSOLD) {
    return 'buy'; // RSI从超卖区间回升，买入信号
  } else if (previousRSI && previousRSI > RSI_OVERBOUGHT && rsi <= RSI_OVERBOUGHT) {
    return 'sell'; // RSI从超买区间回落，卖出信号
  }
  return 'neutral';
}

// 从MACD获取信号
function getMACDSignal(macd: { macdLine: number, signalLine: number, histogram: number }): 'buy' | 'sell' | 'neutral' {
  if (macd.histogram > 0 && macd.macdLine > macd.signalLine) {
    return 'buy'; // MACD快线上穿慢线且柱状图为正，买入信号
  } else if (macd.histogram < 0 && macd.macdLine < macd.signalLine) {
    return 'sell'; // MACD快线下穿慢线且柱状图为负，卖出信号
  }
  return 'neutral';
}

// 从EMA获取信号
function getEMASignal(shortEma: number, longEma: number): 'buy' | 'sell' | 'neutral' {
  if (shortEma > longEma) {
    return 'buy'; // 短期EMA上穿长期EMA，形成金叉，买入信号
  } else if (shortEma < longEma) {
    return 'sell'; // 短期EMA下穿长期EMA，形成死叉，卖出信号
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
    const limit = 30; // 限制分析的币种数量，以避免API限制
    
    for (let i = 0; i < Math.min(ratios.length, limit); i++) {
      const ratio = ratios[i];
      
      // 获取加密货币详情
      const [crypto] = await db.select()
        .from(cryptocurrencies)
        .where(eq(cryptocurrencies.id, ratio.cryptocurrencyId));

      if (!crypto) continue;

      console.log(`5:${new Date().getMinutes()}:${new Date().getSeconds()} AM [technical-analysis] 分析 ${crypto.symbol} (${crypto.name})`);

      // 计算技术指标
      const technicalData = await calculateTechnicalIndicators(crypto.symbol, timeframe);
      
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
      
      entries.push(entry);
    }
    
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