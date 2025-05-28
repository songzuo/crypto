/**
 * 简单直接的技术分析系统
 * 完全重写，摒弃复杂逻辑
 */

import { db } from '../db';
import { technicalAnalysisBatches, technicalAnalysisEntries } from '../../shared/schema';
import { storage } from '../storage';

// 简单的RSI信号判断
function getSimpleRSISignal(rsi: number): 'buy' | 'sell' | 'neutral' {
  if (rsi < 30) return 'buy';      // 超卖
  if (rsi > 70) return 'sell';     // 超买
  return 'neutral';
}

// 简单的MACD信号判断
function getSimpleMACDSignal(macdLine: number, signalLine: number): 'buy' | 'sell' | 'neutral' {
  if (macdLine > signalLine) return 'buy';    // 金叉
  if (macdLine < signalLine) return 'sell';   // 死叉
  return 'neutral';
}

// 简单的EMA信号判断
function getSimpleEMASignal(shortEma: number, longEma: number): 'buy' | 'sell' | 'neutral' {
  const diff = Math.abs(shortEma - longEma);
  
  // 如果两条EMA差异太小（小于价格的1%），认为是中性
  if (diff < shortEma * 0.01) return 'neutral';
  
  if (shortEma > longEma) return 'buy';    // 短期上穿长期
  if (shortEma < longEma) return 'sell';   // 短期下穿长期
  return 'neutral';
}

// 简单的综合信号判断
function getCombinedSignal(rsi?: number, macdLine?: number, signalLine?: number, shortEma?: number, longEma?: number) {
  const signals = {
    rsi: 'neutral' as 'buy' | 'sell' | 'neutral',
    macd: 'neutral' as 'buy' | 'sell' | 'neutral',
    ema: 'neutral' as 'buy' | 'sell' | 'neutral',
    combined: 'neutral' as 'buy' | 'sell' | 'neutral'
  };

  // 计算各个信号
  if (rsi !== undefined) {
    signals.rsi = getSimpleRSISignal(rsi);
  }
  
  if (macdLine !== undefined && signalLine !== undefined) {
    signals.macd = getSimpleMACDSignal(macdLine, signalLine);
  }
  
  if (shortEma !== undefined && longEma !== undefined) {
    signals.ema = getSimpleEMASignal(shortEma, longEma);
  }

  // 简单投票制：多数决定
  let buyCount = 0;
  let sellCount = 0;
  
  if (signals.rsi === 'buy') buyCount++;
  if (signals.rsi === 'sell') sellCount++;
  if (signals.macd === 'buy') buyCount++;
  if (signals.macd === 'sell') sellCount++;
  if (signals.ema === 'buy') buyCount++;
  if (signals.ema === 'sell') sellCount++;

  if (buyCount > sellCount) {
    signals.combined = 'buy';
  } else if (sellCount > buyCount) {
    signals.combined = 'sell';
  } else {
    signals.combined = 'neutral';
  }

  return signals;
}

// 运行简单技术分析
export async function runSimpleTechnicalAnalysis(): Promise<{ batchId: number, entriesCount: number }> {
  console.log('开始运行简单技术分析...');
  
  try {
    // 创建新批次
    const [batch] = await db.insert(technicalAnalysisBatches).values({
      createdAt: new Date(),
      entriesCount: 0
    }).returning();
    
    const batchId = batch.id;
    console.log(`创建技术分析批次 #${batchId}`);

    // 获取最新的交易量市值比率数据
    const latestVmcBatch = await storage.getLatestVolumeToMarketCapBatch();
    if (!latestVmcBatch) {
      throw new Error('未找到交易量市值比率数据');
    }

    const ratios = await storage.getVolumeToMarketCapRatiosByBatchId(latestVmcBatch.id);
    console.log(`找到 ${ratios.length} 个币种的交易量数据`);

    let analysisCount = 0;

    // 分析每个币种
    for (const ratio of ratios.slice(0, 100)) { // 限制100个币种进行测试
      try {
        const crypto = await storage.getCryptocurrency(ratio.cryptocurrencyId);
        if (!crypto) continue;

        console.log(`分析 ${crypto.symbol}: RSI=${ratio.rsiValue || 'N/A'}`);

        // 使用现有的数据进行简单分析
        const signals = getCombinedSignal(
          ratio.rsiValue || undefined,
          ratio.macdLine || undefined,
          ratio.signalLine || undefined,
          ratio.shortEma || undefined,
          ratio.longEma || undefined
        );

        // 存储结果
        await db.insert(technicalAnalysisEntries).values({
          batchId,
          cryptocurrencyId: crypto.id,
          symbol: crypto.symbol,
          name: crypto.name,
          rsiValue: ratio.rsiValue,
          macdLine: ratio.macdLine,
          signalLine: ratio.signalLine,
          shortEma: ratio.shortEma,
          longEma: ratio.longEma,
          volumeRatioSignal: 'neutral',
          rsiSignal: signals.rsi,
          macdSignal: signals.macd,
          emaSignal: signals.ema,
          combinedSignal: signals.combined,
          signalStrength: 1,
          recommendationType: 'day_trade',
          analysisTime: new Date()
        });

        analysisCount++;
        console.log(`${crypto.symbol}: RSI=${signals.rsi}, MACD=${signals.macd}, EMA=${signals.ema} → ${signals.combined}`);

      } catch (error) {
        console.error(`分析币种 ${ratio.cryptocurrencyId} 时出错:`, error);
      }
    }

    // 更新批次统计
    await db.update(technicalAnalysisBatches)
      .set({ entriesCount: analysisCount })
      .where({ id: batchId });

    console.log(`简单技术分析完成，批次 #${batchId}，分析了 ${analysisCount} 个币种`);
    return { batchId, entriesCount: analysisCount };

  } catch (error) {
    console.error('简单技术分析运行失败:', error);
    throw error;
  }
}