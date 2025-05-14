/**
 * 异步交易量市值比率分析器
 * 使用异步并发请求方式一次性获取所有加密货币的数据
 * 通过降低API请求频率和批量处理避免被限制
 */

import axios from 'axios';
import { storage } from '../storage';
import { InsertVolumeToMarketCapBatch, InsertVolumeToMarketCapRatio } from '@shared/schema';
import { log } from '../vite';
import asyncPool from 'tiny-async-pool';
import * as cheerio from 'cheerio';

// API密钥
const CRYPTOCOMPARE_API_KEY = process.env.CRYPTOCOMPARE_API_KEY;
const COINMARKETCAP_API_KEY = process.env.COINMARKETCAP_API_KEY;
const COINAPI_KEY = process.env.COINAPI_KEY;
const COINLAYER_API_KEY = process.env.COINLAYER_API_KEY;

// API基础URL
const COINGECKO_BASE = "https://api.coingecko.com/api/v3";
const COINCAP_BASE = "https://api.coincap.io/v2";
const CRYPTOCOMPARE_BASE = "https://min-api.cryptocompare.com/data";
const COINMARKETCAP_BASE = "https://pro-api.coinmarketcap.com/v1";
const COINAPI_BASE = "https://rest.coinapi.io/v1";
const COINLAYER_BASE = "https://api.coinlayer.com";

// 常量
const DELAY_BETWEEN_REQUESTS = 300; // 请求间隔(毫秒)
const CONCURRENT_REQUESTS = 5; // 并发请求数
const MAX_RETRIES = 3; // 最大重试次数
const MIN_MARKET_CAP_USD = 1000000; // 最小市值(USD)
const STABLECOIN_SYMBOLS = ['USDT', 'USDC', 'BUSD', 'DAI', 'TUSD', 'UST', 'USDP', 'GUSD', 'FRAX']; // 稳定币符号

// 工具函数
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// 解析数字字符串(处理K, M, B, T后缀)
function parseNumber(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null;
  
  // 如果已经是数字，直接返回
  if (typeof value === 'number') return value;
  
  // 清理字符串
  let cleanValue = String(value)
    .replace(/[^\d.KMBTkmbt]/g, '')  // 移除非数字、小数点和单位字符
    .trim();
  
  if (cleanValue === '') return null;
  
  // 检查单位并相应缩放
  let multiplier = 1;
  const lastChar = cleanValue.slice(-1).toUpperCase();
  
  if (lastChar === 'K') {
    multiplier = 1000;
    cleanValue = cleanValue.slice(0, -1);
  } else if (lastChar === 'M') {
    multiplier = 1000000;
    cleanValue = cleanValue.slice(0, -1);
  } else if (lastChar === 'B') {
    multiplier = 1000000000;
    cleanValue = cleanValue.slice(0, -1);
  } else if (lastChar === 'T') {
    multiplier = 1000000000000;
    cleanValue = cleanValue.slice(0, -1);
  }
  
  // 转换为数字并应用乘数
  const numValue = parseFloat(cleanValue);
  return isNaN(numValue) ? null : numValue * multiplier;
}

/**
 * CoinGecko API类
 * 使用异步方式获取所有市值排名靠前的加密货币
 */
class CoinGeckoAPI {
  private async fetchWithRetry(url: string, params: any, retries = MAX_RETRIES) {
    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        await delay(DELAY_BETWEEN_REQUESTS * (attempt + 1)); // 指数退避
        const response = await axios.get(url, { params });
        return response.data;
      } catch (error) {
        log(`CoinGecko API请求失败(尝试${attempt + 1}/${retries}): ${error.message}`, 'async-ratio');
        if (attempt === retries - 1) throw error;
      }
    }
  }
  
  /**
   * 分页获取币种列表
   */
  async fetchMarkets(page: number, perPage = 250) {
    const url = `${COINGECKO_BASE}/coins/markets`;
    const params = {
      vs_currency: "usd",
      order: "market_cap_desc",
      per_page: perPage,
      page: page,
      sparkline: false,
      price_change_percentage: "7d"
    };
    
    try {
      return await this.fetchWithRetry(url, params);
    } catch (error) {
      log(`CoinGecko分页请求失败: ${error.message}`, 'async-ratio');
      return [];
    }
  }
  
  /**
   * 获取单个币种的7天交易量数据
   */
  async fetch7dVolume(coinId: string) {
    const url = `${COINGECKO_BASE}/coins/${coinId}/market_chart`;
    const params = { vs_currency: "usd", days: 7 };
    
    try {
      const data = await this.fetchWithRetry(url, params);
      const volumes = data?.total_volumes || [];
      
      if (volumes.length === 0) return null;
      
      // 计算7天平均
      const volumeValues = volumes.map(v => v[1]);
      return volumeValues.reduce((sum, vol) => sum + vol, 0) / volumeValues.length;
    } catch (error) {
      log(`获取${coinId}的7天交易量失败: ${error.message}`, 'async-ratio');
      return null;
    }
  }
  
  /**
   * 一次性获取所有主要币种及其交易量数据
   */
  async getAllCoinVolumeRatios(limit = 500) {
    try {
      // 1. 首先获取尽可能多的币种基本信息
      const totalPages = Math.ceil(limit / 250);
      const pagePromises = [];
      
      // 请求所有页面
      for (let page = 1; page <= totalPages; page++) {
        pagePromises.push(this.fetchMarkets(page));
        await delay(DELAY_BETWEEN_REQUESTS); // 避免触发限制
      }
      
      // 等待所有页面请求完成
      const pagesData = await Promise.all(pagePromises);
      const allCoins = pagesData.flat().slice(0, limit);
      
      log(`从CoinGecko获取到${allCoins.length}个币种的基本信息`, 'async-ratio');
      
      // 2. 过滤掉稳定币
      const filteredCoins = allCoins.filter(coin => 
        !STABLECOIN_SYMBOLS.includes(coin.symbol.toUpperCase()) &&
        coin.market_cap > MIN_MARKET_CAP_USD
      );
      
      log(`过滤后剩余${filteredCoins.length}个非稳定币`, 'async-ratio');
      
      // 3. 对每个币种并发请求7天交易量数据(使用异步池限制并发)
      const results = [];
      
      await asyncPool(CONCURRENT_REQUESTS, filteredCoins, async (coin) => {
        try {
          const avgVolume = coin.total_volume || await this.fetch7dVolume(coin.id);
          
          if (avgVolume && coin.market_cap) {
            const volumeToMarketCapRatio = avgVolume / coin.market_cap;
            
            results.push({
              name: coin.name,
              symbol: coin.symbol.toUpperCase(),
              price: coin.current_price,
              marketCap: coin.market_cap,
              volume24h: coin.total_volume,
              volume7d: avgVolume,
              ratio: volumeToMarketCapRatio,
              rank: results.length + 1
            });
            
            // 定期报告进度
            if (results.length % 20 === 0) {
              log(`已处理${results.length}/${filteredCoins.length}个币种`, 'async-ratio');
            }
          }
        } catch (error) {
          log(`处理${coin.name}(${coin.symbol})时出错: ${error.message}`, 'async-ratio');
        }
        
        await delay(DELAY_BETWEEN_REQUESTS);
      });
      
      // 4. 按交易量市值比率排序
      results.sort((a, b) => b.ratio - a.ratio);
      
      // 更新排名
      results.forEach((item, index) => {
        item.rank = index + 1;
      });
      
      log(`成功从CoinGecko获取并处理了${results.length}个币种的交易量市值比率`, 'async-ratio');
      return results;
    } catch (error) {
      log(`CoinGecko批量获取失败: ${error.message}`, 'async-ratio');
      return [];
    }
  }
}

/**
 * CoinCap API类
 */
class CoinCapAPI {
  async getAllCoins(limit = 2000) {
    try {
      const response = await axios.get(`${COINCAP_BASE}/assets`, {
        params: { limit }
      });
      
      const coins = response.data.data;
      log(`从CoinCap获取到${coins.length}个币种`, 'async-ratio');
      
      const filteredCoins = coins.filter(coin => 
        !STABLECOIN_SYMBOLS.includes(coin.symbol) &&
        parseFloat(coin.marketCapUsd) > MIN_MARKET_CAP_USD
      );
      
      // 转换为标准格式
      const results = filteredCoins.map(coin => {
        const marketCap = parseFloat(coin.marketCapUsd);
        const volume24h = parseFloat(coin.volumeUsd24Hr);
        const ratio = volume24h / marketCap;
        
        return {
          name: coin.name,
          symbol: coin.symbol,
          price: parseFloat(coin.priceUsd),
          marketCap,
          volume24h,
          volume7d: volume24h * 7, // 简单估算7天交易量
          ratio,
          rank: 0 // 将在排序后更新
        };
      });
      
      // 排序并更新排名
      results.sort((a, b) => b.ratio - a.ratio);
      results.forEach((item, index) => {
        item.rank = index + 1;
      });
      
      log(`成功从CoinCap处理了${results.length}个币种的数据`, 'async-ratio');
      return results;
    } catch (error) {
      log(`CoinCap API请求失败: ${error.message}`, 'async-ratio');
      return [];
    }
  }
}

/**
 * CryptoCompare API类
 */
class CryptoCompareAPI {
  async getTopCoins(limit = 2000) {
    try {
      const response = await axios.get(`${CRYPTOCOMPARE_BASE}/top/mktcapfull`, {
        params: {
          limit,
          tsym: 'USD',
          api_key: CRYPTOCOMPARE_API_KEY
        }
      });
      
      const coins = response.data.Data;
      log(`从CryptoCompare获取到${coins.length}个币种`, 'async-ratio');
      
      const results = [];
      
      for (const coin of coins) {
        const rawData = coin.RAW?.USD;
        if (!rawData) continue;
        
        const symbol = coin.CoinInfo.Name;
        if (STABLECOIN_SYMBOLS.includes(symbol)) continue;
        
        const marketCap = rawData.MKTCAP;
        if (marketCap < MIN_MARKET_CAP_USD) continue;
        
        const volume24h = rawData.VOLUME24HOUR;
        const ratio = volume24h / marketCap;
        
        results.push({
          name: coin.CoinInfo.FullName,
          symbol,
          price: rawData.PRICE,
          marketCap,
          volume24h,
          volume7d: volume24h * 7, // 估算
          ratio,
          rank: 0
        });
      }
      
      // 排序并更新排名
      results.sort((a, b) => b.ratio - a.ratio);
      results.forEach((item, index) => {
        item.rank = index + 1;
      });
      
      log(`成功从CryptoCompare处理了${results.length}个币种的数据`, 'async-ratio');
      return results;
    } catch (error) {
      log(`CryptoCompare API请求失败: ${error.message}`, 'async-ratio');
      return [];
    }
  }
}

/**
 * CoinMarketCap API类
 */
class CoinMarketCapAPI {
  async getTopCoins(limit = 500) {
    if (!COINMARKETCAP_API_KEY) {
      log('未设置CoinMarketCap API密钥', 'async-ratio');
      return [];
    }
    
    try {
      const response = await axios.get(`${COINMARKETCAP_BASE}/cryptocurrency/listings/latest`, {
        headers: {
          'X-CMC_PRO_API_KEY': COINMARKETCAP_API_KEY
        },
        params: {
          limit,
          convert: 'USD'
        }
      });
      
      const coins = response.data.data;
      log(`从CoinMarketCap获取到${coins.length}个币种`, 'async-ratio');
      
      const filteredCoins = coins.filter(coin => 
        !STABLECOIN_SYMBOLS.includes(coin.symbol) &&
        coin.quote.USD.market_cap > MIN_MARKET_CAP_USD
      );
      
      const results = filteredCoins.map(coin => {
        const marketCap = coin.quote.USD.market_cap;
        const volume24h = coin.quote.USD.volume_24h;
        const ratio = volume24h / marketCap;
        
        return {
          name: coin.name,
          symbol: coin.symbol,
          price: coin.quote.USD.price,
          marketCap,
          volume24h,
          volume7d: volume24h * 7, // 估算
          ratio,
          rank: 0
        };
      });
      
      // 排序并更新排名
      results.sort((a, b) => b.ratio - a.ratio);
      results.forEach((item, index) => {
        item.rank = index + 1;
      });
      
      log(`成功从CoinMarketCap处理了${results.length}个币种的数据`, 'async-ratio');
      return results;
    } catch (error) {
      log(`CoinMarketCap API请求失败: ${error.message}`, 'async-ratio');
      return [];
    }
  }
}

/**
 * CoinAPI.io API类
 */
class CoinAPIio {
  async getTopCoins() {
    if (!COINAPI_KEY) {
      log('未设置CoinAPI密钥', 'async-ratio');
      return [];
    }
    
    try {
      // 获取所有资产
      const assetsResponse = await axios.get(`${COINAPI_BASE}/assets`, {
        headers: { 'X-CoinAPI-Key': COINAPI_KEY }
      });
      
      // 获取24小时交易量数据
      const volumeResponse = await axios.get(`${COINAPI_BASE}/ohlcv/BITSTAMP_SPOT_BTC_USD/latest?period_id=1DAY`, {
        headers: { 'X-CoinAPI-Key': COINAPI_KEY }
      });
      
      // 处理数据...
      // 注意：CoinAPI的数据结构较为复杂，可能需要多个请求来获取完整数据
      log('CoinAPI实现未完成', 'async-ratio');
      return [];
    } catch (error) {
      log(`CoinAPI请求失败: ${error.message}`, 'async-ratio');
      return [];
    }
  }
}

/**
 * CoinLayer API类
 */
class CoinLayerAPI {
  async getTopCoins() {
    if (!COINLAYER_API_KEY) {
      log('未设置CoinLayer API密钥', 'async-ratio');
      return [];
    }
    
    try {
      // 获取币种列表
      const listResponse = await axios.get(`${COINLAYER_BASE}/list`, {
        params: { access_key: COINLAYER_API_KEY }
      });
      
      // 获取实时价格
      const liveResponse = await axios.get(`${COINLAYER_BASE}/live`, {
        params: { access_key: COINLAYER_API_KEY }
      });
      
      // CoinLayer免费计划不提供交易量数据
      log('CoinLayer免费计划不提供交易量数据', 'async-ratio');
      return [];
    } catch (error) {
      log(`CoinLayer API请求失败: ${error.message}`, 'async-ratio');
      return [];
    }
  }
}

/**
 * 合并多个数据源的结果
 */
function mergeResults(results: any[][]): any[] {
  // 创建币种符号到数据的映射
  const coinMap = new Map();
  
  // 合并所有数据源
  for (const sourceResults of results) {
    for (const coin of sourceResults) {
      const key = coin.symbol.toUpperCase();
      
      if (!coinMap.has(key)) {
        coinMap.set(key, coin);
      } else {
        // 如果已存在，取平均值或选择非空值
        const existing = coinMap.get(key);
        
        existing.price = existing.price || coin.price;
        existing.marketCap = existing.marketCap || coin.marketCap;
        existing.volume24h = existing.volume24h || coin.volume24h;
        existing.volume7d = existing.volume7d || coin.volume7d;
        
        // 重新计算比率
        if (existing.marketCap && existing.volume24h) {
          existing.ratio = existing.volume24h / existing.marketCap;
        }
      }
    }
  }
  
  // 转换回数组并排序
  const mergedResults = Array.from(coinMap.values());
  mergedResults.sort((a, b) => b.ratio - a.ratio);
  
  // 更新排名
  mergedResults.forEach((item, index) => {
    item.rank = index + 1;
  });
  
  return mergedResults;
}

/**
 * 运行异步交易量市值比率分析
 */
export async function runAsyncRatioAnalysis(): Promise<{ success: boolean, batchId?: number, count?: number, error?: string }> {
  try {
    log('开始执行异步交易量市值比率分析...', 'async-ratio');
    
    // 并行获取多个数据源的数据
    const coinGecko = new CoinGeckoAPI();
    const coinCap = new CoinCapAPI();
    const cryptoCompare = new CryptoCompareAPI();
    const coinMarketCap = new CoinMarketCapAPI();
    
    // 并行请求所有数据源
    const [geckoResults, capResults, compareResults, cmcResults] = await Promise.all([
      coinGecko.getAllCoinVolumeRatios(500).catch(e => {
        log(`CoinGecko分析失败: ${e.message}`, 'async-ratio');
        return [];
      }),
      coinCap.getAllCoins(1000).catch(e => {
        log(`CoinCap分析失败: ${e.message}`, 'async-ratio');
        return [];
      }),
      cryptoCompare.getTopCoins(1000).catch(e => {
        log(`CryptoCompare分析失败: ${e.message}`, 'async-ratio');
        return [];
      }),
      coinMarketCap.getTopCoins(500).catch(e => {
        log(`CoinMarketCap分析失败: ${e.message}`, 'async-ratio');
        return [];
      })
    ]);
    
    log(`获取结果: CoinGecko=${geckoResults.length}, CoinCap=${capResults.length}, CryptoCompare=${compareResults.length}, CoinMarketCap=${cmcResults.length}`, 'async-ratio');
    
    // 合并结果
    const allResults = mergeResults([
      geckoResults, 
      capResults, 
      compareResults,
      cmcResults
    ]);
    
    if (allResults.length === 0) {
      log('所有API源都返回了空结果', 'async-ratio');
      return { success: false, error: '所有API源都返回了空结果' };
    }
    
    log(`合并后共有${allResults.length}个币种的交易量市值比率数据`, 'async-ratio');
    
    // 创建批次
    const batch = await storage.createVolumeToMarketCapBatch({
      createdAt: new Date(),
      totalItems: allResults.length,
      source: 'async-api-aggregator'
    });
    
    log(`创建了批次#${batch.id}`, 'async-ratio');
    
    // 保存所有比率数据
    for (const result of allResults) {
      await storage.createVolumeToMarketCapRatio({
        batchId: batch.id,
        name: result.name,
        symbol: result.symbol,
        rank: result.rank,
        price: result.price,
        marketCap: result.marketCap,
        volume24h: result.volume24h,
        volume7d: result.volume7d || result.volume24h * 7,
        volumeToMarketCapRatio: result.ratio,
        createdAt: new Date()
      });
    }
    
    log(`成功保存了${allResults.length}个交易量市值比率到批次#${batch.id}`, 'async-ratio');
    
    return { 
      success: true, 
      batchId: batch.id, 
      count: allResults.length 
    };
  } catch (error) {
    log(`异步交易量市值比率分析出错: ${error.message}`, 'async-ratio');
    return { 
      success: false, 
      error: error.message 
    };
  }
}