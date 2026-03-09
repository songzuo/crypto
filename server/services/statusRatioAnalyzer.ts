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

// 快速API配置
const STATUS_API_SOURCES = [
  {
    name: 'CryptoCompare',
    baseUrl: 'https://min-api.cryptocompare.com/data',
    timeout: 8000,
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
  }
];

// 更新进度状态
function updateProgress(status: AnalysisProgress['status'], step: string, progress: number) {
  analysisProgress = {
    ...analysisProgress,
    status,
    currentStep: step,
    progress: Math.min(100, Math.max(0, progress))
  };
  console.log(`📊 [${progress}%] ${step}`);
}

// 快速HTTP客户端
const statusClient = axios.create({
  timeout: 8000,
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
  }
});

// 快速请求函数
async function statusRequest(url: string): Promise<any> {
  try {
    const response = await statusClient.get(url);
    return response.data;
  } catch (error) {
    throw new Error(`请求失败: ${error.message}`);
  }
}

// 主状态分析函数
export async function runStatusRatioAnalysis(): Promise<{success: boolean, batchId?: number, count?: number, error?: string}> {
  console.log('📊 开始状态化交易量市值比率分析...');
  
  analysisProgress = {
    status: 'running',
    currentStep: '初始化分析',
    progress: 0,
    startTime: new Date()
  };
  
  try {
    updateProgress('running', '开始分析...', 10);
    
    const allCryptoData: CryptoData[] = [];
    const sourceResults: {[key: string]: number} = {};
    
    // 测试API源
    updateProgress('running', '测试API连接...', 20);
    
    for (let i = 0; i < STATUS_API_SOURCES.length; i++) {
      const source = STATUS_API_SOURCES[i];
      const progress = 20 + (i / STATUS_API_SOURCES.length) * 40;
      
      try {
        updateProgress('running', `获取 ${source.name} 数据...`, progress);
        
        const url = source.baseUrl + source.getUrl();
        const data = await statusRequest(url);
        const transformed = source.transform(data);
        
        allCryptoData.push(...transformed);
        sourceResults[source.name] = transformed.length;
        
        console.log(`✅ ${source.name}: ${transformed.length} 个币种`);
        
        updateProgress('running', `${source.name} 成功获取 ${transformed.length} 个币种`, progress + 5);
        
        // 如果已经有一些数据，可以提前结束
        if (allCryptoData.length >= 3) {
          console.log('🎯 已获得足够测试数据，提前结束');
          break;
        }
        
      } catch (error) {
        console.log(`❌ ${source.name}: ${error.message}`);
        sourceResults[source.name] = 0;
        updateProgress('running', `${source.name} 失败，继续下一个...`, progress + 5);
      }
    }
    
    updateProgress('running', '处理数据...', 70);
    
    console.log('📊 API测试结果:', sourceResults);
    
    if (allCryptoData.length === 0) {
      updateProgress('failed', '所有API源都返回了空结果', 100);
      return {
        success: false,
        error: '所有API源都返回了空结果'
      };
    }
    
    // 快速去重
    updateProgress('running', '去重和排序...', 80);
    
    const uniqueData = new Map<string, CryptoData>();
    allCryptoData.forEach(coin => {
      const key = coin.symbol.toUpperCase();
      const existing = uniqueData.get(key);
      
      if (!existing || coin.rank < existing.rank) {
        uniqueData.set(key, coin);
      }
    });
    
    const finalData = Array.from(uniqueData.values())
      .filter(coin => 
        coin.marketCap > 0 && 
        coin.volume24h > 0 && 
        coin.volumeToMarketCapRatio > 0
      )
      .sort((a, b) => b.volumeToMarketCapRatio - a.volumeToMarketCapRatio);
    
    console.log(`📈 处理完成: ${finalData.length} 个有效币种`);
    
    // 显示结果
    console.log('🏆 分析结果:');
    finalData.forEach((coin, index) => {
      console.log(`  ${index + 1}. ${coin.name} (${coin.symbol}): ${coin.volumeToMarketCapRatio.toFixed(6)} - 来源: ${coin.source}`);
    });
    
    updateProgress('running', '保存到数据库...', 90);
    
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
    
    const result = {
      success: true,
      batchId: batchId,
      count: finalData.length
    };
    
    updateProgress('completed', `分析完成! 处理了 ${finalData.length} 个币种`, 100);
    
    analysisProgress.results = result;
    analysisProgress.endTime = new Date();
    
    console.log(`✅ 状态化分析成功! 批次ID: ${batchId}, 处理了 ${finalData.length} 个币种`);
    
    return result;
    
  } catch (error) {
    console.error('❌ 状态化分析失败:', error);
    
    const result = {
      success: false,
      error: error.message || '未知错误'
    };
    
    updateProgress('failed', `分析失败: ${error.message}`, 100);
    analysisProgress.results = result;
    analysisProgress.endTime = new Date();
    
    return result;
  }
}

// 获取当前进度
export function getAnalysisProgress(): AnalysisProgress {
  return { ...analysisProgress };
}

// 重置进度状态
export function resetAnalysisProgress(): void {
  analysisProgress = {
    status: 'idle',
    currentStep: '准备就绪',
    progress: 0
  };
}

// 快速API连接测试
export async function testStatusApiConnections(): Promise<{[key: string]: boolean}> {
  console.log('🔍 测试状态化API连接...');
  
  const results: {[key: string]: boolean} = {};
  
  for (const source of STATUS_API_SOURCES) {
    try {
      const url = source.baseUrl + source.getUrl();
      await statusRequest(url);
      results[source.name] = true;
      console.log(`✅ ${source.name}: 连接正常`);
    } catch (error) {
      results[source.name] = false;
      console.log(`❌ ${source.name}: 连接失败`);
    }
  }
  
  return results;
}
