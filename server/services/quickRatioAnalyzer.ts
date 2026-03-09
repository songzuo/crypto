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

// 快速API配置 - 只获取少量数据
const QUICK_API_SOURCES = [
  {
    name: 'CryptoCompare',
    baseUrl: 'https://min-api.cryptocompare.com/data',
    timeout: 5000,
    getUrl: () => '/top/mktcapfull?limit=10&tsym=USD',
    transform: (data: any): CryptoData[] => {
      if (!data.Data) return [];
      return data.Data.slice(0, 5).map((coin: any) => {
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
  },
  {
    name: 'CoinGecko',
    baseUrl: 'https://api.coingecko.com/api/v3',
    timeout: 5000,
    getUrl: () => '/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=10&page=1&sparkline=false',
    transform: (data: any[]): CryptoData[] => {
      return data.slice(0, 5).map(coin => ({
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
  }
];

// 快速HTTP客户端
const quickClient = axios.create({
  timeout: 5000,
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
  }
});

// 快速请求函数
async function quickRequest(url: string): Promise<any> {
  try {
    const response = await quickClient.get(url);
    return response.data;
  } catch (error) {
    throw new Error(`请求失败: ${error.message}`);
  }
}

// 快速去重
function quickDeduplicate(allData: CryptoData[]): CryptoData[] {
  const uniqueData = new Map<string, CryptoData>();
  
  allData.forEach(coin => {
    const key = coin.symbol.toUpperCase();
    const existing = uniqueData.get(key);
    
    if (!existing || coin.rank < existing.rank) {
      uniqueData.set(key, coin);
    }
  });
  
  return Array.from(uniqueData.values())
    .filter(coin => 
      coin.marketCap > 0 && 
      coin.volume24h > 0 && 
      coin.volumeToMarketCapRatio > 0
    )
    .sort((a, b) => b.volumeToMarketCapRatio - a.volumeToMarketCapRatio);
}

// 主快速分析函数
export async function runQuickRatioAnalysis(): Promise<{success: boolean, batchId?: number, count?: number, error?: string}> {
  console.log('⚡ 开始快速交易量市值比率分析（测试模式）...');
  
  try {
    const allCryptoData: CryptoData[] = [];
    const sourceResults: {[key: string]: number} = {};
    
    // 快速测试每个API源
    for (const source of QUICK_API_SOURCES) {
      try {
        console.log(`🚀 快速测试 ${source.name}...`);
        const url = source.baseUrl + source.getUrl();
        const data = await quickRequest(url);
        const transformed = source.transform(data);
        
        allCryptoData.push(...transformed);
        sourceResults[source.name] = transformed.length;
        
        console.log(`✅ ${source.name}: ${transformed.length} 个币种`);
        
        // 如果已经有一些数据，可以提前结束
        if (allCryptoData.length >= 3) {
          console.log('🎯 已获得足够测试数据，提前结束');
          break;
        }
        
      } catch (error) {
        console.log(`❌ ${source.name}: ${error.message}`);
        sourceResults[source.name] = 0;
      }
    }
    
    console.log('📊 API测试结果:', sourceResults);
    
    if (allCryptoData.length === 0) {
      return {
        success: false,
        error: '所有API源都返回了空结果'
      };
    }
    
    // 快速去重
    const finalData = quickDeduplicate(allCryptoData);
    
    console.log(`📈 快速分析完成: ${finalData.length} 个有效币种`);
    
    // 显示结果
    console.log('🏆 快速测试结果:');
    finalData.forEach((coin, index) => {
      console.log(`  ${index + 1}. ${coin.name} (${coin.symbol}): ${coin.volumeToMarketCapRatio.toFixed(6)} - 来源: ${coin.source}`);
    });
    
    // 创建测试批次记录
    const batchResult = await db.insert(volumeToMarketCapBatches).values({
      created_at: new Date(),
      total_cryptocurrencies: finalData.length,
      data_sources: Object.keys(sourceResults).filter(key => sourceResults[key] > 0).join(', ')
    }).returning({ id: volumeToMarketCapBatches.id });
    
    const batchId = batchResult[0].id;
    
    // 插入测试数据
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
    
    console.log(`✅ 快速测试成功! 批次ID: ${batchId}, 处理了 ${finalData.length} 个币种`);
    
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

// 快速API连接测试
export async function testQuickApiConnections(): Promise<{[key: string]: boolean}> {
  console.log('⚡ 快速API连接测试...');
  
  const results: {[key: string]: boolean} = {};
  
  for (const source of QUICK_API_SOURCES) {
    try {
      const url = source.baseUrl + source.getUrl();
      await quickRequest(url);
      results[source.name] = true;
      console.log(`✅ ${source.name}: 连接正常`);
    } catch (error) {
      results[source.name] = false;
      console.log(`❌ ${source.name}: 连接失败`);
    }
  }
  
  return results;
}
