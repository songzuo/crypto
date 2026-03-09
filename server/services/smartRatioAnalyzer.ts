import axios from 'axios';
import { db } from '../db';
import { volumeToMarketCapRatios, volumeToMarketCapBatches } from '@shared/schema';

interface CryptoData {
  symbol: string;
  name: string;
  marketCap: number;
  volume24h: number;
  volumeToMarketCapRatio: number;
  rank: number;
  price?: number;
  change24h?: number;
  source: string;
}

// 智能API配置 - 基于原有系统优化
const SMART_API_SOURCES = [
  {
    name: 'CoinGecko',
    baseUrl: 'https://api.coingecko.com/api/v3',
    timeout: 10000,
    retries: 2,
    getUrl: (page: number = 1) => `/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=50&page=${page}&sparkline=false&price_change_percentage=24h`,
    transform: (data: any[]): CryptoData[] => {
      return data.map(coin => ({
        symbol: coin.symbol.toUpperCase(),
        name: coin.name,
        marketCap: coin.market_cap || 0,
        volume24h: coin.total_volume || 0,
        volumeToMarketCapRatio: coin.total_volume && coin.market_cap ? (coin.total_volume / coin.market_cap) : 0,
        rank: coin.market_cap_rank || 999999,
        price: coin.current_price,
        change24h: coin.price_change_percentage_24h,
        source: 'CoinGecko'
      }));
    }
  },
  {
    name: 'CoinMarketCap',
    baseUrl: 'https://pro-api.coinmarketcap.com/v1',
    timeout: 10000,
    retries: 2,
    getUrl: () => '/cryptocurrency/listings/latest?limit=50&convert=USD',
    apiKey: process.env.COINMARKETCAP_API_KEY,
    transform: (data: any): CryptoData[] => {
      if (!data.data) return [];
      return data.data.map((coin: any) => ({
        symbol: coin.symbol,
        name: coin.name,
        marketCap: coin.quote?.USD?.market_cap || 0,
        volume24h: coin.quote?.USD?.volume_24h || 0,
        volumeToMarketCapRatio: coin.quote?.USD?.volume_24h && coin.quote?.USD?.market_cap ? 
          (coin.quote.USD.volume_24h / coin.quote.USD.market_cap) : 0,
        rank: coin.cmc_rank || 999999,
        price: coin.quote?.USD?.price,
        change24h: coin.quote?.USD?.percent_change_24h,
        source: 'CoinMarketCap'
      }));
    }
  },
  {
    name: 'CoinCap',
    baseUrl: 'https://api.coincap.io/v2',
    timeout: 8000,
    retries: 2,
    getUrl: () => '/assets?limit=50',
    transform: (data: any): CryptoData[] => {
      if (!data.data) return [];
      return data.data.map((coin: any) => ({
        symbol: coin.symbol,
        name: coin.name,
        marketCap: parseFloat(coin.marketCapUsd) || 0,
        volume24h: parseFloat(coin.volumeUsd24Hr) || 0,
        volumeToMarketCapRatio: coin.volumeUsd24Hr && coin.marketCapUsd ? 
          (parseFloat(coin.volumeUsd24Hr) / parseFloat(coin.marketCapUsd)) : 0,
        rank: parseInt(coin.rank) || 999999,
        price: parseFloat(coin.priceUsd),
        change24h: parseFloat(coin.changePercent24Hr),
        source: 'CoinCap'
      }));
    }
  },
  {
    name: 'CryptoCompare',
    baseUrl: 'https://min-api.cryptocompare.com/data',
    timeout: 8000,
    retries: 2,
    getUrl: () => '/top/mktcapfull?limit=50&tsym=USD',
    transform: (data: any): CryptoData[] => {
      if (!data.Data) return [];
      return data.Data.map((coin: any) => {
        const raw = coin.RAW?.USD;
        if (!raw) return null;
        
        return {
          symbol: coin.CoinInfo.Name,
          name: coin.CoinInfo.FullName,
          marketCap: raw.MKTCAP || 0,
          volume24h: raw.TOTALVOLUME24H || 0,
          volumeToMarketCapRatio: raw.TOTALVOLUME24H && raw.MKTCAP ? 
            (raw.TOTALVOLUME24H / raw.MKTCAP) : 0,
          rank: coin.CoinInfo.SortOrder || 999999,
          price: raw.PRICE,
          change24h: raw.CHANGE24HOUR,
          source: 'CryptoCompare'
        };
      }).filter(Boolean);
    }
  }
];

// 智能HTTP客户端
const smartClient = axios.create({
  timeout: 8000,
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    'Accept': 'application/json',
    'Accept-Encoding': 'gzip, deflate',
    'Connection': 'keep-alive'
  }
});

// 智能请求函数
async function smartRequest(url: string, timeout: number = 8000, apiKey?: string): Promise<any> {
  try {
    const headers: any = {};
    if (apiKey) {
      headers['X-CMC_PRO_API_KEY'] = apiKey;
    }
    
    const response = await smartClient.get(url, { timeout, headers });
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      if (error.code === 'ETIMEDOUT' || error.code === 'ECONNABORTED') {
        throw new Error(`请求超时: ${error.message}`);
      }
      if (error.response?.status === 429) {
        throw new Error(`API限流: ${error.response.status}`);
      }
      if (error.response?.status === 401) {
        throw new Error(`API密钥无效: ${error.response.status}`);
      }
    }
    throw error;
  }
}

// 从单个API源智能获取数据
async function fetchFromSmartSource(source: typeof SMART_API_SOURCES[0], maxRetries: number = 2): Promise<CryptoData[]> {
  console.log(`🚀 智能获取 ${source.name} 数据...`);
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      let url: string;
      
      if (source.name === 'CoinGecko') {
        // CoinGecko分页获取，但限制页数
        const results: CryptoData[] = [];
        for (let page = 1; page <= 2; page++) {
          try {
            url = source.baseUrl + source.getUrl(page);
            console.log(`📡 ${source.name} 第${page}页: ${url}`);
            
            const data = await smartRequest(url, source.timeout);
            const transformed = source.transform(data);
            results.push(...transformed);
            
            console.log(`✅ ${source.name} 第${page}页: ${transformed.length}个币种`);
            
            // 如果已经有足够数据，提前结束
            if (results.length >= 30) break;
            
            // 短暂延迟避免限流
            await new Promise(resolve => setTimeout(resolve, 300));
          } catch (pageError) {
            console.log(`⚠️ ${source.name} 第${page}页失败: ${pageError.message}`);
            break;
          }
        }
        return results;
      } else {
        url = source.baseUrl + source.getUrl();
        console.log(`📡 ${source.name}: ${url}`);
        
        const data = await smartRequest(url, source.timeout, source.apiKey);
        const transformed = source.transform(data);
        
        console.log(`✅ ${source.name}: ${transformed.length}个币种`);
        return transformed;
      }
      
    } catch (error) {
      console.log(`❌ ${source.name} 尝试 ${attempt}/${maxRetries} 失败: ${error.message}`);
      
      if (attempt < maxRetries) {
        const delay = attempt * 1000;
        console.log(`⏳ ${source.name} 等待 ${delay}ms 后重试...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  console.log(`❌ ${source.name} 所有尝试都失败`);
  return [];
}

// 智能去重和合并
function smartDeduplicateAndMerge(allData: CryptoData[]): CryptoData[] {
  console.log(`📊 合并前总数: ${allData.length}`);
  
  const uniqueData = new Map<string, CryptoData>();
  
  allData.forEach(coin => {
    const key = coin.symbol.toUpperCase();
    const existing = uniqueData.get(key);
    
    if (!existing) {
      uniqueData.set(key, coin);
    } else {
      // 选择更好的数据（更高的市值排名或更完整的数据）
      if (coin.rank < existing.rank || 
          (coin.rank === existing.rank && coin.volumeToMarketCapRatio > 0 && existing.volumeToMarketCapRatio === 0)) {
        uniqueData.set(key, coin);
      }
    }
  });
  
  const finalData = Array.from(uniqueData.values())
    .filter(coin => 
      coin.marketCap > 0 && 
      coin.volume24h > 0 && 
      coin.volumeToMarketCapRatio > 0 &&
      coin.symbol &&
      coin.name
    )
    .sort((a, b) => b.volumeToMarketCapRatio - a.volumeToMarketCapRatio)
    .slice(0, 200); // 限制前200个
  
  console.log(`📊 智能去重后有效数据: ${finalData.length} 个币种`);
  
  return finalData;
}

// 主智能分析函数
export async function runSmartRatioAnalysis(): Promise<{success: boolean, batchId?: number, count?: number, error?: string}> {
  console.log('🧠 开始智能交易量市值比率分析...');
  
  try {
    // 并行从多个API源获取数据
    console.log('📡 并行从多个API源智能获取数据...');
    
    const fetchPromises = SMART_API_SOURCES.map(source => fetchFromSmartSource(source));
    const results = await Promise.allSettled(fetchPromises);
    
    // 合并所有成功的结果
    const allCryptoData: CryptoData[] = [];
    const sourceResults: {[key: string]: number} = {};
    
    results.forEach((result, index) => {
      const sourceName = SMART_API_SOURCES[index].name;
      if (result.status === 'fulfilled' && result.value.length > 0) {
        allCryptoData.push(...result.value);
        sourceResults[sourceName] = result.value.length;
        console.log(`✅ ${sourceName}: ${result.value.length} 个币种`);
      } else {
        sourceResults[sourceName] = 0;
        console.log(`❌ ${sourceName}: 0 个币种`);
      }
    });
    
    console.log('📊 API源结果汇总:', sourceResults);
    
    if (allCryptoData.length === 0) {
      return {
        success: false,
        error: '所有API源都返回了空结果，请检查网络连接或API配置'
      };
    }
    
    // 智能去重和排序
    const finalData = smartDeduplicateAndMerge(allCryptoData);
    
    if (finalData.length === 0) {
      return {
        success: false,
        error: '没有找到有效的交易量市值比率数据'
      };
    }
    
    // 创建批次记录
    console.log('💾 保存数据到数据库...');
    
    const batchResult = await db.insert(volumeToMarketCapBatches).values({
      created_at: new Date(),
      total_cryptocurrencies: finalData.length,
      data_sources: Object.keys(sourceResults).filter(key => sourceResults[key] > 0).join(', ')
    }).returning({ id: volumeToMarketCapBatches.id });
    
    const batchId = batchResult[0].id;
    
    // 批量插入数据
    const insertData = finalData.map((coin, index) => ({
      batch_id: batchId,
      cryptocurrency_symbol: coin.symbol,
      cryptocurrency_name: coin.name,
      market_cap: coin.marketCap,
      volume_24h: coin.volume24h,
      volume_to_market_cap_ratio: coin.volumeToMarketCapRatio,
      rank: index + 1,
      price_usd: coin.price,
      change_24h_percent: coin.change24h
    }));
    
    await db.insert(volumeToMarketCapRatios).values(insertData);
    
    console.log(`✅ 智能分析完成! 批次ID: ${batchId}, 处理了 ${finalData.length} 个币种`);
    console.log(`📊 数据源: ${Object.keys(sourceResults).filter(key => sourceResults[key] > 0).join(', ')}`);
    
    // 显示前5个结果
    console.log('🏆 前5个交易量市值比率最高的币种:');
    finalData.slice(0, 5).forEach((coin, index) => {
      console.log(`  ${index + 1}. ${coin.name} (${coin.symbol}): ${coin.volumeToMarketCapRatio.toFixed(6)} - 来源: ${coin.source}`);
    });
    
    return {
      success: true,
      batchId: batchId,
      count: finalData.length
    };
    
  } catch (error) {
    console.error('❌ 智能分析失败:', error);
    return {
      success: false,
      error: error.message || '未知错误'
    };
  }
}

// 测试智能API连接
export async function testSmartApiConnections(): Promise<{[key: string]: boolean}> {
  console.log('🔍 测试智能API连接...');
  
  const results: {[key: string]: boolean} = {};
  
  for (const source of SMART_API_SOURCES) {
    try {
      let url: string;
      if (source.name === 'CoinGecko') {
        url = source.baseUrl + source.getUrl(1);
      } else {
        url = source.baseUrl + source.getUrl();
      }
      
      await smartRequest(url, 5000, source.apiKey); // 5秒超时测试
      results[source.name] = true;
      console.log(`✅ ${source.name}: 连接正常`);
    } catch (error) {
      results[source.name] = false;
      console.log(`❌ ${source.name}: 连接失败 - ${error.message}`);
    }
  }
  
  return results;
}
