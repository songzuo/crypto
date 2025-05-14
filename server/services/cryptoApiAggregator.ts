/**
 * 加密货币API聚合器
 * 整合多个加密货币市场数据API源，提高数据获取的可靠性和准确性
 */

import axios from 'axios';
import { log } from '../vite';
import { sleep } from './utils';

// 标准化的加密货币数据结构
export interface ApiCryptoData {
  name: string;
  symbol: string;
  marketCap: number;
  volume24h: number;
  price: number;
  volume7d?: number; // 可选，有些API直接提供7天平均数据
}

// 1. CoinMarketCap API
export async function fetchFromCoinMarketCapAPI(limit: number = 100): Promise<ApiCryptoData[]> {
  try {
    const API_KEY = process.env.CMC_API_KEY;
    if (!API_KEY) {
      log('缺少CoinMarketCap API密钥，跳过API调用', 'api-aggregator');
      return [];
    }
    
    const url = 'https://pro-api.coinmarketcap.com/v1/cryptocurrency/listings/latest';
    const response = await axios.get(url, {
      headers: {
        'X-CMC_PRO_API_KEY': API_KEY
      },
      params: {
        limit,
        convert: 'USD'
      }
    });
    
    return response.data.data.map(coin => ({
      name: coin.name,
      symbol: coin.symbol,
      marketCap: coin.quote.USD.market_cap,
      volume24h: coin.quote.USD.volume_24h,
      price: coin.quote.USD.price
    }));
  } catch (error) {
    log(`CoinMarketCap API调用失败: ${error.message}`, 'api-aggregator');
    return [];
  }
}

// 2. CoinGecko API
export async function fetchFromCoinGeckoAPI(page: number = 1, perPage: number = 100): Promise<ApiCryptoData[]> {
  try {
    // 如果有专业版API密钥，使用专业版API端点
    const API_KEY = process.env.COINGECKO_PRO_API_KEY;
    const baseUrl = API_KEY 
      ? 'https://pro-api.coingecko.com/api/v3/coins/markets'
      : 'https://api.coingecko.com/api/v3/coins/markets';
    
    const headers = API_KEY ? { 'x-cg-pro-api-key': API_KEY } : {};
    const response = await axios.get(baseUrl, {
      headers,
      params: {
        vs_currency: 'usd',
        order: 'market_cap_desc',
        per_page: perPage,
        page,
        sparkline: false
      }
    });
    
    return response.data.map(coin => ({
      name: coin.name,
      symbol: coin.symbol.toUpperCase(),
      marketCap: coin.market_cap,
      volume24h: coin.total_volume,
      price: coin.current_price
    }));
  } catch (error) {
    log(`CoinGecko API调用失败: ${error.message}`, 'api-aggregator');
    return [];
  }
}

// 3. CryptoCompare API
export async function fetchFromCryptoCompareAPI(limit: number = 100): Promise<ApiCryptoData[]> {
  try {
    const API_KEY = process.env.CRYPTOCOMPARE_API_KEY;
    const headers = API_KEY ? { 'authorization': `Apikey ${API_KEY}` } : {};
    
    const url = 'https://min-api.cryptocompare.com/data/top/mktcapfull';
    const response = await axios.get(url, {
      headers,
      params: {
        limit,
        tsym: 'USD'
      }
    });
    
    return response.data.Data.map(item => {
      const coin = item.CoinInfo;
      const raw = item.RAW?.USD;
      
      return {
        name: coin.FullName,
        symbol: coin.Name,
        marketCap: raw?.MKTCAP || 0,
        volume24h: raw?.VOLUME24HOUR || 0,
        price: raw?.PRICE || 0
      };
    });
  } catch (error) {
    log(`CryptoCompare API调用失败: ${error.message}`, 'api-aggregator');
    return [];
  }
}

// 4. CoinAPI
export async function fetchFromCoinAPI(limit: number = 100): Promise<ApiCryptoData[]> {
  try {
    const API_KEY = process.env.COINAPI_KEY;
    if (!API_KEY) {
      log('缺少CoinAPI密钥，跳过API调用', 'api-aggregator');
      return [];
    }
    
    const url = 'https://rest.coinapi.io/v1/assets';
    const response = await axios.get(url, {
      headers: { 'X-CoinAPI-Key': API_KEY },
      params: { limit }
    });
    
    return response.data
      .filter(asset => asset.type_is_crypto === 1)
      .map(asset => ({
        name: asset.name,
        symbol: asset.asset_id,
        marketCap: parseFloat(asset.market_cap_usd || '0'),
        volume24h: parseFloat(asset.volume_1day_usd || '0'),
        price: parseFloat(asset.price_usd || '0')
      }));
  } catch (error) {
    log(`CoinAPI调用失败: ${error.message}`, 'api-aggregator');
    return [];
  }
}

// 5. CoinCap
export async function fetchFromCoinCapAPI(limit: number = 100): Promise<ApiCryptoData[]> {
  try {
    const API_KEY = process.env.COINCAP_API_KEY;
    const headers = API_KEY ? { 'Authorization': `Bearer ${API_KEY}` } : {};
    
    const url = 'https://api.coincap.io/v2/assets';
    const response = await axios.get(url, {
      headers,
      params: { limit }
    });
    
    return response.data.data.map(asset => ({
      name: asset.name,
      symbol: asset.symbol,
      marketCap: parseFloat(asset.marketCapUsd || '0'),
      volume24h: parseFloat(asset.volumeUsd24Hr || '0'),
      price: parseFloat(asset.priceUsd || '0')
    }));
  } catch (error) {
    log(`CoinCap API调用失败: ${error.message}`, 'api-aggregator');
    return [];
  }
}

// 6. Coinlayer
export async function fetchFromCoinlayerAPI(limit: number = 100): Promise<ApiCryptoData[]> {
  try {
    const API_KEY = process.env.COINLAYER_API_KEY;
    if (!API_KEY) {
      log('缺少Coinlayer API密钥，跳过API调用', 'api-aggregator');
      return [];
    }
    
    // 获取支持的所有币种列表
    const listUrl = 'https://api.coinlayer.com/list';
    const listResponse = await axios.get(listUrl, {
      params: { access_key: API_KEY }
    });
    
    const symbols = Object.keys(listResponse.data.crypto).slice(0, limit);
    
    // 获取当前行情
    const liveUrl = 'https://api.coinlayer.com/live';
    const liveResponse = await axios.get(liveUrl, {
      params: { 
        access_key: API_KEY,
        symbols: symbols.join(',')
      }
    });
    
    return symbols.map(symbol => {
      const cryptoInfo = listResponse.data.crypto[symbol];
      const price = liveResponse.data.rates[symbol] || 0;
      
      return {
        name: cryptoInfo.name,
        symbol: symbol,
        // 注意：Coinlayer免费计划不提供市值和交易量数据，这里设为0
        marketCap: 0,
        volume24h: 0,
        price: price
      };
    });
  } catch (error) {
    log(`Coinlayer API调用失败: ${error.message}`, 'api-aggregator');
    return [];
  }
}

// 7. Alchemy Market Data (专注于以太坊代币)
export async function fetchFromAlchemyAPI(limit: number = 100): Promise<ApiCryptoData[]> {
  try {
    const API_KEY = process.env.ALCHEMY_API_KEY;
    if (!API_KEY) {
      log('缺少Alchemy API密钥，跳过API调用', 'api-aggregator');
      return [];
    }
    
    // 获取主要代币的元数据
    const url = `https://eth-mainnet.alchemyapi.io/v2/${API_KEY}/getTokenMetadata`;
    
    // 一些热门ERC20代币地址（实际应用中应动态获取热门代币地址）
    const popularTokens = [
      '0xdac17f958d2ee523a2206206994597c13d831ec7', // USDT
      '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', // USDC
      '0x6b175474e89094c44da98b954eedeac495271d0f', // DAI
      '0x514910771af9ca656af840dff83e8264ecf986ca', // LINK
      '0x1f9840a85d5af5bf1d1762f925bdaddc4201f984', // UNI
      '0x7d1afa7b718fb893db30a3abc0cfc608aacfebb0', // MATIC
      '0xc00e94cb662c3520282e6f5717214004a7f26888', // COMP
      '0x0bc529c00c6401aef6d220be8c6ea1667f6ad93e'  // YFI
    ];
    
    const tokenData = await Promise.all(popularTokens.slice(0, limit).map(async (address) => {
      try {
        const response = await axios.get(url, {
          params: { contractAddress: address }
        });
        return response.data;
      } catch (e) {
        return null;
      }
    }));
    
    // 过滤掉失败的请求
    return tokenData
      .filter(data => data && data.tokenMetadata)
      .map(data => ({
        name: data.tokenMetadata.name,
        symbol: data.tokenMetadata.symbol,
        // Alchemy不直接提供市值和交易量，这里设为0
        marketCap: 0,
        volume24h: 0,
        price: 0  // 需要另外获取价格
      }));
  } catch (error) {
    log(`Alchemy API调用失败: ${error.message}`, 'api-aggregator');
    return [];
  }
}

// 从所有API获取数据并合并
export async function fetchFromAllAPIs(limit: number = 100): Promise<ApiCryptoData[]> {
  try {
    log(`开始从${limit}个币种的多个API源获取数据...`, 'api-aggregator');
    
    // 并行调用所有API，最大化数据获取机会
    const [
      cmcData, 
      geckoData, 
      cryptoCompareData, 
      coinApiData, 
      coinCapData, 
      coinlayerData,
      alchemyData
    ] = await Promise.all([
      fetchFromCoinMarketCapAPI(limit),
      fetchFromCoinGeckoAPI(1, limit),
      fetchFromCryptoCompareAPI(limit),
      fetchFromCoinAPI(limit),
      fetchFromCoinCapAPI(limit),
      fetchFromCoinlayerAPI(limit),
      fetchFromAlchemyAPI(limit)
    ]);
    
    // 合并数据集
    const combinedData = [
      ...cmcData, 
      ...geckoData, 
      ...cryptoCompareData,
      ...coinApiData,
      ...coinCapData,
      ...coinlayerData,
      ...alchemyData
    ];
    
    // 根据符号去重，优先保留有市值和交易量数据的条目
    const symbolMap = new Map<string, ApiCryptoData>();
    combinedData.forEach(coin => {
      if (!coin.symbol) return;
      
      const symbol = coin.symbol.toUpperCase();
      const existing = symbolMap.get(symbol);
      
      // 如果是新币种或者有更好的数据，则更新map
      if (!existing || 
         (coin.marketCap > 0 && existing.marketCap === 0) ||
         (coin.volume24h > 0 && existing.volume24h === 0)) {
        symbolMap.set(symbol, {
          ...coin,
          symbol: symbol
        });
      }
    });
    
    const uniqueData = Array.from(symbolMap.values());
    log(`通过API聚合获取了 ${uniqueData.length} 个唯一币种数据`, 'api-aggregator');
    
    return uniqueData;
  } catch (error) {
    log(`API聚合数据获取失败: ${error.message}`, 'api-aggregator');
    return [];
  }
}

// 获取特定币种的7天平均交易量（按优先级尝试不同API）
export async function fetch7DayAverageVolume(symbol: string): Promise<number | null> {
  try {
    const normalizedSymbol = symbol.toUpperCase();
    log(`获取 ${normalizedSymbol} 的7天平均交易量数据...`, 'api-aggregator');
    
    // 1. 尝试CoinGecko (提供直接的7天历史数据)
    try {
      const API_KEY = process.env.COINGECKO_PRO_API_KEY;
      const baseUrl = API_KEY 
        ? 'https://pro-api.coingecko.com/api/v3/coins'
        : 'https://api.coingecko.com/api/v3/coins';
      
      // 先获取ID映射
      const coinListUrl = `${baseUrl}/list`;
      const headers = API_KEY ? { 'x-cg-pro-api-key': API_KEY } : {};
      const listResponse = await axios.get(coinListUrl, { headers });
      
      const coin = listResponse.data.find(c => 
        c.symbol.toUpperCase() === normalizedSymbol
      );
      
      if (coin) {
        const marketChartUrl = `${baseUrl}/${coin.id}/market_chart`;
        const chartResponse = await axios.get(marketChartUrl, {
          headers,
          params: {
            vs_currency: 'usd',
            days: 7
          }
        });
        
        if (chartResponse.data && chartResponse.data.total_volumes) {
          const volumes = chartResponse.data.total_volumes.map(v => v[1]);
          if (volumes.length > 0) {
            const avgVolume = volumes.reduce((sum, vol) => sum + vol, 0) / volumes.length;
            log(`CoinGecko: ${normalizedSymbol} 7天平均交易量为 $${avgVolume.toLocaleString()}`, 'api-aggregator');
            return avgVolume;
          }
        }
      }
    } catch (error) {
      log(`CoinGecko获取${normalizedSymbol} 7天交易量失败: ${error.message}`, 'api-aggregator');
    }
    
    // 2. 尝试CoinMarketCap API (需要历史数据端点)
    try {
      const API_KEY = process.env.CMC_API_KEY;
      if (API_KEY) {
        const historyUrl = 'https://pro-api.coinmarketcap.com/v1/cryptocurrency/quotes/historical';
        const end = new Date();
        const start = new Date();
        start.setDate(start.getDate() - 7);
        
        const response = await axios.get(historyUrl, {
          headers: { 'X-CMC_PRO_API_KEY': API_KEY },
          params: {
            symbol: normalizedSymbol,
            time_start: start.toISOString(),
            time_end: end.toISOString(),
            interval: 'daily'
          }
        });
        
        if (response.data && response.data.data && response.data.data.quotes) {
          const volumes = response.data.data.quotes.map(q => q.quote.USD.volume_24h);
          if (volumes.length > 0) {
            const avgVolume = volumes.reduce((sum, vol) => sum + vol, 0) / volumes.length;
            log(`CoinMarketCap: ${normalizedSymbol} 7天平均交易量为 $${avgVolume.toLocaleString()}`, 'api-aggregator');
            return avgVolume;
          }
        }
      }
    } catch (error) {
      log(`CoinMarketCap获取${normalizedSymbol} 7天交易量失败: ${error.message}`, 'api-aggregator');
    }
    
    // 3. 尝试CryptoCompare API
    try {
      const API_KEY = process.env.CRYPTOCOMPARE_API_KEY;
      const headers = API_KEY ? { 'authorization': `Apikey ${API_KEY}` } : {};
      
      const historyUrl = 'https://min-api.cryptocompare.com/data/v2/histoday';
      const response = await axios.get(historyUrl, {
        headers,
        params: {
          fsym: normalizedSymbol,
          tsym: 'USD',
          limit: 7
        }
      });
      
      if (response.data && response.data.Data && response.data.Data.Data) {
        const volumes = response.data.Data.Data.map(day => day.volumeto);
        if (volumes.length > 0) {
          const avgVolume = volumes.reduce((sum, vol) => sum + vol, 0) / volumes.length;
          log(`CryptoCompare: ${normalizedSymbol} 7天平均交易量为 $${avgVolume.toLocaleString()}`, 'api-aggregator');
          return avgVolume;
        }
      }
    } catch (error) {
      log(`CryptoCompare获取${normalizedSymbol} 7天交易量失败: ${error.message}`, 'api-aggregator');
    }
    
    // 4. 尝试CoinAPI
    try {
      const API_KEY = process.env.COINAPI_KEY;
      if (API_KEY) {
        const end = new Date();
        const start = new Date();
        start.setDate(start.getDate() - 7);
        
        const ohlcvUrl = `https://rest.coinapi.io/v1/ohlcv/${normalizedSymbol}USD/history`;
        const response = await axios.get(ohlcvUrl, {
          headers: { 'X-CoinAPI-Key': API_KEY },
          params: {
            period_id: '1DAY',
            time_start: start.toISOString(),
            time_end: end.toISOString()
          }
        });
        
        if (response.data && Array.isArray(response.data)) {
          const volumes = response.data.map(day => day.volume_traded);
          if (volumes.length > 0) {
            const avgVolume = volumes.reduce((sum, vol) => sum + vol, 0) / volumes.length;
            log(`CoinAPI: ${normalizedSymbol} 7天平均交易量为 $${avgVolume.toLocaleString()}`, 'api-aggregator');
            return avgVolume;
          }
        }
      }
    } catch (error) {
      log(`CoinAPI获取${normalizedSymbol} 7天交易量失败: ${error.message}`, 'api-aggregator');
    }
    
    // 5. 尝试CoinCap
    try {
      const API_KEY = process.env.COINCAP_API_KEY;
      const headers = API_KEY ? { 'Authorization': `Bearer ${API_KEY}` } : {};
      
      // 先获取资产ID
      const assetsUrl = 'https://api.coincap.io/v2/assets';
      const assetsResponse = await axios.get(assetsUrl, {
        headers,
        params: { search: normalizedSymbol }
      });
      
      if (assetsResponse.data && assetsResponse.data.data && assetsResponse.data.data.length > 0) {
        const asset = assetsResponse.data.data.find(a => a.symbol.toUpperCase() === normalizedSymbol);
        if (asset) {
          const assetId = asset.id;
          const end = Date.now();
          const start = end - (7 * 24 * 60 * 60 * 1000);
          
          const historyUrl = `https://api.coincap.io/v2/assets/${assetId}/history`;
          const historyResponse = await axios.get(historyUrl, {
            headers,
            params: {
              interval: 'd1',
              start,
              end
            }
          });
          
          if (historyResponse.data && historyResponse.data.data) {
            const volumes = historyResponse.data.data.map(day => parseFloat(day.volumeUsd));
            if (volumes.length > 0) {
              const avgVolume = volumes.reduce((sum, vol) => sum + vol, 0) / volumes.length;
              log(`CoinCap: ${normalizedSymbol} 7天平均交易量为 $${avgVolume.toLocaleString()}`, 'api-aggregator');
              return avgVolume;
            }
          }
        }
      }
    } catch (error) {
      log(`CoinCap获取${normalizedSymbol} 7天交易量失败: ${error.message}`, 'api-aggregator');
    }
    
    // 如果所有API都失败，返回null
    log(`无法获取${normalizedSymbol}的7天平均交易量数据`, 'api-aggregator');
    return null;
  } catch (error) {
    log(`获取7天平均交易量失败: ${error.message}`, 'api-aggregator');
    return null;
  }
}

// 批量获取多个币种的7天平均交易量
export async function fetch7DayAverageVolumeForMany(symbols: string[], batchSize: number = 5, delayMs: number = 1000): Promise<Map<string, number>> {
  const results = new Map<string, number>();
  
  // 分批处理以避免API限制
  for (let i = 0; i < symbols.length; i += batchSize) {
    const batch = symbols.slice(i, i + batchSize);
    log(`处理7天交易量批次 ${i/batchSize + 1}/${Math.ceil(symbols.length/batchSize)}, 币种: ${batch.join(', ')}`, 'api-aggregator');
    
    // 并行处理每个批次
    const batchResults = await Promise.all(
      batch.map(async symbol => {
        const volume = await fetch7DayAverageVolume(symbol);
        return { symbol, volume };
      })
    );
    
    // 保存结果
    batchResults.forEach(({ symbol, volume }) => {
      if (volume !== null) {
        results.set(symbol, volume);
      }
    });
    
    // 在批次之间添加延迟以避免超过API速率限制
    if (i + batchSize < symbols.length) {
      await sleep(delayMs);
    }
  }
  
  log(`已获取 ${results.size}/${symbols.length} 个币种的7天平均交易量数据`, 'api-aggregator');
  return results;
}