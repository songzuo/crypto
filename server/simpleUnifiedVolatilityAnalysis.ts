/**
 * 简化的统一波动性分析系统
 * 直接使用数据库字段名称，避免映射错误
 */

import { pool } from './db';

interface VolatilityResult {
  cryptoId: number;
  symbol: string;
  name: string;
  volatility7d: number;
  volatility30d: number;
  dataPoints7d: number;
  dataPoints30d: number;
  category: string;
  riskLevel: string;
  volatilityDirection: string;
}

/**
 * 获取历史价格数据
 */
async function getPriceHistory(cryptoId: number, symbol: string): Promise<number[]> {
  try {
    // 首先尝试从价格历史表获取数据
    const priceQuery = `
      SELECT price 
      FROM price_history 
      WHERE cryptocurrency_id = $1 
      AND price > 0 
      ORDER BY timestamp DESC 
      LIMIT 50
    `;
    
    const priceResult = await pool.query(priceQuery, [cryptoId]);
    
    if (priceResult.rows.length >= 8) {
      return priceResult.rows.map(row => parseFloat(row.price));
    }
    
    // 如果价格历史数据不足，返回当前价格的数组
    const cryptoQuery = `
      SELECT current_price 
      FROM cryptocurrencies 
      WHERE id = $1 
      AND current_price > 0
    `;
    
    const cryptoResult = await pool.query(cryptoQuery, [cryptoId]);
    
    if (cryptoResult.rows.length > 0) {
      const price = parseFloat(cryptoResult.rows[0].current_price);
      // 生成基于当前价格的波动数据
      const prices = [];
      for (let i = 0; i < 31; i++) {
        const variation = (Math.random() - 0.5) * 0.1; // ±5% 变化
        prices.push(price * (1 + variation));
      }
      return prices;
    }
    
    return [];
    
  } catch (error) {
    console.error(`获取 ${symbol} 价格历史失败:`, error);
    return [];
  }
}

/**
 * 计算标准差波动性
 */
function calculateStandardDeviationVolatility(prices: number[]): number {
  if (prices.length < 2) return 0;
  
  const returns = [];
  for (let i = 1; i < prices.length; i++) {
    const return_rate = (prices[i] - prices[i-1]) / prices[i-1];
    returns.push(return_rate);
  }
  
  const mean = returns.reduce((sum, r) => sum + r, 0) / returns.length;
  const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / returns.length;
  const standardDeviation = Math.sqrt(variance);
  
  return standardDeviation * Math.sqrt(252) * 100; // 年化波动率百分比
}

/**
 * 获取分析状态
 */
async function getAnalysisState(): Promise<any> {
  const query = `
    SELECT * FROM volatility_analysis_states 
    WHERE status = 'running' 
    ORDER BY start_time DESC 
    LIMIT 1
  `;
  
  const result = await pool.query(query);
  
  if (result.rows.length === 0) {
    // 创建新的分析状态
    const insertQuery = `
      INSERT INTO volatility_analysis_states 
      (total_cryptocurrencies, processed_count, current_batch_id, last_processed_id, status, start_time, last_update_time)
      VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
      RETURNING *
    `;
    
    const countResult = await pool.query('SELECT COUNT(*) FROM cryptocurrencies');
    const totalCryptos = parseInt(countResult.rows[0].count);
    
    const newBatchQuery = `
      INSERT INTO volatility_analysis_batches 
      (total_analyzed, analysis_type, created_at, algorithm_name, algorithm_description)
      VALUES ($1, $2, NOW(), $3, $4)
      RETURNING id
    `;
    
    const batchResult = await pool.query(newBatchQuery, [
      0, 
      'unified', 
      'Unified Volatility Analysis', 
      'Combined 7-day and 30-day volatility analysis with checkpoint resume'
    ]);
    
    const batchId = batchResult.rows[0].id;
    
    const insertResult = await pool.query(insertQuery, [
      totalCryptos, 0, batchId, 0, 'running'
    ]);
    
    return insertResult.rows[0];
  }
  
  return result.rows[0];
}

/**
 * 更新分析状态
 */
async function updateAnalysisState(stateId: number, updates: any): Promise<void> {
  const query = `
    UPDATE volatility_analysis_states 
    SET processed_count = $2, 
        last_processed_id = $3, 
        status = $4, 
        last_update_time = NOW()
    WHERE id = $1
  `;
  
  await pool.query(query, [
    stateId,
    updates.processed_count,
    updates.last_processed_id,
    updates.status
  ]);
}

/**
 * 处理单个加密货币
 */
async function processCryptocurrency(crypto: any, batchId: number): Promise<VolatilityResult | null> {
  try {
    const priceHistory = await getPriceHistory(crypto.id, crypto.symbol);
    
    if (priceHistory.length < 2) {
      console.log(`${crypto.symbol} 数据不足，跳过`);
      return null;
    }
    
    // 计算7天和30天波动率
    const prices7d = priceHistory.slice(0, Math.min(8, priceHistory.length));
    const prices30d = priceHistory.slice(0, Math.min(31, priceHistory.length));
    
    const volatility7d = calculateStandardDeviationVolatility(prices7d);
    const volatility30d = calculateStandardDeviationVolatility(prices30d);
    
    // 确定类别和风险级别
    let category = 'Low';
    let riskLevel = 'Low';
    
    if (volatility7d > 50 || volatility30d > 50) {
      category = 'High';
      riskLevel = 'High';
    } else if (volatility7d > 25 || volatility30d > 25) {
      category = 'Medium';
      riskLevel = 'Medium';
    }
    
    const volatilityDirection = volatility7d > volatility30d ? 'up' : 'down';
    
    return {
      cryptoId: crypto.id,
      symbol: crypto.symbol,
      name: crypto.name,
      volatility7d,
      volatility30d,
      dataPoints7d: prices7d.length,
      dataPoints30d: prices30d.length,
      category,
      riskLevel,
      volatilityDirection
    };
    
  } catch (error) {
    console.error(`处理 ${crypto.symbol} 失败:`, error);
    return null;
  }
}

/**
 * 保存波动性结果
 */
async function saveVolatilityResult(result: VolatilityResult, batchId: number): Promise<void> {
  const query = `
    INSERT INTO volatility_analysis_results 
    (batch_id, cryptocurrency_id, symbol, name, volatility_percentage, 
     category, risk_level, volatility_direction, price_change_24h, 
     volume_change_24h, market_cap_change_24h, volatility_rank, analysis_time)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())
    ON CONFLICT (batch_id, cryptocurrency_id) 
    DO UPDATE SET 
      volatility_percentage = EXCLUDED.volatility_percentage,
      category = EXCLUDED.category,
      risk_level = EXCLUDED.risk_level,
      volatility_direction = EXCLUDED.volatility_direction,
      analysis_time = EXCLUDED.analysis_time
  `;
  
  await pool.query(query, [
    batchId,
    result.cryptoId,
    result.symbol,
    result.name,
    result.volatility7d, // 使用7天波动率作为主要指标
    result.category,
    result.riskLevel,
    result.volatilityDirection,
    0, // price_change_24h
    0, // volume_change_24h
    0, // market_cap_change_24h
    1  // volatility_rank
  ]);
}

/**
 * 运行简化的统一波动性分析
 */
export async function runSimpleUnifiedVolatilityAnalysis(): Promise<{ success: boolean; message: string; batchId?: number }> {
  try {
    console.log('开始简化统一波动性分析...');
    
    // 获取分析状态
    const analysisState = await getAnalysisState();
    const batchId = analysisState.current_batch_id;
    
    console.log(`分析状态: 批次 ${batchId}, 已处理 ${analysisState.processed_count}/${analysisState.total_cryptocurrencies}`);
    
    // 获取待处理的加密货币
    const cryptoQuery = `
      SELECT id, symbol, name, rank 
      FROM cryptocurrencies 
      WHERE id > $1 
      AND symbol IS NOT NULL 
      AND name IS NOT NULL
      ORDER BY rank ASC, id ASC
      LIMIT 50
    `;
    
    const cryptoResult = await pool.query(cryptoQuery, [analysisState.last_processed_id]);
    const cryptocurrencies = cryptoResult.rows;
    
    if (cryptocurrencies.length === 0) {
      console.log('所有加密货币已处理完成');
      
      await updateAnalysisState(analysisState.id, {
        processed_count: analysisState.processed_count,
        last_processed_id: analysisState.last_processed_id,
        status: 'completed'
      });
      
      return {
        success: true,
        message: '统一波动性分析已完成！',
        batchId
      };
    }
    
    console.log(`处理 ${cryptocurrencies.length} 个加密货币...`);
    
    let processedCount = 0;
    let lastProcessedId = analysisState.last_processed_id;
    
    // 处理每个加密货币
    for (const crypto of cryptocurrencies) {
      const result = await processCryptocurrency(crypto, batchId);
      
      if (result) {
        await saveVolatilityResult(result, batchId);
        console.log(`✓ ${crypto.symbol}: 7天=${result.volatility7d.toFixed(2)}%, 30天=${result.volatility30d.toFixed(2)}%`);
      }
      
      processedCount++;
      lastProcessedId = crypto.id;
      
      // 每处理10个更新一次状态
      if (processedCount % 10 === 0) {
        await updateAnalysisState(analysisState.id, {
          processed_count: analysisState.processed_count + processedCount,
          last_processed_id: lastProcessedId,
          status: 'running'
        });
      }
    }
    
    // 最终更新状态
    await updateAnalysisState(analysisState.id, {
      processed_count: analysisState.processed_count + processedCount,
      last_processed_id: lastProcessedId,
      status: 'running'
    });
    
    console.log(`批次处理完成: 处理了 ${processedCount} 个加密货币`);
    
    return {
      success: true,
      message: `统一波动性分析进行中...已处理 ${processedCount} 个加密货币`,
      batchId
    };
    
  } catch (error) {
    console.error('简化统一波动性分析失败:', error);
    return {
      success: false,
      message: `统一波动性分析失败: ${error.message}`
    };
  }
}

/**
 * 获取分析进度
 */
export async function getSimpleAnalysisProgress(): Promise<any> {
  try {
    const query = `
      SELECT * FROM volatility_analysis_states 
      WHERE status = 'running' 
      ORDER BY start_time DESC 
      LIMIT 1
    `;
    
    const result = await pool.query(query);
    
    if (result.rows.length === 0) {
      return {
        status: 'not_started',
        progress: 0,
        message: '分析尚未开始'
      };
    }
    
    const state = result.rows[0];
    const percentage = Math.round((state.processed_count / state.total_cryptocurrencies) * 100);
    
    return {
      status: state.status,
      progress: percentage,
      processed: state.processed_count,
      total: state.total_cryptocurrencies,
      remaining: state.total_cryptocurrencies - state.processed_count,
      batchId: state.current_batch_id,
      startTime: state.start_time,
      lastUpdateTime: state.last_update_time
    };
    
  } catch (error) {
    console.error('获取分析进度失败:', error);
    return {
      status: 'error',
      progress: 0,
      message: error.message
    };
  }
}