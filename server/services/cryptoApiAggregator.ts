/**
 * 加密货币API聚合器
 * 整合多个加密货币市场数据API源，提高数据获取的可靠性和准确性
 */

import axios from 'axios';
import { log } from '../vite';
import { sleep, parseNumber } from './utils';

/**
 * API返回的加密货币数据接口
 */
export interface ApiCryptoData {
  name: string;
  symbol: string;
  marketCap: number;
  volume24h: number;
  price: number;
  volume7d?: number; // 有些API直接提供7天平均数据
}

/**
 * 从CoinMarketCap API获取加密货币数据
 * @param limit 获取的币种数量上限
 * @returns 加密货币数据数组
 */
export async function fetchFromCoinMarketCapAPI(limit: number = 100): Promise<ApiCryptoData[]> {
  try {
    log(`从CoinMarketCap API获取前${limit}个加密货币数据...`, 'crypto-api');
    
    const response = await axios.get(`https://pro-api.coinmarketcap.com/v1/cryptocurrency/listings/latest`, {
      headers: {
        'X-CMC_PRO_API_KEY': process.env.COINMARKETCAP_API_KEY || 'DEMO-API-KEY',
      },
      params: {
        start: 1,
        limit: limit,
        convert: 'USD'
      }
    });
    
    if (response.data && response.data.data) {
      return response.data.data.map((coin: any) => ({
        name: coin.name,
        symbol: coin.symbol,
        marketCap: coin.quote.USD.market_cap || 0,
        volume24h: coin.quote.USD.volume_24h || 0,
        price: coin.quote.USD.price || 0
      }));
    }
    
    return [];
  } catch (error) {
    log(`从CoinMarketCap API获取数据时出错: ${error instanceof Error ? error.message : 'Unknown error'}`, 'crypto-api');
    return [];
  }
}

/**
 * 从CoinGecko API获取加密货币数据
 * @param page 页码
 * @param perPage 每页数量
 * @returns 加密货币数据数组
 */
export async function fetchFromCoinGeckoAPI(page: number = 1, perPage: number = 100): Promise<ApiCryptoData[]> {
  try {
    log(`从CoinGecko API获取加密货币数据(页码:${page}, 每页:${perPage})...`, 'crypto-api');
    
    const response = await axios.get(`https://api.coingecko.com/api/v3/coins/markets`, {
      params: {
        vs_currency: 'usd',
        order: 'market_cap_desc',
        per_page: perPage,
        page: page,
        sparkline: false,
        price_change_percentage: '24h'
      }
    });
    
    if (response.data && Array.isArray(response.data)) {
      return response.data.map((coin: any) => ({
        name: coin.name,
        symbol: coin.symbol.toUpperCase(),
        marketCap: coin.market_cap || 0,
        volume24h: coin.total_volume || 0,
        price: coin.current_price || 0
      }));
    }
    
    return [];
  } catch (error) {
    log(`从CoinGecko API获取数据时出错: ${error instanceof Error ? error.message : 'Unknown error'}`, 'crypto-api');
    return [];
  }
}

/**
 * 从CryptoCompare API获取加密货币数据
 * @param limit 获取的币种数量上限
 * @returns 加密货币数据数组
 */
export async function fetchFromCryptoCompareAPI(limit: number = 100): Promise<ApiCryptoData[]> {
  try {
    log(`从CryptoCompare API获取前${limit}个加密货币数据...`, 'crypto-api');
    
    // 先获取顶级币种列表
    const topListResponse = await axios.get(`https://min-api.cryptocompare.com/data/top/mktcapfull`, {
      params: {
        limit: limit,
        tsym: 'USD'
      },
      headers: {
        'Authorization': `Apikey ${process.env.CRYPTOCOMPARE_API_KEY || ''}`
      }
    });
    
    if (topListResponse.data && topListResponse.data.Data) {
      return topListResponse.data.Data.map((item: any) => {
        const coinData = item.CoinInfo || {};
        const rawData = item.RAW && item.RAW.USD ? item.RAW.USD : {};
        
        return {
          name: coinData.FullName || coinData.Name || '',
          symbol: coinData.Name || '',
          marketCap: rawData.MKTCAP || 0,
          volume24h: rawData.VOLUME24HOUR || 0,
          price: rawData.PRICE || 0
        };
      });
    }
    
    return [];
  } catch (error) {
    log(`从CryptoCompare API获取数据时出错: ${error instanceof Error ? error.message : 'Unknown error'}`, 'crypto-api');
    return [];
  }
}

/**
 * 从CoinAPI获取加密货币数据
 * @param limit 获取的币种数量上限
 * @returns 加密货币数据数组
 */
export async function fetchFromCoinAPI(limit: number = 100): Promise<ApiCryptoData[]> {
  try {
    log(`从CoinAPI获取加密货币数据...`, 'crypto-api');
    
    // 获取所有资产列表
    const assetsResponse = await axios.get('https://rest.coinapi.io/v1/assets', {
      headers: {
        'X-CoinAPI-Key': process.env.COINAPI_KEY || ''
      }
    });
    
    if (!assetsResponse.data || !Array.isArray(assetsResponse.data)) {
      return [];
    }
    
    // 过滤和处理前N个加密货币
    const cryptoAssets = assetsResponse.data
      .filter((asset: any) => asset.type_is_crypto === 1)
      .sort((a: any, b: any) => (b.volume_1day_usd || 0) - (a.volume_1day_usd || 0))
      .slice(0, limit);
    
    return cryptoAssets.map((asset: any) => ({
      name: asset.name || asset.asset_id,
      symbol: asset.asset_id,
      marketCap: asset.market_cap_usd || 0,
      volume24h: asset.volume_1day_usd || 0,
      price: asset.price_usd || 0
    }));
  } catch (error) {
    log(`从CoinAPI获取数据时出错: ${error instanceof Error ? error.message : 'Unknown error'}`, 'crypto-api');
    return [];
  }
}

/**
 * 从CoinCap API获取加密货币数据
 * @param limit 获取的币种数量上限
 * @returns 加密货币数据数组
 */
export async function fetchFromCoinCapAPI(limit: number = 100): Promise<ApiCryptoData[]> {
  try {
    log(`从CoinCap API获取前${limit}个加密货币数据...`, 'crypto-api');
    
    const response = await axios.get(`https://api.coincap.io/v2/assets`, {
      params: {
        limit: limit
      }
    });
    
    if (response.data && response.data.data && Array.isArray(response.data.data)) {
      return response.data.data.map((asset: any) => ({
        name: asset.name,
        symbol: asset.symbol,
        marketCap: parseFloat(asset.marketCapUsd) || 0,
        volume24h: parseFloat(asset.volumeUsd24Hr) || 0,
        price: parseFloat(asset.priceUsd) || 0
      }));
    }
    
    return [];
  } catch (error) {
    log(`从CoinCap API获取数据时出错: ${error instanceof Error ? error.message : 'Unknown error'}`, 'crypto-api');
    return [];
  }
}

/**
 * 从Coinlayer API获取加密货币数据
 * @param limit 获取的币种数量上限
 * @returns 加密货币数据数组
 */
export async function fetchFromCoinlayerAPI(limit: number = 100): Promise<ApiCryptoData[]> {
  try {
    log(`从Coinlayer API获取加密货币数据...`, 'crypto-api');
    
    // 获取实时价格
    const liveResponse = await axios.get('http://api.coinlayer.com/live', {
      params: {
        access_key: process.env.COINLAYER_API_KEY || ''
      }
    });
    
    // 获取币种列表
    const listResponse = await axios.get('http://api.coinlayer.com/list', {
      params: {
        access_key: process.env.COINLAYER_API_KEY || ''
      }
    });
    
    if (!liveResponse.data || !liveResponse.data.rates || !listResponse.data || !listResponse.data.crypto) {
      return [];
    }
    
    const rates = liveResponse.data.rates;
    const cryptoList = listResponse.data.crypto;
    
    // 组合数据
    const result: ApiCryptoData[] = [];
    for (const symbol in cryptoList) {
      if (Object.prototype.hasOwnProperty.call(rates, symbol)) {
        const cryptoInfo = cryptoList[symbol];
        result.push({
          name: cryptoInfo.name || symbol,
          symbol: symbol,
          marketCap: cryptoInfo.max_supply ? cryptoInfo.max_supply * rates[symbol] : 0,
          volume24h: 0,  // Coinlayer不提供交易量数据
          price: rates[symbol] || 0
        });
      }
      
      // 限制返回的数量
      if (result.length >= limit) break;
    }
    
    return result;
  } catch (error) {
    log(`从Coinlayer API获取数据时出错: ${error instanceof Error ? error.message : 'Unknown error'}`, 'crypto-api');
    return [];
  }
}

/**
 * 从Alchemy API获取加密货币数据
 * @param limit 获取的币种数量上限
 * @returns 加密货币数据数组
 */
export async function fetchFromAlchemyAPI(limit: number = 100): Promise<ApiCryptoData[]> {
  try {
    log(`从Alchemy API获取加密货币数据...`, 'crypto-api');
    // 注意：Alchemy API主要是以太坊相关的API，不直接提供市场数据
    // 此处仅作为一个示例，实际上我们可能需要使用其他接口获取市场数据
    
    // Alchemy的Token API需要你提供具体的合约地址，这里我们可以使用一些预定义的地址
    return [];
  } catch (error) {
    log(`从Alchemy API获取数据时出错: ${error instanceof Error ? error.message : 'Unknown error'}`, 'crypto-api');
    return [];
  }
}

/**
 * 从所有API获取加密货币数据，然后合并去重
 * @param limit 从每个API获取的币种数量上限
 * @returns 合并后的加密货币数据数组
 */
export async function fetchFromAllAPIs(limit: number = 100): Promise<ApiCryptoData[]> {
  log(`从多个API源获取加密货币数据，每个API源获取${limit}个币种...`, 'crypto-api');
  
  // 创建API获取任务
  const tasks = [
    fetchFromCoinMarketCapAPI(limit).catch(err => {
      log(`从CoinMarketCap API获取数据失败: ${err instanceof Error ? err.message : 'Unknown error'}`, 'crypto-api');
      return [];
    }),
    fetchFromCoinGeckoAPI(1, limit).catch(err => {
      log(`从CoinGecko API获取数据失败: ${err instanceof Error ? err.message : 'Unknown error'}`, 'crypto-api');
      return [];
    }),
    fetchFromCryptoCompareAPI(limit).catch(err => {
      log(`从CryptoCompare API获取数据失败: ${err instanceof Error ? err.message : 'Unknown error'}`, 'crypto-api');
      return [];
    }),
    fetchFromCoinCapAPI(limit).catch(err => {
      log(`从CoinCap API获取数据失败: ${err instanceof Error ? err.message : 'Unknown error'}`, 'crypto-api');
      return [];
    }),
    fetchFromCoinAPI(limit).catch(err => {
      log(`从CoinAPI获取数据失败: ${err instanceof Error ? err.message : 'Unknown error'}`, 'crypto-api');
      return [];
    }),
    fetchFromCoinlayerAPI(limit).catch(err => {
      log(`从Coinlayer API获取数据失败: ${err instanceof Error ? err.message : 'Unknown error'}`, 'crypto-api');
      return [];
    })
  ];
  
  // 并行获取数据
  const results = await Promise.all(tasks);
  
  // 所有数据合并
  const allData: ApiCryptoData[] = [];
  results.forEach(dataList => {
    allData.push(...dataList);
  });
  
  // 去重（按symbol去重，保留市值较大的）
  const deduped = new Map<string, ApiCryptoData>();
  
  allData.forEach(crypto => {
    const symbol = crypto.symbol.toUpperCase();
    const existing = deduped.get(symbol);
    
    if (!existing || (crypto.marketCap > existing.marketCap)) {
      deduped.set(symbol, crypto);
    }
  });
  
  // 转换回数组
  const finalData = Array.from(deduped.values());
  
  // 按市值排序
  finalData.sort((a, b) => b.marketCap - a.marketCap);
  
  log(`从所有API源共获取到${allData.length}个币种数据，去重后还有${finalData.length}个`, 'crypto-api');
  
  return finalData;
}

/**
 * 获取指定币种的7天平均交易量
 * @param symbol 币种符号
 * @returns 7天平均交易量，如果获取失败则返回null
 */
export async function fetch7DayAverageVolume(symbol: string): Promise<number | null> {
  try {
    // 方法1: 尝试从CoinGecko获取
    const response = await axios.get(`https://api.coingecko.com/api/v3/coins/${symbol.toLowerCase()}/market_chart`, {
      params: {
        vs_currency: 'usd',
        days: 7,
        interval: 'daily'
      }
    });
    
    if (response.data && response.data.total_volumes && Array.isArray(response.data.total_volumes)) {
      // 计算7天平均值
      const volumes = response.data.total_volumes.map((v: any) => v[1]);
      const average = volumes.reduce((sum: number, vol: number) => sum + vol, 0) / volumes.length;
      return average;
    }
    
    // 方法2: 如果CoinGecko失败，尝试从CryptoCompare获取
    const cryptoCompareResponse = await axios.get(`https://min-api.cryptocompare.com/data/v2/histoday`, {
      params: {
        fsym: symbol.toUpperCase(),
        tsym: 'USD',
        limit: 7
      },
      headers: {
        'Authorization': `Apikey ${process.env.CRYPTOCOMPARE_API_KEY || ''}`
      }
    });
    
    if (cryptoCompareResponse.data && 
        cryptoCompareResponse.data.Data && 
        cryptoCompareResponse.data.Data.Data && 
        Array.isArray(cryptoCompareResponse.data.Data.Data)) {
      const data = cryptoCompareResponse.data.Data.Data;
      const volumes = data.map((day: any) => day.volumeto || 0);
      const average = volumes.reduce((sum: number, vol: number) => sum + vol, 0) / volumes.length;
      return average;
    }
    
    // 方法3: 尝试从CoinCap获取历史数据
    const coinCapResponse = await axios.get(`https://api.coincap.io/v2/assets/${symbol.toLowerCase()}/history`, {
      params: {
        interval: 'd1',
        start: Date.now() - 7 * 24 * 60 * 60 * 1000,
        end: Date.now()
      }
    });
    
    if (coinCapResponse.data && 
        coinCapResponse.data.data && 
        Array.isArray(coinCapResponse.data.data)) {
      const data = coinCapResponse.data.data;
      const volumes = data.map((day: any) => parseFloat(day.volumeUsd) || 0);
      const average = volumes.reduce((sum: number, vol: number) => sum + vol, 0) / volumes.length;
      return average;
    }
    
    return null;
  } catch (error) {
    log(`获取${symbol}的7天平均交易量时出错: ${error instanceof Error ? error.message : 'Unknown error'}`, 'crypto-api');
    return null;
  }
}

/**
 * 为多个币种批量获取7天平均交易量
 * @param symbols 币种符号数组
 * @param batchSize 批处理大小
 * @param delayMs 批次之间的延迟（毫秒）
 * @returns Map，键为币种符号，值为7天平均交易量
 */
export async function fetch7DayAverageVolumeForMany(
  symbols: string[], 
  batchSize: number = 5, 
  delayMs: number = 1000
): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  log(`批量获取${symbols.length}个币种的7天平均交易量，批处理大小: ${batchSize}，延迟: ${delayMs}毫秒`, 'crypto-api');
  
  // 按批次处理
  for (let i = 0; i < symbols.length; i += batchSize) {
    const batch = symbols.slice(i, i + batchSize);
    
    // 并行处理当前批次
    const batchPromises = batch.map(async (symbol) => {
      try {
        // 先尝试CoinGecko
        const volume = await fetch7DayAverageVolume(symbol);
        if (volume !== null) {
          return { symbol, volume };
        }
        
        // 如果失败，尝试估算（用24小时交易量 * 7）
        const apiData = await fetchFromAllAPIs(100);
        const cryptoData = apiData.find(c => c.symbol.toUpperCase() === symbol.toUpperCase());
        if (cryptoData) {
          return { symbol, volume: cryptoData.volume24h * 7 };
        }
        
        return { symbol, volume: 0 };
      } catch (error) {
        log(`获取${symbol}的7天平均交易量时出错: ${error instanceof Error ? error.message : 'Unknown error'}`, 'crypto-api');
        return { symbol, volume: 0 };
      }
    });
    
    const batchResults = await Promise.all(batchPromises);
    
    // 更新结果集
    batchResults.forEach(({ symbol, volume }) => {
      result.set(symbol, volume);
    });
    
    // 如果不是最后一批，添加延迟以避免API限制
    if (i + batchSize < symbols.length) {
      await sleep(delayMs);
    }
  }
  
  return result;
}