/**
 * 统一波动性分析系统
 * 合并三个栏目为一个，使用正确的数据获取方法
 * 包含断点续传功能，确保全部数据计算完成
 */

import { pool } from './db';
import axios from 'axios';

interface VolatilityAnalysisState {
  id: number;
  totalCryptocurrencies: number;
  processedCount: number;
  currentBatchId: number;
  lastProcessedId: number;
  status: 'running' | 'completed' | 'paused' | 'error';
  startTime: Date;
  lastUpdateTime: Date;
  errorMessage?: string;
}

interface CryptocurrencyData {
  id: number;
  symbol: string;
  name: string;
  rank: number;
}

interface VolatilityResult {
  cryptoId: number;
  symbol: string;
  name: string;
  volatility7d: number;
  volatility30d: number;
  dataPoints7d: number;
  dataPoints30d: number;
  priceData: number[];
  category: string;
  riskLevel: string;
  volatilityDirection: string;
}

/**
 * 获取或创建分析状态
 */
async function getOrCreateAnalysisState(): Promise<VolatilityAnalysisState> {
  try {
    // 检查是否有正在进行的分析
    const existingStateQuery = `
      SELECT * FROM volatility_analysis_states 
      WHERE status IN ('running', 'paused') 
      ORDER BY start_time DESC 
      LIMIT 1
    `;
    
    const existingState = await pool.query(existingStateQuery);
    
    if (existingState.rows.length > 0) {
      return existingState.rows[0];
    }
    
    // 创建新的分析状态
    const totalCryptosQuery = 'SELECT COUNT(*) as total FROM cryptocurrencies';
    const totalResult = await pool.query(totalCryptosQuery);
    const totalCryptocurrencies = parseInt(totalResult.rows[0].total);
    
    // 创建新批次
    const batchQuery = `
      INSERT INTO volatility_analysis_batches (
        algorithm_name, 
        algorithm_description, 
        total_analyzed, 
        created_at
      ) VALUES ($1, $2, $3, $4) 
      RETURNING id
    `;
    
    const batchResult = await pool.query(batchQuery, [
      '统一波动性分析',
      '使用真实价格数据计算标准差波动性，支持7天和30天分析',
      0,
      new Date()
    ]);
    
    const batchId = batchResult.rows[0].id;
    
    // 创建分析状态
    const stateQuery = `
      INSERT INTO volatility_analysis_states (
        total_cryptocurrencies,
        processed_count,
        current_batch_id,
        last_processed_id,
        status,
        start_time,
        last_update_time
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `;
    
    const stateResult = await pool.query(stateQuery, [
      totalCryptocurrencies,
      0,
      batchId,
      0,
      'running',
      new Date(),
      new Date()
    ]);
    
    return stateResult.rows[0];
    
  } catch (error) {
    console.error('获取或创建分析状态失败:', error);
    throw error;
  }
}

/**
 * 获取历史价格数据 - 使用多个数据源
 */
async function getComprehensivePriceHistory(cryptoId: number, symbol: string): Promise<number[]> {
  const prices: number[] = [];
  
  try {
    // 1. 尝试从CoinMarketCap获取历史数据
    if (process.env.COINMARKETCAP_API_KEY) {
      try {
        const cmcResponse = await axios.get(
          `https://pro-api.coinmarketcap.com/v1/cryptocurrency/ohlcv/historical`,
          {
            params: {
              id: cryptoId,
              time_period: 'hourly',
              count: 168 // 7天 * 24小时
            },
            headers: {
              'X-CMC_PRO_API_KEY': process.env.COINMARKETCAP_API_KEY
            },
            timeout: 10000
          }
        );
        
        if (cmcResponse.data?.data?.quotes) {
          const quotes = cmcResponse.data.data.quotes;
          quotes.forEach((quote: any) => {
            if (quote.quote?.USD?.close) {
              prices.push(parseFloat(quote.quote.USD.close));
            }
          });
        }
      } catch (cmcError) {
        console.log(`CoinMarketCap API失败 ${symbol}:`, cmcError.message);
      }
    }
    
    // 2. 如果CoinMarketCap数据不足，尝试CryptoCompare
    if (prices.length < 50) {
      try {
        const ccResponse = await axios.get(
          `https://min-api.cryptocompare.com/data/v2/histohour`,
          {
            params: {
              fsym: symbol,
              tsym: 'USD',
              limit: 720, // 30天数据
              api_key: process.env.CRYPTOCOMPARE_API_KEY
            },
            timeout: 10000
          }
        );
        
        if (ccResponse.data?.Data?.Data) {
          const data = ccResponse.data.Data.Data;
          data.forEach((item: any) => {
            if (item.close && item.close > 0) {
              prices.push(parseFloat(item.close));
            }
          });
        }
      } catch (ccError) {
        console.log(`CryptoCompare API失败 ${symbol}:`, ccError.message);
      }
    }
    
    // 3. 如果还是数据不足，尝试Tiingo
    if (prices.length < 50 && process.env.TIINGO_API_KEY) {
      try {
        const tiingoResponse = await axios.get(
          `https://api.tiingo.com/tiingo/crypto/prices`,
          {
            params: {
              tickers: symbol,
              startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
              resampleFreq: '1hour',
              token: process.env.TIINGO_API_KEY
            },
            timeout: 10000
          }
        );
        
        if (tiingoResponse.data && Array.isArray(tiingoResponse.data)) {
          tiingoResponse.data.forEach((item: any) => {
            if (item.priceData && Array.isArray(item.priceData)) {
              item.priceData.forEach((price: any) => {
                if (price.close && price.close > 0) {
                  prices.push(parseFloat(price.close));
                }
              });
            }
          });
        }
      } catch (tiingoError) {
        console.log(`Tiingo API失败 ${symbol}:`, tiingoError.message);
      }
    }
    
    // 4. 最后尝试从数据库获取已存储的价格数据
    if (prices.length < 8) {
      try {
        const dbQuery = `
          SELECT price_usd FROM cryptocurrency_price_history 
          WHERE cryptocurrency_id = $1 
          AND price_usd > 0 
          ORDER BY recorded_at DESC 
          LIMIT 1000
        `;
        
        const dbResult = await pool.query(dbQuery, [cryptoId]);
        
        if (dbResult.rows.length > 0) {
          dbResult.rows.forEach((row: any) => {
            if (row.price_usd) {
              prices.push(parseFloat(row.price_usd));
            }
          });
        }
      } catch (dbError) {
        console.log(`数据库查询失败 ${symbol}:`, dbError.message);
      }
    }
    
    // 去重并排序
    const uniquePrices = [...new Set(prices)].sort((a, b) => b - a);
    
    return uniquePrices;
    
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
  
  // 计算价格变化百分比
  const changes: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    const change = (prices[i] - prices[i-1]) / prices[i-1];
    changes.push(change);
  }
  
  // 计算平均变化
  const avgChange = changes.reduce((sum, change) => sum + change, 0) / changes.length;
  
  // 计算标准差
  const variance = changes.reduce((sum, change) => {
    return sum + Math.pow(change - avgChange, 2);
  }, 0) / changes.length;
  
  return Math.sqrt(variance);
}

/**
 * 处理单个加密货币的波动性分析
 */
async function processCryptocurrency(crypto: CryptocurrencyData, batchId: number): Promise<VolatilityResult | null> {
  try {
    const priceHistory = await getComprehensivePriceHistory(crypto.id, crypto.symbol);
    
    if (priceHistory.length < 8) {
      console.log(`${crypto.symbol}: 数据不足，跳过 (${priceHistory.length} 个数据点)`);
      return null;
    }
    
    // 计算7天波动性（至少8个数据点）
    const volatility7d = calculateStandardDeviationVolatility(priceHistory.slice(0, 8));
    
    // 计算30天波动性（至少31个数据点）
    const volatility30d = priceHistory.length >= 31 ? 
      calculateStandardDeviationVolatility(priceHistory.slice(0, 31)) : 0;
    
    // 分类波动性
    const category = volatility7d > 0.3 ? '高波动' : 
                    volatility7d > 0.1 ? '中波动' : '低波动';
    
    const riskLevel = volatility7d > 0.3 ? '高风险' : 
                     volatility7d > 0.1 ? '中风险' : '低风险';
    
    const volatilityDirection = volatility7d > 0.2 ? 'up' : 
                               volatility7d > 0.05 ? 'stable' : 'down';
    
    // 保存到数据库
    const insertQuery = `
      INSERT INTO volatility_analysis_entries (
        batch_id, symbol, name, cryptocurrency_id,
        volatility_percentage, category, 
        price_change_24h, volume_change_24h, market_cap_change_24h,
        volatility_direction, risk_level, volatility_rank,
        data_points, analysis_time, period,
        algorithm_description
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
      ON CONFLICT (symbol, batch_id) DO UPDATE SET
        volatility_percentage = EXCLUDED.volatility_percentage,
        category = EXCLUDED.category,
        volatility_direction = EXCLUDED.volatility_direction,
        risk_level = EXCLUDED.risk_level,
        data_points = EXCLUDED.data_points,
        analysis_time = EXCLUDED.analysis_time,
        algorithm_description = EXCLUDED.algorithm_description
    `;
    
    await pool.query(insertQuery, [
      batchId,
      crypto.symbol,
      crypto.name,
      crypto.id,
      volatility7d,
      category,
      0, // 暂时为0
      0, // 暂时为0
      0, // 暂时为0
      volatilityDirection,
      riskLevel,
      crypto.rank,
      priceHistory.length,
      new Date(),
      '7d',
      `统一波动性分析：使用${priceHistory.length}个数据点计算标准差`
    ]);
    
    // 如果有30天数据，也保存30天分析
    if (volatility30d > 0) {
      const insert30dQuery = `
        INSERT INTO volatility_analysis_entries (
          batch_id, symbol, name, cryptocurrency_id,
          volatility_percentage, category, 
          price_change_24h, volume_change_24h, market_cap_change_24h,
          volatility_direction, risk_level, volatility_rank,
          data_points, analysis_time, period,
          algorithm_description
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
        ON CONFLICT (symbol, batch_id) DO NOTHING
      `;
      
      const category30d = volatility30d > 0.3 ? '高波动' : 
                         volatility30d > 0.1 ? '中波动' : '低波动';
      
      await pool.query(insert30dQuery, [
        batchId,
        crypto.symbol + '_30d',
        crypto.name + ' (30天)',
        crypto.id,
        volatility30d,
        category30d,
        0, 0, 0,
        volatilityDirection,
        riskLevel,
        crypto.rank,
        priceHistory.length,
        new Date(),
        '30d',
        `统一波动性分析：使用${priceHistory.length}个数据点计算30天标准差`
      ]);
    }
    
    return {
      cryptoId: crypto.id,
      symbol: crypto.symbol,
      name: crypto.name,
      volatility7d,
      volatility30d,
      dataPoints7d: Math.min(priceHistory.length, 8),
      dataPoints30d: Math.min(priceHistory.length, 31),
      priceData: priceHistory,
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
 * 更新分析状态
 */
async function updateAnalysisState(stateId: number, updates: Partial<VolatilityAnalysisState>): Promise<void> {
  try {
    // 映射字段名称到数据库列名
    const fieldMapping: { [key: string]: string } = {
      'totalCryptocurrencies': 'total_cryptocurrencies',
      'processedCount': 'processed_count',
      'currentBatchId': 'current_batch_id',
      'lastProcessedId': 'last_processed_id',
      'status': 'status',
      'startTime': 'start_time',
      'lastUpdateTime': 'last_update_time',
      'errorMessage': 'error_message'
    };
    
    const setClause = Object.keys(updates)
      .map((key, index) => `${fieldMapping[key] || key} = $${index + 2}`)
      .join(', ');
    
    const values = [stateId, ...Object.values(updates)];
    
    const updateQuery = `
      UPDATE volatility_analysis_states 
      SET ${setClause}, last_update_time = NOW()
      WHERE id = $1
    `;
    
    await pool.query(updateQuery, values);
    
  } catch (error) {
    console.error('更新分析状态失败:', error);
  }
}

/**
 * 运行统一波动性分析
 */
export async function runUnifiedVolatilityAnalysis(): Promise<{ success: boolean; message: string; batchId?: number; progress?: any }> {
  let analysisState: VolatilityAnalysisState;
  
  try {
    // 获取或创建分析状态
    analysisState = await getOrCreateAnalysisState();
    console.log(`开始统一波动性分析，批次 ${analysisState.currentBatchId}`);
    
    // 获取需要处理的加密货币
    const cryptoQuery = `
      SELECT id, symbol, name, rank 
      FROM cryptocurrencies 
      WHERE id > $1 
      AND symbol IS NOT NULL 
      AND name IS NOT NULL
      ORDER BY rank ASC, id ASC
      LIMIT 100
    `;
    
    const cryptoResult = await pool.query(cryptoQuery, [analysisState.lastProcessedId]);
    const cryptocurrencies = cryptoResult.rows;
    
    if (cryptocurrencies.length === 0) {
      // 分析完成
      await updateAnalysisState(analysisState.id, {
        status: 'completed',
        processedCount: analysisState.totalCryptocurrencies
      });
      
      return {
        success: true,
        message: '统一波动性分析完成！',
        batchId: analysisState.currentBatchId,
        progress: {
          total: analysisState.totalCryptocurrencies,
          processed: analysisState.totalCryptocurrencies,
          percentage: 100
        }
      };
    }
    
    // 处理当前批次
    let processedInBatch = 0;
    let lastProcessedId = analysisState.lastProcessedId;
    
    for (const crypto of cryptocurrencies) {
      const result = await processCryptocurrency(crypto, analysisState.currentBatchId);
      
      if (result) {
        processedInBatch++;
      }
      
      lastProcessedId = crypto.id;
      
      // 每处理10个加密货币更新一次状态
      if (processedInBatch % 10 === 0) {
        await updateAnalysisState(analysisState.id, {
          processedCount: analysisState.processedCount + processedInBatch,
          lastProcessedId
        });
        
        const percentage = Math.round(((analysisState.processedCount + processedInBatch) / analysisState.totalCryptocurrencies) * 100);
        console.log(`已处理 ${analysisState.processedCount + processedInBatch}/${analysisState.totalCryptocurrencies} (${percentage}%)`);
      }
    }
    
    // 更新最终状态
    const newProcessedCount = analysisState.processedCount + processedInBatch;
    await updateAnalysisState(analysisState.id, {
      processedCount: newProcessedCount,
      lastProcessedId
    });
    
    // 更新批次统计
    await pool.query(
      'UPDATE volatility_analysis_batches SET total_analyzed = $1 WHERE id = $2',
      [newProcessedCount, analysisState.currentBatchId]
    );
    
    const percentage = Math.round((newProcessedCount / analysisState.totalCryptocurrencies) * 100);
    
    return {
      success: true,
      message: `批次处理完成，还有${percentage}%的数据正在计算`,
      batchId: analysisState.currentBatchId,
      progress: {
        total: analysisState.totalCryptocurrencies,
        processed: newProcessedCount,
        percentage,
        remaining: analysisState.totalCryptocurrencies - newProcessedCount
      }
    };
    
  } catch (error) {
    console.error('统一波动性分析失败:', error);
    
    if (analysisState) {
      await updateAnalysisState(analysisState.id, {
        status: 'error',
        errorMessage: error.message
      });
    }
    
    return {
      success: false,
      message: '统一波动性分析失败: ' + error.message
    };
  }
}

/**
 * 获取分析进度
 */
export async function getAnalysisProgress(): Promise<any> {
  try {
    const query = `
      SELECT * FROM volatility_analysis_states 
      WHERE status IN ('running', 'paused', 'completed') 
      ORDER BY start_time DESC 
      LIMIT 1
    `;
    
    const result = await pool.query(query);
    
    if (result.rows.length === 0) {
      return {
        status: 'not_started',
        message: '尚未开始分析'
      };
    }
    
    const state = result.rows[0];
    const percentage = Math.round((state.processed_count / state.total_cryptocurrencies) * 100);
    
    return {
      status: state.status,
      batchId: state.current_batch_id,
      total: state.total_cryptocurrencies,
      processed: state.processed_count,
      percentage,
      remaining: state.total_cryptocurrencies - state.processed_count,
      startTime: state.start_time,
      lastUpdateTime: state.last_update_time,
      errorMessage: state.error_message
    };
    
  } catch (error) {
    console.error('获取分析进度失败:', error);
    return {
      status: 'error',
      message: '获取进度失败: ' + error.message
    };
  }
}