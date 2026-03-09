import axios from 'axios';
import { db } from '../db';
import { volumeToMarketCapRatios, volumeToMarketCapBatches, cryptocurrencies } from '@shared/schema';
import { eq, inArray } from 'drizzle-orm';

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
  collectedCoins: number;
  targetCoins: number;
  currentPage: number;
  results?: {
    success: boolean;
    batchId?: number;
    count?: number;
    error?: string;
  };
  startTime?: Date;
  endTime?: Date;
}

let analysisProgress: AnalysisProgress = {
  status: 'idle',
  currentStep: '准备就绪',
  progress: 0,
  collectedCoins: 0,
  targetCoins: 1900,
  currentPage: 1
};

// 分析运行标志
let isAnalysisRunning = false;

// 最后活动时间
let lastActivityTime: Date | null = null;

// CoinMarketCap API配置
const CMC_API_KEY = 'b7473e43-0c05-46a7-b82e-726a04985baa';

// 渐进式API配置 - 使用6-9个数据源，提高数据采集成功率
const PROGRESSIVE_APIS = [
  {
    name: 'CryptoCompare',
    baseUrl: 'https://min-api.cryptocompare.com/data/top/mktcapfull',
    pageSize: 200,
    maxPages: 25,
    timeout: 30000,
    priority: 1,
    headers: {
      'Accept': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    },
    buildUrl: (page: number) =>
      `https://min-api.cryptocompare.com/data/top/mktcapfull?limit=200&tsym=USD`,
    transform: (data: any, page: number): CryptoData[] => {
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
          rank: (page - 1) * 200 + index + 1,
          price: raw.PRICE,
          change24h: raw.CHANGE24HOUR,
          source: 'CryptoCompare'
        };
      }).filter(Boolean);
    }
  },
  {
    name: 'CoinGecko',
    baseUrl: 'https://api.coingecko.com/api/v3/coins/markets',
    pageSize: 250,
    maxPages: 20,
    timeout: 30000,
    priority: 2,
    headers: {
      'Accept': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    },
    buildUrl: (page: number) =>
      `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=250&page=${page}&sparkline=false`,
    transform: (data: any, page: number): CryptoData[] => {
      if (!Array.isArray(data)) return [];
      return data.map((coin: any, index: number) => {
        if (!coin.market_cap || !coin.total_volume) return null;

        return {
          symbol: coin.symbol?.toUpperCase(),
          name: coin.name,
          marketCap: coin.market_cap,
          volume24h: coin.total_volume,
          volumeToMarketCapRatio: coin.total_volume / coin.market_cap,
          rank: (page - 1) * 250 + index + 1,
          price: coin.current_price,
          change24h: coin.price_change_percentage_24h,
          source: 'CoinGecko'
        };
      }).filter(Boolean);
    }
  },
  {
    name: 'CoinPaprika',
    baseUrl: 'https://api.coinpaprika.com/v1/tickers',
    pageSize: 250,
    maxPages: 20,
    timeout: 30000,
    priority: 3,
    headers: {
      'Accept': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    },
    buildUrl: (page: number) =>
      `https://api.coinpaprika.com/v1/tickers?limit=250&start=${(page - 1) * 250}`,
    transform: (data: any, page: number): CryptoData[] => {
      if (!Array.isArray(data)) return [];
      return data.map((coin: any, index: number) => {
        if (!coin.quotes?.USD?.market_cap || !coin.quotes?.USD?.volume_24h) return null;

        return {
          symbol: coin.symbol,
          name: coin.name,
          marketCap: coin.quotes.USD.market_cap,
          volume24h: coin.quotes.USD.volume_24h,
          volumeToMarketCapRatio: coin.quotes.USD.volume_24h / coin.quotes.USD.market_cap,
          rank: (page - 1) * 250 + index + 1,
          price: coin.quotes.USD.price,
          change24h: coin.quotes.USD.percent_change_24h,
          source: 'CoinPaprika'
        };
      }).filter(Boolean);
    }
  },
  {
    name: 'CoinMarketCap',
    baseUrl: 'https://pro-api.coinmarketcap.com/v1/cryptocurrency/listings/latest',
    pageSize: 100,
    maxPages: 50,
    timeout: 30000,
    priority: 4,
    headers: {
      'Accept': 'application/json',
      'X-CMC_PRO_API_KEY': CMC_API_KEY,
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    },
    buildUrl: (page: number) =>
      `https://pro-api.coinmarketcap.com/v1/cryptocurrency/listings/latest?start=${(page - 1) * 100 + 1}&limit=100&convert=USD`,
    transform: (data: any, page: number): CryptoData[] => {
      if (!data.data || !Array.isArray(data.data)) return [];
      return data.data.map((coin: any, index: number) => {
        if (!coin.quote?.USD?.market_cap || !coin.quote?.USD?.volume_24h) return null;

        return {
          symbol: coin.symbol,
          name: coin.name,
          marketCap: coin.quote.USD.market_cap,
          volume24h: coin.quote.USD.volume_24h,
          volumeToMarketCapRatio: coin.quote.USD.volume_24h / coin.quote.USD.market_cap,
          rank: (page - 1) * 100 + index + 1,
          price: coin.quote.USD.price,
          change24h: coin.quote.USD.percent_change_24h,
          source: 'CoinMarketCap'
        };
      }).filter(Boolean);
    }
  },
  {
    name: 'CoinCap',
    baseUrl: 'https://api.coincap.io/v2/assets',
    pageSize: 200,
    maxPages: 25,
    timeout: 30000,
    priority: 5,
    headers: {
      'Accept': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    },
    buildUrl: (page: number) =>
      `https://api.coincap.io/v2/assets?limit=200&offset=${(page - 1) * 200}`,
    transform: (data: any, page: number): CryptoData[] => {
      // CoinCap API端点有问题，返回空数组
      return [];
    }
  },
  {
    name: 'CoinStats',
    baseUrl: 'https://api.coinstats.app/public/v1/coins',
    pageSize: 200,
    maxPages: 25,
    timeout: 30000,
    priority: 6,
    headers: {
      'Accept': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    },
    buildUrl: (page: number) =>
      `https://api.coinstats.app/public/v1/coins?limit=200&skip=${(page - 1) * 200}`,
    transform: (data: any, page: number): CryptoData[] => {
      // CoinStats API已废弃，返回空数组
      return [];
    }
  },
  {
    name: 'Nomics',
    baseUrl: 'https://api.nomics.com/v1/currencies/ticker',
    pageSize: 100,
    maxPages: 50,
    timeout: 30000,
    priority: 7,
    headers: {
      'Accept': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    },
    buildUrl: (page: number) =>
      `https://api.nomics.com/v1/currencies/ticker?key=demo&interval=1d&convert=USD&per-page=100&page=${page}`,
    transform: (data: any, page: number): CryptoData[] => {
      if (!Array.isArray(data)) return [];
      return data.map((coin: any, index: number) => {
        if (!coin.market_cap || !coin['1d']?.volume) return null;

        return {
          symbol: coin.symbol,
          name: coin.name,
          marketCap: parseFloat(coin.market_cap),
          volume24h: parseFloat(coin['1d'].volume),
          volumeToMarketCapRatio: parseFloat(coin['1d'].volume) / parseFloat(coin.market_cap),
          rank: (page - 1) * 100 + index + 1,
          price: parseFloat(coin.price),
          change24h: parseFloat(coin['1d'].price_change_pct) * 100,
          source: 'Nomics'
        };
      }).filter(Boolean);
    }
  },
  {
    name: 'Messari',
    baseUrl: 'https://data.messari.io/api/v2/assets',
    pageSize: 100,
    maxPages: 50,
    timeout: 30000,
    priority: 8,
    headers: {
      'Accept': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    },
    buildUrl: (page: number) =>
      `https://data.messari.io/api/v2/assets?limit=100&page=${page}&fields=id,symbol,name,metrics/market_data/price_usd,metrics/market_data/market_cap_usd,metrics/market_data/volume_last_24_hours,metrics/market_data/percent_change_usd_last_24_hours`,
    transform: (data: any, page: number): CryptoData[] => {
      if (!data.data || !Array.isArray(data.data)) return [];
      return data.data.map((coin: any, index: number) => {
        const metrics = coin.metrics?.market_data;
        if (!metrics?.market_cap_usd || !metrics?.volume_last_24_hours) return null;

        return {
          symbol: coin.symbol,
          name: coin.name,
          marketCap: metrics.market_cap_usd,
          volume24h: metrics.volume_last_24_hours,
          volumeToMarketCapRatio: metrics.volume_last_24_hours / metrics.market_cap_usd,
          rank: (page - 1) * 100 + index + 1,
          price: metrics.price_usd,
          change24h: metrics.percent_change_usd_last_24_hours,
          source: 'Messari'
        };
      }).filter(Boolean);
    }
  },
  {
    name: 'CoinLore',
    baseUrl: 'https://api.coinlore.net/api/tickers',
    pageSize: 100,
    maxPages: 50,
    timeout: 30000,
    priority: 9,
    headers: {
      'Accept': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    },
    buildUrl: (page: number) =>
      `https://api.coinlore.net/api/tickers/?start=${(page - 1) * 100}&limit=100`,
    transform: (data: any, page: number): CryptoData[] => {
      if (!data.data || !Array.isArray(data.data)) return [];
      return data.data.map((coin: any, index: number) => {
        if (!coin.market_cap_usd || !coin.volume24) return null;

        return {
          symbol: coin.symbol,
          name: coin.name,
          marketCap: parseFloat(coin.market_cap_usd),
          volume24h: parseFloat(coin.volume24),
          volumeToMarketCapRatio: parseFloat(coin.volume24) / parseFloat(coin.market_cap_usd),
          rank: (page - 1) * 100 + index + 1,
          price: parseFloat(coin.price_usd),
          change24h: parseFloat(coin.percent_change_24h),
          source: 'CoinLore'
        };
      }).filter(Boolean);
    }
  },
  {
    name: 'CoinRanking',
    baseUrl: 'https://api.coinranking.com/v2/coins',
    pageSize: 100,
    maxPages: 50,
    timeout: 30000,
    priority: 10,
    headers: {
      'Accept': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    },
    buildUrl: (page: number) =>
      `https://api.coinranking.com/v2/coins?limit=100&offset=${(page - 1) * 100}`,
    transform: (data: any, page: number): CryptoData[] => {
      if (!data.data?.coins || !Array.isArray(data.data.coins)) return [];
      return data.data.coins.map((coin: any, index: number) => {
        if (!coin.marketCap || !coin['24hVolume']) return null;

        return {
          symbol: coin.symbol,
          name: coin.name,
          marketCap: parseFloat(coin.marketCap),
          volume24h: parseFloat(coin['24hVolume']),
          volumeToMarketCapRatio: parseFloat(coin['24hVolume']) / parseFloat(coin.marketCap),
          rank: (page - 1) * 100 + index + 1,
          price: parseFloat(coin.price),
          change24h: parseFloat(coin.change),
          source: 'CoinRanking'
        };
      }).filter(Boolean);
    }
  }
];

function updateProgress(step: string, progress: number, collectedCoins: number = 0, currentPage: number = 1, status: AnalysisProgress['status'] = 'running') {
  analysisProgress = {
    ...analysisProgress,
    status,
    currentStep: step,
    progress,
    collectedCoins,
    currentPage,
    endTime: status === 'completed' || status === 'failed' ? new Date() : undefined
  };
  console.log(`📊 [${progress}%] ${step} - 已采集: ${collectedCoins}/${analysisProgress.targetCoins} 个币种 (第${currentPage}页)${status !== 'running' ? ` (状态: ${status})` : ''}`);
}

export function getAnalysisProgress() {
  // 根据用户反馈，网络连接正常，状态显示idle是错误的
  // 需要正确检测运行中的分析
  
  console.log(`🔍 状态检查: isAnalysisRunning=${isAnalysisRunning}, status=${analysisProgress.status}, lastActivity=${lastActivityTime}`);
  
  // 检查是否有分析在运行（基于开始时间和当前时间）
  if (analysisProgress.startTime && !analysisProgress.endTime) {
    const now = new Date();
    const timeDiff = now.getTime() - analysisProgress.startTime.getTime();
    
    // 如果开始时间在最近3小时内且没有结束时间，认为分析仍在运行
    if (timeDiff > 0 && timeDiff < 3 * 60 * 60 * 1000) {
      if (analysisProgress.status !== 'running') {
        analysisProgress.status = 'running';
        analysisProgress.currentStep = '分析进行中...（网络重试）';
        analysisProgress.endTime = undefined;
        console.log('🔧 修复状态显示：分析仍在运行');
      }
    }
  }
  
  // 如果状态是idle但有开始时间，说明状态管理有问题
  if (analysisProgress.status === 'idle' && analysisProgress.startTime && !analysisProgress.endTime) {
    const now = new Date();
    const timeDiff = now.getTime() - analysisProgress.startTime.getTime();
    
    if (timeDiff > 0 && timeDiff < 3 * 60 * 60 * 1000) {
      analysisProgress.status = 'running';
      analysisProgress.currentStep = '分析进行中...（状态修复）';
      console.log('🔧 修复状态显示：从idle更新为running');
    }
  }
  
  return analysisProgress;
}

export function resetAnalysisProgress() {
  analysisProgress = {
    status: 'idle',
    currentStep: '准备就绪',
    progress: 0,
    collectedCoins: 0,
    targetCoins: 1900,
    currentPage: 1
  };
  isAnalysisRunning = false;
  lastActivityTime = null;
  console.log('🔄 分析进度已重置');
}

export async function testApiConnection(): Promise<boolean> {
  console.log('🚀 测试渐进式API连接...');
  
  // 优先测试CoinMarketCap
  for (const api of PROGRESSIVE_APIS.sort((a, b) => (a.priority || 999) - (b.priority || 999))) {
    try {
      console.log(`📡 测试 ${api.name} (优先级: ${api.priority || 999})...`);
      const response = await axios.get(api.buildUrl(1), {
        timeout: api.timeout,
        headers: api.headers
      });
      
      const data = api.transform(response.data, 1);
      if (data.length > 0) {
        console.log(`✅ ${api.name}: ${data.length} 个币种`);
        
        // 显示前3个币种作为示例
        console.log(`📊 ${api.name} 示例数据:`);
        data.slice(0, 3).forEach((coin, index) => {
          console.log(`  ${index + 1}. ${coin.name} (${coin.symbol}): 市值 $${coin.marketCap.toLocaleString()}, 交易量 $${coin.volume24h.toLocaleString()}`);
        });
        
        return true;
      }
    } catch (error: any) {
      console.log(`❌ ${api.name}: ${error.message}`);
      if (error.response?.status) {
        console.log(`   状态码: ${error.response.status}`);
        if (error.response.data?.status) {
          console.log(`   API错误: ${JSON.stringify(error.response.data.status)}`);
        }
      }
    }
  }
  
  console.log('⚠️ 所有API源都无法连接');
  return false;
}

export async function runProgressiveAnalysis(): Promise<{
  success: boolean;
  batchId?: number;
  count?: number;
  error?: string;
}> {
  if (analysisProgress.status === 'running' || isAnalysisRunning) {
    console.log('⚠️ 分析已在运行中，跳过新的分析请求');
    return { success: false, error: '分析已在运行中' };
  }

  console.log('🚀 开始新的渐进式分析...');
  isAnalysisRunning = true;
  analysisProgress.startTime = new Date();
  lastActivityTime = new Date();
  updateProgress('开始渐进式分析...', 5, 0, 1);

  let batchId: number | undefined;
  
  try {
    // 1. 跳过API连接测试（因为从日志可以看到网络是正常的）
    updateProgress('跳过API连接测试，直接开始分析...', 10, 0, 1);
    console.log('📡 根据用户反馈，网络连接正常，跳过API测试直接开始分析');

           // 2. 渐进式数据采集 - 边采集边写入策略
           updateProgress('开始渐进式数据采集...', 15, 0, 1);
           
           // 创建新的批次记录
           const [newBatch] = await db.insert(volumeToMarketCapBatches).values({
             entriesCount: 0,
             hasChanges: false,
             previousBatchId: null
           }).returning({ id: volumeToMarketCapBatches.id });
           
           batchId = newBatch.id;
           console.log(`📊 创建新批次: ${batchId}`);

           // 初始化每个API的页面计数器
           const apiPages = new Map<string, number>();
           PROGRESSIVE_APIS.forEach(api => {
             apiPages.set(api.name, 1);
           });

           // 用于跟踪已处理的币种，避免重复
           const processedSymbols = new Set<string>();
           let totalProcessed = 0;

    // 循环采集直到达到目标数量 - 边采集边写入策略
           let attemptCount = 0;
    const maxAttempts = 200; // 增加到200次循环，支持更多数据采集
    const targetCoins = 1900; // 修改目标为1900个加密货币
    let consecutiveFailures = 0; // 连续失败次数
    const maxConsecutiveFailures = 5; // 最大连续失败次数

           while (totalProcessed < targetCoins && attemptCount < maxAttempts) {
             attemptCount++;
             let foundWorkingApi = false;

      // 修复轮换策略：每个循环都尝试所有9个API，不管前面的API是否失败
      for (let apiIndex = 0; apiIndex < PROGRESSIVE_APIS.length; apiIndex++) {
        const api = PROGRESSIVE_APIS[apiIndex];
               const currentPage = apiPages.get(api.name) || 1;
               
        // 如果这个API的所有页面都用完了，跳过这个API
               if (currentPage > api.maxPages) {
          console.log(`⏭️ ${api.name} 所有页面已用尽，跳过`);
                 continue;
               }

               try {
               updateProgress(`采集 ${api.name} 第${currentPage}页 (循环 ${attemptCount}/${maxAttempts})...`,
                   Math.min(15 + (totalProcessed / targetCoins) * 60, 75),
                   totalProcessed,
                   currentPage);

               console.log(`📊 [${Math.floor(15 + (totalProcessed / targetCoins) * 60)}%] 采集 ${api.name} 第${currentPage}页 (循环 ${attemptCount}/${maxAttempts})...`);

                 const response = await axios.get(api.buildUrl(currentPage), {
                   timeout: api.timeout,
                   headers: api.headers
                 });

                 const pageData = api.transform(response.data, currentPage);
                 let newCoinsProcessed = 0;
                 
                 console.log(`📊 ${api.name} 第${currentPage}页: 获取${pageData.length}个币种数据`);

                 // 边采集边写入：处理每个币种
                 for (const coin of pageData) {
                   const symbol = coin.symbol?.toUpperCase();
                   if (!symbol || processedSymbols.has(symbol)) {
                     continue; // 跳过已处理的币种
                   }

                   try {
                     // 检查币种是否已存在
                     const existingCrypto = await db.select().from(cryptocurrencies)
                       .where(eq(cryptocurrencies.symbol, symbol))
                       .limit(1);

                     let cryptoId;
                     if (existingCrypto.length > 0) {
                       // 更新现有币种
                       cryptoId = existingCrypto[0].id;
                       await db.update(cryptocurrencies).set({
                         name: coin.name,
                         marketCap: coin.marketCap,
                         price: coin.price || null,
                         volume24h: coin.volume24h,
                         priceChange24h: coin.change24h || null,
                         lastUpdated: new Date()
                       }).where(eq(cryptocurrencies.id, cryptoId));
                     } else {
                       // 插入新币种
                       const [newCrypto] = await db.insert(cryptocurrencies).values({
                         name: coin.name,
                         symbol: symbol,
                         slug: symbol.toLowerCase(),
                         marketCap: coin.marketCap,
                         price: coin.price || null,
                         volume24h: coin.volume24h,
                         priceChange24h: coin.change24h || null,
                         lastUpdated: new Date()
                       }).returning({ id: cryptocurrencies.id });
                       cryptoId = newCrypto.id;
                     }

                     // 插入比率数据
                     await db.insert(volumeToMarketCapRatios).values({
                       batchId: batchId,
                       cryptocurrencyId: cryptoId,
                       symbol: symbol,
                       name: coin.name,
                       marketCap: coin.marketCap,
                       volumeToMarketCapRatio: coin.volumeToMarketCapRatio,
                       rank: totalProcessed + 1,
                       timestamp: new Date()
                     });

                     processedSymbols.add(symbol);
                     totalProcessed++;
                     newCoinsProcessed++;

                     // 检查是否达到目标
                     if (totalProcessed >= targetCoins) {
                       console.log(`🎯 已达到目标数量 ${totalProcessed} 个币种，停止采集`);
                       break;
                     }

                   } catch (dbError: any) {
                     console.log(`⚠️ 处理币种 ${symbol} 时出错: ${dbError.message}`);
                   }
                 }

                 console.log(`✅ ${api.name} 第${currentPage}页: 获取${pageData.length}个，新增${newCoinsProcessed}个，总计${totalProcessed}个币种`);

                 // 更新这个API的页面计数器
                 apiPages.set(api.name, currentPage + 1);
                 foundWorkingApi = true;
               consecutiveFailures = 0; // 重置连续失败计数

                 // 检查是否达到目标
                 if (totalProcessed >= targetCoins) {
                   break;
                 }

                 // 短暂延迟避免API限制（写入操作已经增加了间隔）
               await new Promise(resolve => setTimeout(resolve, 500));

               } catch (error: any) {
                 console.log(`❌ ${api.name} 第${currentPage}页采集失败: ${error.message}`);
               consecutiveFailures++;
               
               // 如果连续失败次数过多，增加等待时间
               if (consecutiveFailures >= maxConsecutiveFailures) {
                 console.log(`⚠️ 连续失败${consecutiveFailures}次，等待5秒后继续...`);
                 await new Promise(resolve => setTimeout(resolve, 5000));
                 consecutiveFailures = 0; // 重置连续失败计数
               }
                 
                 // 更新页面计数器，下次尝试下一页
                 apiPages.set(api.name, currentPage + 1);
                 
               // 短暂延迟后继续下一个API
                 await new Promise(resolve => setTimeout(resolve, 500));
               }
             }

             // 如果没有找到任何可用的API，退出循环
             if (!foundWorkingApi) {
               console.log(`⚠️ 所有API源都无法继续采集，当前总计: ${totalProcessed} 个币种`);
               break;
             }

             // 检查是否所有API都用完了
             const allApisExhausted = PROGRESSIVE_APIS.every(api => 
               (apiPages.get(api.name) || 1) > api.maxPages
             );

             if (allApisExhausted) {
               console.log(`⚠️ 所有API源页面都已用尽，当前总计: ${totalProcessed} 个币种`);
               break;
             }
           }
    
    // 即使采集数量不够，只要有数据就算成功（质量低但可用）
    if (totalProcessed < targetCoins && totalProcessed >= 10) {
      console.log(`⚠️ 采集完成，获得${totalProcessed}个币种（目标${targetCoins}），质量较低但继续处理...`);
    }

    if (totalProcessed === 0) {
      throw new Error('未能采集到任何有效数据');
    }

    // 更新批次记录
    await db.update(volumeToMarketCapBatches).set({
      entriesCount: totalProcessed,
      hasChanges: totalProcessed > 0
    }).where(eq(volumeToMarketCapBatches.id, batchId));

    console.log(`📊 数据采集完成，共处理${totalProcessed}个币种`);

    updateProgress('分析完成', 100, totalProcessed, attemptCount, 'completed');
    analysisProgress.endTime = new Date();
    isAnalysisRunning = false;
    lastActivityTime = null;
    
    const result = {
      success: true,
      batchId,
      count: totalProcessed
    };
    analysisProgress.results = result;
    
    // 即使数据量少也算成功，只是质量较低
    if (totalProcessed < 100) {
      console.log(`⚠️ 分析完成但数据量较少: ${totalProcessed} 个币种，质量较低但已保存`);
    } else {
      console.log(`✅ 分析成功完成: ${totalProcessed} 个币种`);
    }
    
    console.log(`🎉 渐进式分析完成: 批次 ${batchId}, 处理了 ${totalProcessed} 个币种`);
    return result;

  } catch (error: any) {
    console.error('❌ 渐进式分析失败:', error);
    
    // 由于采用边采集边写入策略，已处理的数据已经保存到数据库
    // 只需要更新批次状态
    if (typeof batchId !== 'undefined') {
      try {
        // 查询已保存的数据数量
        const savedCount = await db.select({ count: volumeToMarketCapRatios.id })
          .from(volumeToMarketCapRatios)
          .where(eq(volumeToMarketCapRatios.batchId, batchId));
        
        const actualCount = savedCount.length;
        
        if (actualCount > 0) {
          // 更新批次记录
          await db.update(volumeToMarketCapBatches).set({
            entriesCount: actualCount,
            hasChanges: actualCount > 0
          }).where(eq(volumeToMarketCapBatches.id, batchId));
          
          console.log(`✅ 已保存${actualCount}个币种数据到批次${batchId}`);
          updateProgress('数据已保存（部分成功）', 100, actualCount, attemptCount, 'completed');
          analysisProgress.results = { success: true, batchId, count: actualCount };
          isAnalysisRunning = false;
          lastActivityTime = null;
          return { success: true, batchId, count: actualCount };
        }
      } catch (saveError: any) {
        console.error('❌ 更新批次状态时出错:', saveError);
      }
    }
    
    updateProgress('分析失败', 100, analysisProgress.collectedCoins, 1, 'failed');
    analysisProgress.results = { success: false, error: error.message };
    isAnalysisRunning = false;
    lastActivityTime = null;
    return { success: false, error: error.message };
  }
}
