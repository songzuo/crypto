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
  collectedCount: number;
  targetCount: number;
  currentApi: string;
  currentPage: number;
  totalPages: number;
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
  collectedCount: 0,
  targetCount: 1000,
  currentApi: '',
  currentPage: 0,
  totalPages: 0
};

// 多API源配置 - 后端代理方式，确保数据安全
const MULTI_API_SOURCES = [
  {
    name: 'CryptoCompare',
    baseUrl: 'https://min-api.cryptocompare.com/data/top/mktcapfull',
    pageSize: 100,
    maxPages: 25, // 25页，总共2500个币种
    timeout: 15000,
    priority: 1,
    headers: {
      'Accept': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    },
    buildUrl: (page: number) => 
      `https://min-api.cryptocompare.com/data/top/mktcapfull?limit=100&page=${page}&tsym=USD`,
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
          rank: (page - 1) * 100 + index + 1,
          price: raw.PRICE,
          change24h: raw.CHANGE24HOUR,
          source: 'CryptoCompare'
        };
      }).filter(Boolean);
    }
  },
  {
    name: 'CoinGecko_Large',
    baseUrl: 'https://api.coingecko.com/api/v3/coins/markets',
    pageSize: 250,
    maxPages: 12, // 12页，总共3000个币种
    timeout: 20000,
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
          source: 'CoinGecko_Large'
        };
      }).filter(Boolean);
    }
  },
  {
    name: 'CoinGecko_Medium',
    baseUrl: 'https://api.coingecko.com/api/v3/coins/markets',
    pageSize: 100,
    maxPages: 20, // 20页，总共2000个币种
    timeout: 18000,
    priority: 3,
    headers: {
      'Accept': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    },
    buildUrl: (page: number) => 
      `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=100&page=${page}&sparkline=false`,
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
          rank: (page - 1) * 100 + index + 1,
          price: coin.current_price,
          change24h: coin.price_change_percentage_24h,
          source: 'CoinGecko_Medium'
        };
      }).filter(Boolean);
    }
  }
];

function updateProgress(step: string, progress: number, collectedCount: number, currentApi: string, currentPage: number, totalPages: number, status: AnalysisProgress['status'] = 'running') {
  analysisProgress = {
    ...analysisProgress,
    status,
    currentStep: step,
    progress,
    collectedCount,
    currentApi,
    currentPage,
    totalPages,
    endTime: status === 'completed' || status === 'failed' ? new Date() : undefined
  };
  console.log(`📊 [${progress.toFixed(1)}%] ${step} | API: ${currentApi} (${currentPage}/${totalPages}) | 已采集: ${collectedCount}/${analysisProgress.targetCount} | 状态: ${status}`);
}

export function getAnalysisProgress() {
  return analysisProgress;
}

export function resetAnalysisProgress() {
  analysisProgress = {
    status: 'idle',
    currentStep: '准备就绪',
    progress: 0,
    collectedCount: 0,
    targetCount: 1000,
    currentApi: '',
    currentPage: 0,
    totalPages: 0
  };
  console.log('🔄 分析进度已重置');
}

export async function testApiConnection(): Promise<boolean> {
  console.log('🚀 测试多API连接...');
  
  for (const api of MULTI_API_SOURCES.sort((a, b) => a.priority - b.priority)) {
    try {
      console.log(`📡 测试 ${api.name} (优先级: ${api.priority})...`);
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
      }
    }
  }
  
  console.log('⚠️ 所有API源都无法连接');
  return false;
}

export async function runRobustMultiApiAnalysis(): Promise<{
  success: boolean;
  batchId?: number;
  count?: number;
  error?: string;
}> {
  if (analysisProgress.status === 'running') {
    return { success: false, error: '分析已在运行中' };
  }

  analysisProgress.startTime = new Date();
  updateProgress('开始健壮多API分析...', 5, 0, '', 0, 0);

  try {
    // 1. 测试API连接
    updateProgress('测试API连接...', 10, 0, '', 0, 0);
    const isConnected = await testApiConnection();
    if (!isConnected) {
      throw new Error('所有API源都无法连接，请检查网络连接');
    }

    // 2. 多API循环采集数据
    updateProgress('开始多API循环采集...', 15, 0, '', 0, 0);
    const allCollectedData = new Map<string, CryptoData>();
    let totalCollected = 0;
    let currentProgress = 15;
    
    // 计算总页数
    const totalPages = MULTI_API_SOURCES.reduce((sum, api) => sum + api.maxPages, 0);
    let currentPageIndex = 0;

    // 循环采集直到达到目标数量或所有API源遍历完成
    for (const api of MULTI_API_SOURCES.sort((a, b) => a.priority - b.priority)) {
      if (totalCollected >= analysisProgress.targetCount) {
        console.log(`🎯 已达到目标数量 ${totalCollected} 个币种，停止采集`);
        break;
      }

      console.log(`🔄 开始采集 ${api.name}，目标页数: ${api.maxPages}`);
      
      for (let page = 1; page <= api.maxPages; page++) {
        if (totalCollected >= analysisProgress.targetCount) {
          console.log(`🎯 已达到目标数量 ${totalCollected} 个币种，停止 ${api.name} 采集`);
          break;
        }

        try {
          currentPageIndex++;
          const progressStep = (75 - currentProgress) / totalPages;
          
          updateProgress(`采集 ${api.name} 第${page}页...`, 
            Math.min(75, currentProgress + progressStep), 
            totalCollected, 
            api.name, 
            page, 
            api.maxPages);
          
          console.log(`📊 采集 ${api.name} 第${page}页... (总计第${currentPageIndex}/${totalPages}页)`);
          
          const response = await axios.get(api.buildUrl(page), {
            timeout: api.timeout,
            headers: api.headers
          });
          
          const pageData = api.transform(response.data, page);
          let newCoinsAdded = 0;
          
          // 去重合并数据 - 使用symbol作为唯一键
          for (const coin of pageData) {
            const key = coin.symbol?.toUpperCase();
            if (key && !allCollectedData.has(key)) {
              allCollectedData.set(key, coin);
              newCoinsAdded++;
            }
          }
          
          totalCollected = allCollectedData.size;
          currentProgress += progressStep;
          
          console.log(`✅ ${api.name} 第${page}页: 获取${pageData.length}个，新增${newCoinsAdded}个，总计${totalCollected}个币种`);
          
          // 添加延迟避免API限制
          await new Promise(resolve => setTimeout(resolve, 1000));
          
        } catch (error: any) {
          console.log(`❌ ${api.name} 第${page}页采集失败: ${error.message}`);
          // 添加错误延迟
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }
      
      console.log(`📊 ${api.name} 采集完成，当前总计: ${totalCollected} 个币种`);
    }

    if (totalCollected === 0) {
      throw new Error('未能采集到任何有效数据');
    }

    // 3. 处理数据 (排序和过滤)
    updateProgress('处理数据...', 80, totalCollected, '数据处理', 0, 0);
    const finalData = Array.from(allCollectedData.values())
      .filter(coin => coin.marketCap > 0 && coin.volume24h > 0)
      .sort((a, b) => b.volumeToMarketCapRatio - a.volumeToMarketCapRatio);

    console.log(`📊 处理完成: ${finalData.length} 个有效币种`);
    console.log(`📊 去重统计: 原始采集${totalCollected}个，去重后${finalData.length}个`);
    
    // 统计各API源的贡献
    const sourceStats = new Map<string, number>();
    finalData.forEach(coin => {
      sourceStats.set(coin.source, (sourceStats.get(coin.source) || 0) + 1);
    });
    console.log('📊 各API源贡献统计:');
    sourceStats.forEach((count, source) => {
      console.log(`  ${source}: ${count} 个币种`);
    });
    
    console.log('🏆 前5名交易量市值比率:');
    finalData.slice(0, 5).forEach((coin, index) => {
      console.log(`  ${index + 1}. ${coin.name} (${coin.symbol}): ${coin.volumeToMarketCapRatio.toFixed(6)} - 来源: ${coin.source}`);
    });

    // 4. 保存到数据库
    updateProgress('保存到数据库...', 90, finalData.length, '数据库保存', 0, 0);
    
    const [newBatch] = await db.insert(volumeToMarketCapBatches).values({
      entries_count: finalData.length,
      has_changes: finalData.length > 0,
      previous_batch_id: null
    }).returning({ id: volumeToMarketCapBatches.id });

    const batchId = newBatch.id;

    const batchSize = 50;
    let processedCount = 0;

    for (let i = 0; i < finalData.length; i += batchSize) {
      const batch = finalData.slice(i, i + batchSize);
      const insertData = [];

      for (const coin of batch) {
        try {
          // 确保cryptocurrency存在
          const existingCrypto = await db.select().from(cryptocurrencies)
            .where(eq(cryptocurrencies.symbol, coin.symbol))
            .limit(1);

          let cryptoId;
          if (existingCrypto.length > 0) {
            cryptoId = existingCrypto[0].id;
            await db.update(cryptocurrencies).set({
              name: coin.name,
              market_cap: coin.marketCap,
              price: coin.price || null,
              volume_24h: coin.volume24h,
              price_change_24h: coin.change24h || null,
              updated_at: new Date()
            }).where(eq(cryptocurrencies.id, cryptoId));
          } else {
            const [newCrypto] = await db.insert(cryptocurrencies).values({
              name: coin.name,
              symbol: coin.symbol,
              slug: coin.symbol.toLowerCase(),
              market_cap: coin.marketCap,
              price: coin.price || null,
              volume_24h: coin.volume24h,
              price_change_24h: coin.change24h || null,
              created_at: new Date(),
              updated_at: new Date()
            }).returning({ id: cryptocurrencies.id });
            cryptoId = newCrypto.id;
          }

          insertData.push({
            batch_id: batchId,
            cryptocurrency_id: cryptoId,
            symbol: coin.symbol,
            name: coin.name,
            market_cap: coin.marketCap,
            volume_24h: coin.volume24h,
            volume_to_market_cap_ratio: coin.volumeToMarketCapRatio,
            rank: i + insertData.length + 1,
            price_usd: coin.price || null,
            price_change_24h: coin.change24h || null,
            source: coin.source
          });

        } catch (error: any) {
          console.log(`⚠️ 处理币种 ${coin.symbol} 时出错: ${error.message}`);
        }
      }

      if (insertData.length > 0) {
        await db.insert(volumeToMarketCapRatios).values(insertData);
        processedCount += insertData.length;
      }

      const progress = 90 + Math.floor((processedCount / finalData.length) * 10);
      updateProgress(`保存数据批次 ${Math.floor(i/batchSize) + 1}/${Math.ceil(finalData.length/batchSize)} (已处理 ${processedCount}/${finalData.length})`, progress, finalData.length, '数据库保存', 0, 0);
    }

    updateProgress('分析完成', 100, finalData.length, '完成', 0, 0, 'completed');
    analysisProgress.endTime = new Date();

    const result = {
      success: true,
      batchId,
      count: finalData.length
    };
    analysisProgress.results = result;
    
    console.log(`🎉 健壮多API分析完成！`);
    console.log(`📊 最终结果: 批次ID ${batchId}, 处理了 ${finalData.length} 个币种`);
    console.log(`⏱️ 耗时: ${Math.round((analysisProgress.endTime.getTime() - analysisProgress.startTime!.getTime()) / 1000)} 秒`);
    
    return result;

  } catch (error: any) {
    console.error('❌ 健壮多API分析失败:', error);
    updateProgress('分析失败', 100, analysisProgress.collectedCount, '失败', 0, 0, 'failed');
    analysisProgress.results = { success: false, error: error.message };
    return { success: false, error: error.message };
  }
}
