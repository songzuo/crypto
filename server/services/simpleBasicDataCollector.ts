/**
 * 简化版基础数据采集器
 * 用于测试和调试
 */

import { db } from '../db';
import { cryptocurrencies, cryptoBasicData } from '@shared/schema';
import { eq } from 'drizzle-orm';

// 采集进度状态
interface SimpleProgress {
  status: 'idle' | 'running' | 'completed' | 'error';
  currentStep: string;
  progress: number;
  totalCoins: number;
  processedCoins: number;
  errors: string[];
}

// 全局进度状态
let simpleProgress: SimpleProgress = {
  status: 'idle',
  currentStep: '准备就绪',
  progress: 0,
  totalCoins: 0,
  processedCoins: 0,
  errors: []
};

/**
 * 获取采集进度
 */
export function getSimpleProgress(): SimpleProgress {
  return simpleProgress;
}

/**
 * 启动简化的基础数据采集
 */
export async function startSimpleCollection(): Promise<{
  success: boolean;
  message: string;
}> {
  if (simpleProgress.status === 'running') {
    return {
      success: false,
      message: '采集正在进行中，请等待完成'
    };
  }

  try {
    console.log('🚀 开始简化基础数据采集...');
    
    // 重置进度状态
    simpleProgress = {
      status: 'running',
      currentStep: '初始化采集器',
      progress: 0,
      totalCoins: 0,
      processedCoins: 0,
      errors: []
    };

    // 测试数据库连接
    simpleProgress.currentStep = '测试数据库连接';
    console.log('测试数据库连接...');
    
    // 获取加密货币列表
    simpleProgress.currentStep = '获取加密货币列表';
    const coins = await db.select().from(cryptocurrencies)
      .orderBy(cryptocurrencies.rank);
      // 移除限制，采集所有加密货币
    
    if (coins.length === 0) {
      throw new Error('没有找到任何加密货币数据');
    }
    
    simpleProgress.totalCoins = coins.length;
    console.log(`找到 ${coins.length} 个加密货币`);
    
    // 处理每个币种
    for (let i = 0; i < coins.length; i++) {
      const coin = coins[i];
      simpleProgress.currentStep = `处理 ${coin.symbol}`;
      simpleProgress.processedCoins = i + 1;
      simpleProgress.progress = Math.round(((i + 1) / coins.length) * 100);
      
      console.log(`处理 ${coin.symbol} (${i + 1}/${coins.length})`);
      
      try {
        // 创建基础数据记录
        const basicData = {
          cryptocurrencyId: coin.id,
          priceChange7d: null,
          priceChange30d: null,
          priceChange60d: null,
          priceChange90d: null,
          priceChange180d: null,
          priceChange1y: null,
          circulatingSupply: null,
          totalSupply: null,
          circulatingToTotalRatio: null,
          volumeToMarketCapRatio: null,
          marketCapToFDV: null,
          orderBookDepth: null,
          bidAskSpread: null,
          slippageCost: null,
          realVolumeRatio: null,
          top10ExchangeVolume: null,
          annualInflationRate: null,
          lockedRatio: null,
          top10AddressConcentration: null,
          retailHoldingRatio: null,
          dailyActiveAddresses: null,
          dailyTransactions: null,
          dailyGasCost: null,
          monthlyCommits: null,
          developerCount: null,
          dependentProjects: null,
          priceToSalesRatio: null,
          twitterEngagementRate: null,
          discordTelegramActivity: null,
          developerForumActivity: null,
          dataSource: 'simple_test',
          lastUpdated: new Date()
        };
        
        // 检查是否已有基础数据
        const existing = await db.select().from(cryptoBasicData)
          .where(eq(cryptoBasicData.cryptocurrencyId, coin.id))
          .limit(1);
        
        if (existing.length > 0) {
          console.log(`更新 ${coin.symbol} 的基础数据`);
          await db.update(cryptoBasicData)
            .set(basicData)
            .where(eq(cryptoBasicData.cryptocurrencyId, coin.id));
        } else {
          console.log(`创建 ${coin.symbol} 的基础数据`);
          await db.insert(cryptoBasicData).values(basicData);
        }
        
      } catch (error) {
        console.error(`处理 ${coin.symbol} 失败:`, error);
        simpleProgress.errors.push(`${coin.symbol}: ${error.message}`);
      }
    }
    
    simpleProgress.status = 'completed';
    simpleProgress.currentStep = '采集完成';
    simpleProgress.progress = 100;
    
    console.log('✅ 简化基础数据采集完成');
    return {
      success: true,
      message: `成功处理 ${simpleProgress.processedCoins} 个加密货币`
    };

  } catch (error) {
    simpleProgress.status = 'error';
    simpleProgress.currentStep = '采集失败';
    simpleProgress.errors.push(error.message);
    
    console.error('❌ 简化基础数据采集失败:', error);
    return {
      success: false,
      message: `采集失败: ${error.message}`
    };
  }
}

/**
 * 重置状态
 */
export function resetSimpleProgress(): void {
  simpleProgress = {
    status: 'idle',
    currentStep: '准备就绪',
    progress: 0,
    totalCoins: 0,
    processedCoins: 0,
    errors: []
  };
}
