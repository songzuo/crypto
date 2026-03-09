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
}

// 快速、免费的API源配置（基于测试结果优化）
const API_SOURCES = [
  {
    name: 'CryptoCompare',
    baseUrl: 'https://min-api.cryptocompare.com/data',
    timeout: 8000,
    retries: 2,
    getUrl: () => '/top/mktcapfull?limit=100&tsym=USD',
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
          change24h: raw.CHANGE24HOUR
        };
      }).filter(Boolean);
    }
  },
  {
    name: 'CoinLore',
    baseUrl: 'https://api.coinlore.net/api',
    timeout: 8000,
    retries: 2,
    getUrl: () => '/tickers/',
    transform: (data: any): CryptoData[] => {
      if (!data.data) return [];
      return data.data.map((coin: any) => ({
        symbol: coin.symbol,
        name: coin.name,
        marketCap: parseFloat(coin.market_cap_usd) || 0,
        volume24h: parseFloat(coin.volume24) || 0,
        volumeToMarketCapRatio: coin.volume24 && coin.market_cap_usd ? 
          (parseFloat(coin.volume24) / parseFloat(coin.market_cap_usd)) : 0,
        rank: parseInt(coin.rank) || 999999,
        price: parseFloat(coin.price_usd),
        change24h: parseFloat(coin.percent_change_24h)
      }));
    }
  },
  {
    name: 'CoinGecko',
    baseUrl: 'https://api.coingecko.com/api/v3',
    timeout: 8000,
    retries: 1,
    getUrl: (page: number) => `/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=100&page=${page}&sparkline=false&price_change_percentage=24h`,
    transform: (data: any[]): CryptoData[] => {
      return data.map(coin => ({
        symbol: coin.symbol.toUpperCase(),
        name: coin.name,
        marketCap: coin.market_cap || 0,
        volume24h: coin.total_volume || 0,
        volumeToMarketCapRatio: coin.total_volume && coin.market_cap ? (coin.total_volume / coin.market_cap) : 0,
        rank: coin.market_cap_rank || 999999,
        price: coin.current_price,
        change24h: coin.price_change_percentage_24h
      }));
    }
  }
];

// 快速HTTP客户端
const fastClient = axios.create({
  timeout: 3000,
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    'Accept': 'application/json',
    'Accept-Encoding': 'gzip, deflate',
    'Connection': 'keep-alive'
  }
});

// 快速请求函数
async function fastRequest(url: string, timeout: number = 3000): Promise<any> {
  try {
    const response = await fastClient.get(url, { timeout });
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      if (error.code === 'ETIMEDOUT' || error.code === 'ECONNABORTED') {
        throw new Error(`请求超时: ${error.message}`);
      }
      if (error.response?.status === 429) {
        throw new Error(`API限流: ${error.response.status}`);
      }
    }
    throw error;
  }
}

// 从单个API源获取数据
async function fetchFromSource(source: typeof API_SOURCES[0], maxRetries: number = 2): Promise<CryptoData[]> {
  console.log(`🚀 从 ${source.name} 获取数据...`);
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const url = source.baseUrl + source.getUrl(1);
      console.log(`📡 ${source.name} 请求: ${url}`);
      
      const data = await fastRequest(url, source.timeout);
      
      let transformedData: CryptoData[];
      
      if (source.name === 'CoinGecko') {
        // CoinGecko需要分页获取
        transformedData = [];
        for (let page = 1; page <= 2; page++) { // 只获取前2页
          try {
            const pageUrl = source.baseUrl + source.getUrl(page);
            const pageData = await fastRequest(pageUrl, source.timeout);
            const pageTransformed = source.transform(pageData);
            transformedData.push(...pageTransformed);
            console.log(`✅ ${source.name} 第${page}页: ${pageTransformed.length}个币种`);
            
            // 短暂延迟避免限流
            await new Promise(resolve => setTimeout(resolve, 200));
          } catch (pageError) {
            console.log(`⚠️ ${source.name} 第${page}页失败: ${pageError.message}`);
            break;
          }
        }
      } else {
        transformedData = source.transform(data);
      }
      
      // 过滤有效数据
      const validData = transformedData.filter(coin => 
        coin.marketCap > 0 && 
        coin.volume24h > 0 && 
        coin.volumeToMarketCapRatio > 0 &&
        coin.symbol &&
        coin.name
      );
      
      console.log(`✅ ${source.name} 成功获取 ${validData.length} 个有效币种`);
      return validData;
      
    } catch (error) {
      console.log(`❌ ${source.name} 尝试 ${attempt}/${maxRetries} 失败: ${error.message}`);
      
      if (attempt < maxRetries) {
        const delay = attempt * 1000; // 递增延迟
        console.log(`⏳ ${source.name} 等待 ${delay}ms 后重试...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  console.log(`❌ ${source.name} 所有尝试都失败`);
  return [];
}

// 主分析函数
export async function runFastRatioAnalysis(): Promise<{success: boolean, batchId?: number, count?: number, error?: string}> {
  console.log('🚀 开始快速交易量市值比率分析...');
  
  try {
    // 并行从多个API源获取数据
    console.log('📡 并行从多个API源获取数据...');
    
    const fetchPromises = API_SOURCES.map(source => fetchFromSource(source));
    const results = await Promise.allSettled(fetchPromises);
    
    // 合并所有成功的结果
    const allCryptoData: CryptoData[] = [];
    const sourceResults: {[key: string]: number} = {};
    
    results.forEach((result, index) => {
      const sourceName = API_SOURCES[index].name;
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
        error: '所有API源都返回了空结果，请检查网络连接或API状态'
      };
    }
    
    // 去重和排序
    console.log(`📊 合并前总数: ${allCryptoData.length}`);
    
    const uniqueData = new Map<string, CryptoData>();
    
    allCryptoData.forEach(coin => {
      const key = coin.symbol.toUpperCase();
      if (!uniqueData.has(key) || uniqueData.get(key)!.rank > coin.rank) {
        uniqueData.set(key, coin);
      }
    });
    
    const finalData = Array.from(uniqueData.values())
      .filter(coin => coin.volumeToMarketCapRatio > 0)
      .sort((a, b) => b.volumeToMarketCapRatio - a.volumeToMarketCapRatio)
      .slice(0, 1000); // 限制前1000个
    
    console.log(`📊 去重后有效数据: ${finalData.length} 个币种`);
    
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
    
    console.log(`✅ 快速分析完成! 批次ID: ${batchId}, 处理了 ${finalData.length} 个币种`);
    console.log(`📊 数据源: ${Object.keys(sourceResults).filter(key => sourceResults[key] > 0).join(', ')}`);
    
    return {
      success: true,
      batchId: batchId,
      count: finalData.length
    };
    
  } catch (error) {
    console.error('❌ 快速分析失败:', error);
    return {
      success: false,
      error: error.message || '未知错误'
    };
  }
}

// 测试API连接
export async function testApiConnections(): Promise<{[key: string]: boolean}> {
  console.log('🔍 测试API连接...');
  
  const results: {[key: string]: boolean} = {};
  
  for (const source of API_SOURCES) {
    try {
      const url = source.baseUrl + source.getUrl(1);
      await fastRequest(url, 2000); // 2秒超时测试
      results[source.name] = true;
      console.log(`✅ ${source.name}: 连接正常`);
    } catch (error) {
      results[source.name] = false;
      console.log(`❌ ${source.name}: 连接失败 - ${error.message}`);
    }
  }
  
  return results;
}
