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

let analysisProgress: AnalysisProgress = {
  status: 'idle',
  currentStep: '准备就绪',
  progress: 0
};

// 多API源配置 - 优先使用稳定的API，逐步收集更多数据
const API_SOURCES = [
  {
    name: 'CryptoCompare',
    url: 'https://min-api.cryptocompare.com/data/top/mktcapfull?limit=2000&tsym=USD',
    timeout: 15000,
    priority: 1,
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
    url: 'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=250&page=1',
    timeout: 20000,
    priority: 2,
    headers: {
      'Accept': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    },
    transform: (data: any): CryptoData[] => {
      if (!Array.isArray(data)) return [];
      return data.map((coin: any, index: number) => {
        if (!coin.market_cap || !coin.total_volume) return null;
        
        return {
          symbol: coin.symbol?.toUpperCase(),
          name: coin.name,
          marketCap: coin.market_cap,
          volume24h: coin.total_volume,
          volumeToMarketCapRatio: coin.total_volume / coin.market_cap,
          rank: index + 1,
          price: coin.current_price,
          change24h: coin.price_change_percentage_24h,
          source: 'CoinGecko'
        };
      }).filter(Boolean);
    }
  }
];

function updateProgress(step: string, progress: number, status: AnalysisProgress['status'] = 'running') {
  analysisProgress = {
    ...analysisProgress,
    status,
    currentStep: step,
    progress,
    endTime: status === 'completed' || status === 'failed' ? new Date() : undefined
  };
  console.log(`📊 [${progress}%] ${step}${status !== 'running' ? ` (状态: ${status})` : ''}`);
}

export function getAnalysisProgress() {
  return analysisProgress;
}

export function resetAnalysisProgress() {
  analysisProgress = {
    status: 'idle',
    currentStep: '准备就绪',
    progress: 0
  };
  console.log('🔄 分析进度已重置');
}

export async function testApiConnection(): Promise<boolean> {
  console.log('🚀 测试API连接...');
  
  for (const api of API_SOURCES) {
    try {
      console.log(`📡 测试 ${api.name}...`);
      const response = await axios.get(api.url, {
        timeout: api.timeout,
        headers: api.headers
      });
      const data = api.transform(response.data);
      if (data.length > 0) {
        console.log(`✅ ${api.name}: ${data.length} 个币种`);
        return true;
      }
    } catch (error: any) {
      console.log(`❌ ${api.name}: ${error.message}`);
    }
  }
  
  console.log('⚠️ 所有API源都无法连接');
  return false;
}

export async function runSimpleStableAnalysis(): Promise<{
  success: boolean;
  batchId?: number;
  count?: number;
  error?: string;
}> {
  if (analysisProgress.status === 'running') {
    return { success: false, error: '分析已在运行中' };
  }

  analysisProgress.startTime = new Date();
  updateProgress('开始简单稳定分析...', 10);

  try {
    // 1. 测试API连接
    updateProgress('测试API连接...', 20);
    const isConnected = await testApiConnection();
    
    if (!isConnected) {
      throw new Error('API连接失败，请检查网络连接');
    }

    // 2. 获取市场数据
    updateProgress('获取市场数据...', 30);
    let allData: CryptoData[] = [];
    
    // 按优先级尝试多个API源
    for (const api of API_SOURCES) {
      try {
        updateProgress(`获取 ${api.name} 数据...`, 30);
        console.log(`📊 [30%] 获取 ${api.name} 数据...`);
        
        const response = await axios.get(api.url, {
          timeout: api.timeout,
          headers: api.headers
        });
        
        const data = api.transform(response.data);
        allData.push(...data);
        
        console.log(`✅ ${api.name}: ${data.length} 个币种`);
        
        // 如果已经获取到足够的数据，可以提前结束
        if (allData.length >= 1000) {
          console.log(`📊 已获取足够数据 (${allData.length} 个币种)，继续处理...`);
          break;
        }
        
      } catch (error: any) {
        console.log(`❌ ${api.name} 数据获取失败: ${error.message}`);
        // 继续尝试下一个API源
      }
    }
    
    if (allData.length === 0) {
      throw new Error('所有API源都返回了空结果');
    }
    
    console.log(`✅ 获取到 ${allData.length} 个币种的数据`);

    // 3. 处理数据
    updateProgress('处理数据...', 50);
    
    // 去重并合并数据
    const uniqueData = new Map<string, CryptoData>();
    for (const coin of allData) {
      const key = coin.symbol?.toUpperCase();
      if (key && (!uniqueData.has(key) || uniqueData.get(key)!.marketCap < coin.marketCap)) {
        uniqueData.set(key, coin);
      }
    }
    
    const finalData = Array.from(uniqueData.values())
      .filter(coin => coin.marketCap > 0 && coin.volume24h > 0)
      .sort((a, b) => b.volumeToMarketCapRatio - a.volumeToMarketCapRatio);

    console.log(`📊 处理完成: ${finalData.length} 个有效币种`);
    console.log('🏆 前5名交易量市值比率:');
    finalData.slice(0, 5).forEach((coin, index) => {
      console.log(`  ${index + 1}. ${coin.name} (${coin.symbol}): ${coin.volumeToMarketCapRatio.toFixed(6)}`);
    });

    // 4. 保存到数据库
    updateProgress('保存到数据库...', 70);

    // 创建新批次
    const [newBatch] = await db.insert(volumeToMarketCapBatches).values({
      entriesCount: finalData.length,
      hasChanges: true,
      previousBatchId: null
    }).returning({ id: volumeToMarketCapBatches.id });

    const batchId = newBatch.id;
    console.log(`📝 创建分析批次 ID: ${batchId}`);

    // 分批处理数据
    const batchSize = 20; // 小批次处理
    let processedCount = 0;
    
    for (let i = 0; i < finalData.length; i += batchSize) {
      const batch = finalData.slice(i, i + batchSize);
      const insertData = [];
      
      for (const coin of batch) {
        try {
          // 确保加密货币存在于cryptocurrencies表中
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
              slug: coin.symbol.toLowerCase(), // 添加必需的slug字段
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
            cryptocurrencyId: cryptoId,
            symbol: coin.symbol,  // 使用正确的字段名
            name: coin.name,      // 使用正确的字段名
            marketCap: coin.marketCap,
            volumeToMarketCapRatio: coin.volumeToMarketCapRatio,
            rank: i + insertData.length + 1,
            includesFutures: true
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
      const progress = 70 + Math.floor((processedCount / finalData.length) * 30);
      updateProgress(`保存数据 ${processedCount}/${finalData.length}`, progress);
    }

    updateProgress('分析完成', 100, 'completed');
    analysisProgress.endTime = new Date();

    const result = {
      success: true,
      batchId,
      count: processedCount
    };

    console.log(`🎉 简单稳定分析完成: 批次 ${batchId}, 处理了 ${processedCount} 个币种`);
    return result;

  } catch (error: any) {
    console.error('❌ 简单稳定分析失败:', error);
    updateProgress('分析失败', 100, 'failed');
    analysisProgress.endTime = new Date();
    return { success: false, error: error.message };
  }
}
