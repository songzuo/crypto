import axios from 'axios';
import { db } from '../db';
import { volumeToMarketCapRatios, volumeToMarketCapBatches, cryptocurrencies } from '@shared/schema';
import { eq } from 'drizzle-orm';

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

interface AnalysisProgress {
  status: 'idle' | 'running' | 'completed' | 'failed';
  currentStep: string;
  progress: number; // 0-100
  results?: {
    success: boolean;
    batchId?: number;
    count?: number;
    error?: string;
  };
  startTime?: Date;
  endTime?: Date;
}

// 全局进度状态
let analysisProgress: AnalysisProgress = {
  status: 'idle',
  currentStep: '准备就绪',
  progress: 0
};

// 快速API配置 - 优先使用真实的市场数据API，增加数据量
const FAST_API_SOURCES = [
  {
    name: 'CryptoCompare',
    url: 'https://min-api.cryptocompare.com/data/top/mktcapfull?limit=100&tsym=USD',
    timeout: 15000,
    headers: {
      'Accept': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept-Language': 'en-US,en;q=0.9',
      'Connection': 'keep-alive'
    },
    transform: (data: any): CryptoData[] => {
      if (!data.Data || !Array.isArray(data.Data)) return [];
      return data.Data.map((coin: any, index: number) => {
        const raw = coin.RAW?.USD;
        if (!raw || !raw.TOTALVOLUME24H || !raw.MKTCAP) return null;
        
        return {
          symbol: coin.CoinInfo.Name,
          name: coin.CoinInfo.FullName,
          marketCap: raw.MKTCAP,
          volume24h: raw.TOTALVOLUME24H,
          volumeToMarketCapRatio: raw.TOTALVOLUME24H / raw.MKTCAP,
          rank: index + 1,
          price: raw.PRICE,
          change24h: raw.CHANGE24HOUR,
          source: 'CryptoCompare'
        };
      }).filter(Boolean);
    }
  },
  {
    name: 'CoinGecko',
    url: 'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=100&page=1&sparkline=false',
    timeout: 20000,
    headers: {
      'Accept': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept-Language': 'en-US,en;q=0.9',
      'Connection': 'keep-alive'
    },
    transform: (data: any): CryptoData[] => {
      if (!Array.isArray(data)) return [];
      return data.map((coin: any, index: number) => ({
        symbol: coin.symbol,
        name: coin.name,
        marketCap: coin.market_cap,
        volume24h: coin.total_volume,
        volumeToMarketCapRatio: coin.total_volume / coin.market_cap,
        rank: index + 1,
        price: coin.current_price,
        change24h: coin.price_change_percentage_24h,
        source: 'CoinGecko'
      })).filter((coin: any) => coin.marketCap && coin.volume24h);
    }
  },
  {
    name: 'CoinCap',
    url: 'https://api.coincap.io/v2/assets?limit=200',
    timeout: 15000,
    headers: {
      'Accept': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept-Language': 'en-US,en;q=0.9',
      'Connection': 'keep-alive'
    },
    transform: (data: any): CryptoData[] => {
      if (!data.data || !Array.isArray(data.data)) return [];
      return data.data.map((coin: any, index: number) => ({
        symbol: coin.symbol,
        name: coin.name,
        marketCap: parseFloat(coin.marketCapUsd) || 0,
        volume24h: parseFloat(coin.volumeUsd24Hr) || 0,
        volumeToMarketCapRatio: (parseFloat(coin.volumeUsd24Hr) || 0) / (parseFloat(coin.marketCapUsd) || 1),
        rank: index + 1,
        price: parseFloat(coin.priceUsd) || 0,
        change24h: parseFloat(coin.changePercent24Hr) || 0,
        source: 'CoinCap'
      })).filter((coin: any) => coin.marketCap > 0 && coin.volume24h > 0);
    }
  },
  {
    name: 'CoinPaprika',
    url: 'https://api.coinpaprika.com/v1/tickers',
    timeout: 15000,
    headers: {
      'Accept': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept-Language': 'en-US,en;q=0.9',
      'Connection': 'keep-alive'
    },
    transform: (data: any): CryptoData[] => {
      if (!Array.isArray(data)) return [];
      return data.slice(0, 150).map((coin: any, index: number) => ({
        symbol: coin.symbol,
        name: coin.name,
        marketCap: coin.market_cap_usd || 0,
        volume24h: coin.volume_24h_usd || 0,
        volumeToMarketCapRatio: (coin.volume_24h_usd || 0) / (coin.market_cap_usd || 1),
        rank: coin.rank || index + 1,
        price: coin.quotes?.USD?.price || 0,
        change24h: coin.quotes?.USD?.percent_change_24h || 0,
        source: 'CoinPaprika'
      })).filter((coin: any) => coin.marketCap > 0 && coin.volume24h > 0);
    }
  }
];


// 更新进度
function updateProgress(step: string, progress: number, status: AnalysisProgress['status'] = 'running') {
  analysisProgress = {
    ...analysisProgress,
    status,
    currentStep: step,
    progress: Math.min(100, Math.max(0, progress))
  };
  console.log(`📊 [${progress}%] ${step}`);
}

// 获取当前进度
export function getAnalysisProgress(): AnalysisProgress {
  return { ...analysisProgress };
}

// 重置进度
export function resetAnalysisProgress() {
  analysisProgress = {
    status: 'idle',
    currentStep: '准备就绪',
    progress: 0,
    results: undefined,
    startTime: undefined,
    endTime: undefined
  };
}

// 测试快速API连接
export async function testFastApiConnections(): Promise<Record<string, boolean>> {
  console.log('🚀 测试快速API连接...');
  const results: Record<string, boolean> = {};
  
  for (const api of FAST_API_SOURCES) {
    try {
      console.log(`📡 测试 ${api.name}...`);
      const response = await axios.get(api.url, {
        timeout: api.timeout,
        headers: api.headers
      });
      
      const data = api.transform(response.data);
      results[api.name] = data.length > 0;
      
      if (data.length > 0) {
        console.log(`✅ ${api.name}: ${data.length} 个币种`);
      } else {
        console.log(`⚠️ ${api.name}: 无有效数据`);
      }
      
    } catch (error: any) {
      console.log(`❌ ${api.name}: ${error.message}`);
      results[api.name] = false;
    }
  }
  
  return results;
}

// 运行快速状态化分析
export async function runFastStatusAnalysis(): Promise<{
  success: boolean;
  batchId?: number;
  count?: number;
  error?: string;
}> {
  try {
    analysisProgress.startTime = new Date();
    updateProgress('开始快速分析...', 10);
    
    // 测试API连接
    updateProgress('测试API连接...', 20);
    const connectionResults = await testFastApiConnections();
    
    const workingApis = Object.keys(connectionResults).filter(key => connectionResults[key]);
    if (workingApis.length === 0) {
      throw new Error('所有API源都无法连接，请检查网络连接');
    }
    
    console.log(`✅ 可用快速API: ${workingApis.join(', ')}`);
    
    // 获取数据
    updateProgress('获取市场数据...', 30);
    const allData: CryptoData[] = [];
    const sourceResults: Record<string, number> = {};
    
    for (const api of FAST_API_SOURCES) {
      if (!connectionResults[api.name]) continue;
      
      let retryCount = 0;
      const maxRetries = 2;
      
      while (retryCount <= maxRetries) {
        try {
          updateProgress(`获取 ${api.name} 数据... (尝试 ${retryCount + 1}/${maxRetries + 1})`, 30 + (workingApis.indexOf(api.name) * 20));
          
          const response = await axios.get(api.url, {
            timeout: api.timeout,
            headers: api.headers
          });
          
          const data = api.transform(response.data);
          sourceResults[api.name] = data.length;
          allData.push(...data);
          
          console.log(`✅ ${api.name}: ${data.length} 个币种`);
          break; // 成功获取数据，跳出重试循环
          
        } catch (error: any) {
          retryCount++;
          console.log(`❌ ${api.name} 数据获取失败 (尝试 ${retryCount}/${maxRetries + 1}): ${error.message}`);
          
          if (retryCount > maxRetries) {
            console.log(`⚠️ ${api.name} 最终失败，跳过`);
            sourceResults[api.name] = 0;
          } else {
            // 等待一段时间后重试
            await new Promise(resolve => setTimeout(resolve, 2000));
          }
        }
      }
    }
    
    if (allData.length === 0) {
      throw new Error('所有API源都返回了空结果');
    }
    
    // 去重和排序
    updateProgress('处理数据...', 70);
    const uniqueData = new Map<string, CryptoData>();
    
    // 按数据源优先级处理去重
    const sourcePriority = ['CoinMarketCap', 'CryptoCompare', 'CoinGecko', 'CoinCap', 'CoinPaprika'];
    
    allData.forEach(coin => {
      const key = coin.symbol.toLowerCase();
      if (!uniqueData.has(key)) {
        uniqueData.set(key, coin);
      } else {
        // 如果已存在，检查优先级
        const existing = uniqueData.get(key)!;
        const existingPriority = sourcePriority.indexOf(existing.source);
        const newPriority = sourcePriority.indexOf(coin.source);
        
        // 如果新数据的源优先级更高，或者数据更完整，则替换
        if (newPriority < existingPriority || 
            (coin.marketCap > 0 && coin.volume24h > 0 && (existing.marketCap === 0 || existing.volume24h === 0))) {
          uniqueData.set(key, coin);
        }
      }
    });
    
    const finalData = Array.from(uniqueData.values())
      .filter(coin => coin.marketCap > 0 && coin.volume24h > 0) // 过滤无效数据
      .sort((a, b) => b.volumeToMarketCapRatio - a.volumeToMarketCapRatio);
    
    console.log(`📊 处理完成: ${finalData.length} 个唯一币种`);
    console.log('🏆 前5名交易量市值比率:');
    finalData.slice(0, 5).forEach((coin, index) => {
      console.log(`  ${index + 1}. ${coin.name} (${coin.symbol}): ${coin.volumeToMarketCapRatio.toFixed(6)} - 来源: ${coin.source}`);
    });
    
    // 保存到数据库
    updateProgress('保存到数据库...', 90);
    
    // 获取最新批次
    const latestBatch = await db.select().from(volumeToMarketCapBatches)
      .orderBy(volumeToMarketCapBatches.id)
      .limit(1);
    
    // 创建新批次
    const [newBatch] = await db.insert(volumeToMarketCapBatches).values({
      entriesCount: finalData.length,
      hasChanges: finalData.length > 0,
      previousBatchId: latestBatch[0]?.id || null
    }).returning({ id: volumeToMarketCapBatches.id });
    
    const batchId = newBatch.id;
    
    // 分批插入数据以避免数据库负载过大
    const batchSize = 50; // 减小批次大小
    let processedCount = 0;
    
    for (let i = 0; i < finalData.length; i += batchSize) {
      const batch = finalData.slice(i, i + batchSize);
      const insertData = [];
      
      for (const coin of batch) {
        try {
          // 首先确保加密货币存在于cryptocurrencies表中
          const existingCrypto = await db.select().from(cryptocurrencies)
            .where(eq(cryptocurrencies.symbol, coin.symbol))
            .limit(1);
          
          let cryptoId;
          if (existingCrypto.length > 0) {
            // 更新现有加密货币信息
            cryptoId = existingCrypto[0].id;
            await db.update(cryptocurrencies).set({
              name: coin.name,
              marketCap: coin.marketCap,
              price: coin.price || null,
              volume24h: coin.volume24h,
              priceChange24h: coin.change24h || null,
              updatedAt: new Date()
            }).where(eq(cryptocurrencies.id, cryptoId));
          } else {
            // 插入新的加密货币
            const [newCrypto] = await db.insert(cryptocurrencies).values({
              name: coin.name,
              symbol: coin.symbol,
              marketCap: coin.marketCap,
              price: coin.price || null,
              volume24h: coin.volume24h,
              priceChange24h: coin.change24h || null,
              createdAt: new Date(),
              updatedAt: new Date()
            }).returning({ id: cryptocurrencies.id });
            cryptoId = newCrypto.id;
          }
          
          // 准备插入比率数据
          insertData.push({
            batchId: batchId,
            cryptocurrencyId: cryptoId, // 使用正确的cryptocurrency_id
            cryptocurrencySymbol: coin.symbol,
            cryptocurrencyName: coin.name,
            marketCap: coin.marketCap,
            volume24h: coin.volume24h,
            volumeToMarketCapRatio: coin.volumeToMarketCapRatio,
            rank: i + insertData.length + 1,
            priceUsd: coin.price || null,
            priceChange24h: coin.change24h || null,
            source: coin.source
          });
          
        } catch (error) {
          console.log(`⚠️ 处理币种 ${coin.symbol} 时出错: ${error.message}`);
          // 继续处理下一个币种
        }
      }
      
      // 批量插入比率数据
      if (insertData.length > 0) {
        await db.insert(volumeToMarketCapRatios).values(insertData);
        processedCount += insertData.length;
      }
      
      // 更新进度
      const progress = 90 + Math.floor((processedCount / finalData.length) * 10);
      updateProgress(`保存数据批次 ${Math.floor(i/batchSize) + 1}/${Math.ceil(finalData.length/batchSize)} (已处理 ${processedCount}/${finalData.length})`, progress);
    }
    
    updateProgress('分析完成', 100, 'completed');
    analysisProgress.endTime = new Date();
    
    const result = {
      success: true,
      batchId,
      count: finalData.length
    };
    
    analysisProgress.results = result;
    
    console.log(`🎉 快速状态化分析完成！批次ID: ${batchId}, 记录数: ${finalData.length}`);
    
    return result;
    
  } catch (error: any) {
    console.error('❌ 快速状态化分析失败:', error);
    
    updateProgress('分析失败', 100, 'failed');
    analysisProgress.endTime = new Date();
    
    const result = {
      success: false,
      error: error.message
    };
    
    analysisProgress.results = result;
    return result;
  }
}
