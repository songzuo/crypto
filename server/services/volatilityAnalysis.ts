/**
 * 波动性分析服务
 * 基于交易量市值比率数据进行波动性分析和排名
 */

import { storage } from '../storage';
import { 
  InsertVolatilityAnalysisBatch, 
  InsertVolatilityAnalysisEntry,
  VolumeToMarketCapRatio,
  VolumeToMarketCapBatch
} from '@shared/schema';

/**
 * 波动性分析配置
 */
interface VolatilityConfig {
  timeframe: string;
  analysisType: string;
  minDataPoints: number;
  volatilityThresholds: {
    极高: number;
    高: number;
    中: number;
    低: number;
  };
}

const DEFAULT_CONFIG: VolatilityConfig = {
  timeframe: '24h',
  analysisType: 'volume_volatility',
  minDataPoints: 2,
  volatilityThresholds: {
    极高: 80,
    高: 60,
    中: 40,
    低: 20
  }
};

/**
 * 计算波动性指标
 */
function calculateVolatilityMetrics(
  currentRatio: number, 
  previousRatio: number
): {
  volatilityScore: number;
  volatilityPercentage: number;
  volatilityDirection: 'up' | 'down' | 'stable';
  volatilityCategory: string;
  riskLevel: string;
} {
  // 计算波动性百分比
  const volatilityPercentage = previousRatio > 0 
    ? ((currentRatio - previousRatio) / previousRatio) * 100 
    : 0;

  // 计算波动性评分 (0-100)
  const absoluteChange = Math.abs(volatilityPercentage);
  const volatilityScore = Math.min(100, absoluteChange * 2); // 50%变化 = 100分

  // 判断波动方向
  let volatilityDirection: 'up' | 'down' | 'stable';
  if (Math.abs(volatilityPercentage) < 5) {
    volatilityDirection = 'stable';
  } else if (volatilityPercentage > 0) {
    volatilityDirection = 'up';
  } else {
    volatilityDirection = 'down';
  }

  // 波动性分类
  let volatilityCategory: string;
  let riskLevel: string;

  if (volatilityScore >= DEFAULT_CONFIG.volatilityThresholds.极高) {
    volatilityCategory = '极高';
    riskLevel = '高风险';
  } else if (volatilityScore >= DEFAULT_CONFIG.volatilityThresholds.高) {
    volatilityCategory = '高';
    riskLevel = '高风险';
  } else if (volatilityScore >= DEFAULT_CONFIG.volatilityThresholds.中) {
    volatilityCategory = '中';
    riskLevel = '中风险';
  } else if (volatilityScore >= DEFAULT_CONFIG.volatilityThresholds.低) {
    volatilityCategory = '低';
    riskLevel = '低风险';
  } else {
    volatilityCategory = '极低';
    riskLevel = '低风险';
  }

  return {
    volatilityScore,
    volatilityPercentage,
    volatilityDirection,
    volatilityCategory,
    riskLevel
  };
}

/**
 * 获取最新的两个交易量市值比率批次
 */
async function getLatestVolumeRatioBatches(): Promise<{
  current: VolumeToMarketCapBatch | undefined;
  previous: VolumeToMarketCapBatch | undefined;
}> {
  const batches = await storage.getVolumeToMarketCapBatches(1, 2);
  
  if (batches.data.length === 0) {
    console.warn('没有找到交易量市值比率批次数据');
    return { current: undefined, previous: undefined };
  }

  // 按创建时间排序，获取最新的两个批次
  const sortedBatches = batches.data.sort((a, b) => 
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  return {
    current: sortedBatches[0],
    previous: sortedBatches[1]
  };
}

/**
 * 运行波动性分析
 */
export async function runVolatilityAnalysis(): Promise<void> {
  console.log('开始波动性分析...');
  
  try {
    // 获取最新的两个交易量市值比率批次
    const { current, previous } = await getLatestVolumeRatioBatches();
    
    if (!current) {
      console.error('没有找到当前交易量市值比率批次，无法进行波动性分析');
      return;
    }

    if (!previous) {
      console.warn('没有找到前一个交易量市值比率批次，将使用零值作为基准');
    }

    // 获取当前批次的交易量市值比率数据
    const currentRatios = await storage.getVolumeToMarketCapRatiosByBatchId(current.id);
    
    if (currentRatios.length === 0) {
      console.error('当前批次没有交易量市值比率数据');
      return;
    }

    // 获取前一批次的交易量市值比率数据
    const previousRatios = previous 
      ? await storage.getVolumeToMarketCapRatiosByBatchId(previous.id)
      : [];

    // 创建前一批次数据的映射，方便查找
    const previousRatioMap = new Map<number, VolumeToMarketCapRatio>();
    previousRatios.forEach(ratio => {
      previousRatioMap.set(ratio.cryptocurrencyId, ratio);
    });

    // 创建波动性分析批次
    const batchData: InsertVolatilityAnalysisBatch = {
      timeframe: DEFAULT_CONFIG.timeframe,
      totalAnalyzed: currentRatios.length,
      analysisType: DEFAULT_CONFIG.analysisType,
      baseVolumeRatioBatchId: previous?.id,
      comparisonVolumeRatioBatchId: current.id
    };

    const volatilityBatch = await storage.createVolatilityAnalysisBatch(batchData);
    console.log(`创建波动性分析批次 ${volatilityBatch.id}，将分析 ${currentRatios.length} 个加密货币`);

    // 分析每个加密货币的波动性
    const volatilityEntries: any[] = [];

    for (const currentRatio of currentRatios) {
      const previousRatio = previousRatioMap.get(currentRatio.cryptocurrencyId);
      
      const currentVolumeRatio = currentRatio.volumeToMarketCapRatio || 0;
      const previousVolumeRatio = previousRatio?.volumeToMarketCapRatio || 0;

      // 计算波动性指标
      const volatilityMetrics = calculateVolatilityMetrics(
        currentVolumeRatio, 
        previousVolumeRatio
      );

      // 创建波动性分析条目
      const entryData: InsertVolatilityAnalysisEntry = {
        batchId: volatilityBatch.id,
        cryptocurrencyId: currentRatio.cryptocurrencyId,
        name: currentRatio.name,
        symbol: currentRatio.symbol,
        currentVolumeRatio,
        previousVolumeRatio,
        volatilityScore: volatilityMetrics.volatilityScore,
        volatilityPercentage: volatilityMetrics.volatilityPercentage,
        volatilityDirection: volatilityMetrics.volatilityDirection,
        volatilityRank: 0, // 稍后计算排名
        priceChange24h: currentRatio.priceChange24h,
        volumeChange24h: currentRatio.volumeChange24h,
        marketCapChange24h: null, // 如果有数据可以添加
        volatilityCategory: volatilityMetrics.volatilityCategory,
        riskLevel: volatilityMetrics.riskLevel
      };

      volatilityEntries.push(entryData);
    }

    // 按波动性评分排序并分配排名
    volatilityEntries.sort((a, b) => (b.volatilityScore || 0) - (a.volatilityScore || 0));
    
    volatilityEntries.forEach((entry, index) => {
      entry.volatilityRank = index + 1;
    });

    // 批量保存波动性分析结果
    let savedCount = 0;
    for (const entry of volatilityEntries) {
      try {
        await storage.createVolatilityAnalysisEntry(entry);
        savedCount++;
      } catch (error) {
        console.error(`保存波动性分析条目失败 (${entry.symbol}):`, error);
      }
    }

    console.log(`波动性分析完成！共分析 ${currentRatios.length} 个加密货币，成功保存 ${savedCount} 条记录`);
    
    // 打印前10名最高波动性的加密货币
    const top10 = volatilityEntries.slice(0, 10);
    console.log('\n=== 波动性排名前10 ===');
    top10.forEach((entry, index) => {
      console.log(`${index + 1}. ${entry.symbol} (${entry.name})`);
      console.log(`   波动评分: ${entry.volatilityScore?.toFixed(2)}`);
      console.log(`   波动百分比: ${entry.volatilityPercentage?.toFixed(2)}%`);
      console.log(`   方向: ${entry.volatilityDirection}`);
      console.log(`   分类: ${entry.volatilityCategory} (${entry.riskLevel})`);
      console.log(`   当前比率: ${entry.currentVolumeRatio?.toFixed(4)}`);
      console.log(`   之前比率: ${entry.previousVolumeRatio?.toFixed(4)}`);
      console.log('');
    });

  } catch (error) {
    console.error('波动性分析过程中发生错误:', error);
    throw error;
  }
}

/**
 * 获取波动性分析结果
 */
export async function getVolatilityAnalysisResults(
  page: number = 1, 
  limit: number = 50,
  volatilityDirection?: string,
  volatilityCategory?: string
): Promise<{
  batch: any;
  entries: any[];
  total: number;
}> {
  // 获取最新的波动性分析批次
  const batches = await storage.getVolatilityAnalysisBatches(1, 1);
  
  if (batches.data.length === 0) {
    return {
      batch: null,
      entries: [],
      total: 0
    };
  }

  const latestBatch = batches.data[0];
  
  // 获取该批次的波动性分析结果
  const entries = await storage.getVolatilityAnalysisResultsByBatchId(
    latestBatch.id,
    volatilityDirection,
    volatilityCategory
  );

  // 分页处理
  const startIndex = (page - 1) * limit;
  const endIndex = startIndex + limit;
  const paginatedEntries = entries.slice(startIndex, endIndex);

  return {
    batch: latestBatch,
    entries: paginatedEntries,
    total: entries.length
  };
}