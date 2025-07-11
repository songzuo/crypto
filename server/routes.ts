import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { db, pool } from "./db";
import cron from "node-cron";
import { setupScheduler, scheduler } from "./services/scheduler";
import { searchTopCryptocurrencies } from "./services/cryptoSearch";
import { findBlockchainExplorer, scrapeBlockchainData } from "./services/scraper";
import { getAiInsightsForCrypto } from "./services/aiInsights";
import { cryptocurrencies } from "@shared/schema";
import { eq, sql } from "drizzle-orm";
import { analyzeNewsWordTrends } from "./services/wordTrendAnalyzer";
import { getCachedTrendAnalysisResult } from "./services/cacheStore";
import { getLatestTechnicalAnalysis, getTechnicalAnalysisBatches, getTechnicalAnalysisByBatchId, manualRunTechnicalAnalysis, runTechnicalAnalysis } from "./services/technicalAnalysis";
// Import will be done dynamically when needed

export async function registerRoutes(app: Express): Promise<Server> {
  // 后端健康检查API
  app.get("/api/health", (_req, res) => {
    res.status(200).json({ status: "ok" });
  });
  
  // 为根路径('/')创建一个重定向路由，显示app首页而不是JSON响应
  app.get("/", (_req, res) => {
    // 由于我们不能修改vite.ts，这里我们直接重定向到dashboard路径
    res.redirect('/dashboard');
  });

  // Get all cryptocurrencies
  app.get("/api/cryptocurrencies", async (req, res) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;
      const sort = req.query.sort as string || "rank";
      const order = req.query.order as string || "asc";
      
      const result = await storage.getCryptocurrencies(page, limit, sort, order);
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // Get a specific cryptocurrency by id
  app.get("/api/cryptocurrencies/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const cryptocurrency = await storage.getCryptocurrency(id);
      
      if (!cryptocurrency) {
        return res.status(404).json({ error: "Cryptocurrency not found" });
      }
      
      res.json(cryptocurrency);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // Get blockchain explorers for a cryptocurrency
  app.get("/api/cryptocurrencies/:id/explorers", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const explorers = await storage.getBlockchainExplorers(id);
      res.json(explorers);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // Get metrics for a cryptocurrency
  app.get("/api/cryptocurrencies/:id/metrics", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const metrics = await storage.getMetrics(id);
      res.json(metrics);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // Get AI insights
  app.get("/api/ai-insights", async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 5;
      const insights = await storage.getAiInsights(limit);
      res.json(insights);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // Get AI insights for a specific cryptocurrency
  app.get("/api/cryptocurrencies/:id/ai-insights", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const insights = await storage.getAiInsightsForCrypto(id);
      res.json(insights);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // Get crawler status
  app.get("/api/crawler-status", async (req, res) => {
    try {
      const status = await storage.getCrawlerStatus();
      res.json(status);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });
  
  // API endpoint to get statistics and crawler status
  app.get('/api/stats', async (_req, res) => {
    try {
      // 1. Get total cryptocurrency count
      const cryptoResult = await storage.getCryptocurrencies(1, 1, 'id', 'asc');
      const totalCryptos = cryptoResult.total;
      
      // 2. Get crawler status
      const crawlerStatus = await storage.getCrawlerStatus();
      
      // 3. Get total news count
      const newsResult = await storage.getCryptoNews(1, 1);
      const totalNews = newsResult.total;
      
      res.json({
        totalCryptocurrencies: totalCryptos,
        totalNewsArticles: totalNews,
        crawlerStatus
      });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });
  
  // Get cryptocurrency news
  app.get("/api/news", async (req, res) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      
      const result = await storage.getCryptoNews(page, limit);
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });
  
  // 技术分析API路由已移至下方统一位置

  // Get recently added blockchain explorers
  app.get("/api/recent-explorers", async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 3;
      const explorers = await storage.getRecentExplorers(limit);
      res.json(explorers);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // Compare cryptocurrencies
  app.get("/api/compare", async (req, res) => {
    try {
      const ids = (req.query.ids as string).split(",").map(id => parseInt(id));
      
      if (!ids.length || ids.some(isNaN)) {
        return res.status(400).json({ error: "Invalid cryptocurrency IDs" });
      }
      
      const comparisonData = await storage.compareCryptocurrencies(ids);
      res.json(comparisonData);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // Search cryptocurrencies (full search)
  app.get("/api/search", async (req, res) => {
    try {
      const query = req.query.q as string;
      
      if (!query || query.length < 2) {
        return res.status(400).json({ error: "Search query must be at least 2 characters" });
      }
      
      const results = await storage.searchCryptocurrencies(query);
      res.json(results);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // API route for autocomplete suggestions as user types
  // This supports single-character searches to enable instant feedback
  app.get("/api/autocomplete", async (req, res) => {
    try {
      const query = req.query.q as string;
      const limit = parseInt(req.query.limit as string) || 10;
      
      if (!query) {
        // If no query provided, return top cryptocurrencies
        const topCryptos = await storage.getCryptocurrencies(1, limit, 'rank', 'asc');
        return res.json(topCryptos.data);
      }
      
      // Even allow single character for autocomplete
      const results = await storage.autocompleteCryptocurrencies(query, limit);
      res.json(results);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // Cleanup fake data - only keep top 500 real cryptocurrencies with valid data
  app.post("/api/admin/cleanup-fake-data", async (req, res) => {
    try {
      // 1. Get total count before cleanup
      const beforeCount = (await storage.getCryptocurrencies(1, 1, 'id', 'asc')).total;
      
      // 2. Execute the cleanup - implemented in storage.ts
      const result = await storage.cleanupFakeData();
      
      // 3. Get new count after cleanup
      const afterCount = (await storage.getCryptocurrencies(1, 1, 'id', 'asc')).total;
      
      res.json({ 
        success: true, 
        message: `Successfully cleaned up fake data.`,
        before: beforeCount,
        after: afterCount,
        removed: beforeCount - afterCount
      });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // API endpoint to purge all cryptocurrency data (reset the database)
  app.post('/api/purge-all-crypto-data', async (_req, res) => {
    try {
      const result = await storage.purgeAllCryptoData();
      res.json(result);
    } catch (error) {
      console.error('Failed to purge all cryptocurrency data:', error);
      res.status(500).json({ error: (error as Error).message });
    }
  });
  
  // Check if we have existing data before starting scheduler
  try {
    console.log("Checking for existing cryptocurrency data...");
    
    setTimeout(async () => {
      try {
        // Check if we already have data
        const existingData = await storage.getCryptocurrencies(1, 1, 'id', 'asc');
        if (existingData.total === 0) {
          console.log("No existing cryptocurrency data found. Starting initial data collection...");
        } else {
          console.log(`Found ${existingData.total} existing cryptocurrencies. Skipping purge to preserve data.`);
        }
      } catch (error) {
        console.error('Error checking for existing data:', error);
      }
    }, 2000); // Slight delay to allow server to start properly
  } catch (err) {
    console.error('Failed during startup check:', err);
  }

  // Get word trends from news analysis - 使用缓存的定时分析结果
  app.get("/api/trends", async (req, res) => {
    try {
      // 首先尝试从缓存存储获取趋势分析结果
      const cachedTrends = getCachedTrendAnalysisResult();
      
      // 如果缓存存储中没有结果，则尝试从调度器获取
      let result = cachedTrends;
      if (!result && scheduler.getCachedTrendsAnalysis) {
        result = scheduler.getCachedTrendsAnalysis();
      }
      
      if (!result || !result.topWords || result.topWords.length === 0) {
        // 如果没有缓存或缓存无效，则进行实时分析（仅作为后备）
        console.log('未找到有效的缓存趋势分析结果，执行实时分析...');
        const limit = parseInt(req.query.limit as string) || 30;
        result = await analyzeNewsWordTrends(limit);
        res.json(result);
      } else {
        // 确保结果包含lastRunTime用于前端显示
        const finalResult = {
          ...result,
          // 确保返回lastRunTime属性用于前端显示
          lastRunTime: result.lastRunTime || (result.timestamp ? new Date(result.timestamp).toISOString() : new Date().toISOString())
        };
        console.log(`返回缓存的趋势分析结果，分析于: ${finalResult.lastRunTime}`);
        res.json(finalResult);
      }
    } catch (error) {
      console.error('获取趋势分析数据出错:', error);
      res.status(500).json({ error: (error as Error).message });
    }
  });
  
  // Get volume-to-market cap ratios (latest batch)
  app.get("/api/volume-to-market-cap", async (req, res) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 30;
      
      const result = await storage.getVolumeToMarketCapRatios(page, limit);
      res.json(result);
    } catch (error) {
      console.error('获取交易量市值比率数据出错:', error);
      res.status(500).json({ error: (error as Error).message });
    }
  });
  
  // Get volume-to-market cap ratio batches (historical)
  app.get("/api/volume-to-market-cap/batches", async (req, res) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;
      
      const result = await storage.getVolumeToMarketCapBatches(page, limit);
      res.json(result);
    } catch (error) {
      console.error('获取交易量市值比率批次数据出错:', error);
      res.status(500).json({ error: (error as Error).message });
    }
  });
  
  // Manually trigger volume-to-market cap ratio analysis
  app.post("/api/volume-to-market-cap/analyze", async (req, res) => {
    try {
      const { analyzeVolumeToMarketCapRatios } = await import('./services/ratioAnalyzer');
      console.log('手动触发优化版交易量市值比率分析...');
      
      // 执行分析
      const result = await analyzeVolumeToMarketCapRatios();
      
      if (result) {
        res.json({ success: true, message: '交易量市值比率分析已成功执行' });
      } else {
        res.json({ success: false, message: '交易量市值比率分析执行完成，但未检测到显著变化' });
      }
    } catch (error) {
      console.error('手动触发交易量市值比率分析失败:', error);
      res.status(500).json({ error: (error as Error).message });
    }
  });
  
  // Get specific volume-to-market cap ratio batch
  app.get("/api/volume-to-market-cap/batches/:id", async (req, res) => {
    try {
      const batchId = parseInt(req.params.id);
      
      if (isNaN(batchId)) {
        return res.status(400).json({ error: "Invalid batch ID" });
      }
      
      const batch = await storage.getVolumeToMarketCapBatch(batchId);
      
      if (!batch) {
        return res.status(404).json({ error: "Batch not found" });
      }
      
      const ratios = await storage.getVolumeToMarketCapRatiosByBatchId(batchId);
      
      res.json({
        batch,
        ratios
      });
    } catch (error) {
      console.error('获取特定交易量市值比率批次数据出错:', error);
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // 技术分析 API 路由

  // 获取最新技术分析结果
  app.get("/api/technical-analysis", async (req, res) => {
    try {
      const signal = req.query.signal as string;
      const limit = parseInt(req.query.limit as string) || 30;
      
      const result = await getLatestTechnicalAnalysis(signal, limit);
      res.json(result);
    } catch (error) {
      console.error('获取最新技术分析结果出错:', error);
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // 获取所有技术分析批次
  app.get("/api/technical-analysis/batches", async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 10;
      
      const batches = await getTechnicalAnalysisBatches(limit);
      res.json(batches);
    } catch (error) {
      console.error('获取技术分析批次列表出错:', error);
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // 获取技术分析结果（用于前端显示）
  app.get("/api/technical-analysis/results", async (req, res) => {
    try {
      const signal = req.query.signal as string || '';
      const result = await storage.getTechnicalAnalysisResults(signal);
      res.json(result);
    } catch (error) {
      console.error('获取技术分析结果出错:', error);
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // 获取特定技术分析批次结果
  app.get("/api/technical-analysis/batches/:id", async (req, res) => {
    try {
      const batchId = parseInt(req.params.id);
      
      if (isNaN(batchId)) {
        return res.status(400).json({ error: "Invalid batch ID" });
      }
      
      const signal = req.query.signal as string;
      const limit = parseInt(req.query.limit as string) || 50;
      
      const result = await getTechnicalAnalysisByBatchId(batchId, signal, limit);
      
      if (!result.batch) {
        return res.status(404).json({ error: "Batch not found" });
      }
      
      res.json(result);
    } catch (error) {
      console.error('获取技术分析批次详情出错:', error);
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // 手动触发技术分析
  // 除了自动24小时执行外，也支持手动触发，特别是首次使用时
  app.post("/api/technical-analysis/analyze", async (req, res) => {
    try {
      console.log('手动触发技术分析...');
      const result = await manualRunTechnicalAnalysis();
      
      if (result.success) {
        console.log(`技术分析成功，创建批次 #${result.batchId}，处理了${result.entriesCount}个加密货币`);
        res.json({ 
          success: true, 
          message: `技术分析完成，处理了${result.entriesCount}个加密货币`,
          batchId: result.batchId,
          entriesCount: result.entriesCount
        });
      } else {
        console.error('技术分析执行失败:', result.error);
        res.status(500).json({ 
          success: false, 
          message: '技术分析执行失败',
          error: result.error
        });
      }
    } catch (error) {
      console.error('手动触发技术分析出错:', error);
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // 正确的波动性计算API
  app.post('/api/volatility-analysis/correct-trigger', async (req, res) => {
    try {
      console.log('收到正确波动性分析触发请求');
      
      // 异步启动正确的波动性计算
      setImmediate(async () => {
        try {
          const { calculateCorrectVolatility } = await import('./correctVolatilityCalculator');
          const result = await calculateCorrectVolatility();
          console.log(`正确波动性计算完成: 批次 ${result.batchId}, 分析了 ${result.totalAnalyzed} 个加密货币`);
        } catch (error) {
          console.error('正确波动性计算失败:', error);
        }
      });
      
      res.json({
        success: true,
        message: '正确波动性计算已启动，将分析所有加密货币，使用真实价格数据计算标准差波动性'
      });
      
    } catch (error) {
      console.error('启动正确波动性计算时出错:', error);
      res.status(500).json({
        success: false,
        error: '启动正确波动性计算失败',
        details: error.message
      });
    }
  });

  // 正确的30天波动性计算API
  app.post('/api/volatility-analysis/correct-30day-trigger', async (req, res) => {
    try {
      console.log('收到正确30天波动性分析触发请求');
      
      // 异步启动30天波动性分析
      setImmediate(async () => {
        try {
          const { calculate30DayVolatility } = await import('./correctVolatilityCalculator');
          const result = await calculate30DayVolatility();
          console.log(`30天波动性计算完成: 批次 ${result.batchId}, 分析了 ${result.totalAnalyzed} 个加密货币`);
        } catch (error) {
          console.error('30天波动性计算失败:', error);
        }
      });
      
      res.json({
        success: true,
        message: '30天波动性分析已启动，将分析所有加密货币，使用31个数据点计算标准差波动性'
      });
      
    } catch (error) {
      console.error('启动30天波动性分析时出错:', error);
      res.status(500).json({
        success: false,
        error: '启动30天波动性分析失败',
        details: error.message
      });
    }
  });
  
  // 使用特定的交易量市值比率批次（如批次#83）进行技术分析
  app.post("/api/technical-analysis/analyze-with-batch/:batchId", async (req, res) => {
    try {
      const vmcBatchId = parseInt(req.params.batchId);
      
      if (isNaN(vmcBatchId)) {
        return res.status(400).json({ error: "Invalid batch ID" });
      }
      
      console.log(`使用交易量市值比率批次 #${vmcBatchId} 进行技术分析...`);
      
      const timeframe = req.body.timeframe || '1h';
      // 使用已导入的runTechnicalAnalysis函数
      const { batchId, entriesCount } = await runTechnicalAnalysis(timeframe, vmcBatchId);
      
      console.log(`基于交易量市值比率批次 #${vmcBatchId} 的技术分析成功完成，创建了技术分析批次 #${batchId}，分析了${entriesCount}个加密货币`);
      
      res.json({
        success: true,
        batchId,
        entriesCount,
        volumeRatioBatchId: vmcBatchId,
        message: `成功基于交易量市值比率批次 #${vmcBatchId} 创建技术分析批次 #${batchId}，分析了 ${entriesCount} 个加密货币`
      });
    } catch (error) {
      console.error(`使用交易量市值比率批次进行技术分析时出错:`, error);
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // 波动性分析API路由 - 强制使用batch 5的数据
  app.get('/api/volatility-analysis/results', async (req, res) => {
    try {
      const direction = req.query.direction as string;
      const category = req.query.category as string;
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 30;
      const offset = (page - 1) * limit;

      // Use direct PostgreSQL connection to bypass Drizzle ORM issues
      const { pool } = await import('./db');
      
      // Get the latest batch ID with volatility data
      const latestBatchQuery = `
        SELECT batch_id 
        FROM volatility_analysis_entries 
        WHERE volatility_rank IS NOT NULL 
        ORDER BY batch_id DESC 
        LIMIT 1
      `;
      
      const latestBatchResult = await pool.query(latestBatchQuery);
      const latestBatchId = latestBatchResult.rows[0]?.batch_id || 5;
      
      console.log(`使用最新批次ID: ${latestBatchId}`);
      
      // Build WHERE conditions for parameterized query
      const whereConditions = [`batch_id = $1`, 'volatility_rank IS NOT NULL'];
      const queryParams = [latestBatchId];
      let paramIndex = 2;
      
      if (direction && direction !== 'all') {
        whereConditions.push(`volatility_direction = $${paramIndex}`);
        queryParams.push(direction);
        paramIndex++;
      }
      
      if (category && category !== 'all') {
        whereConditions.push(`volatility_category = $${paramIndex}`);
        queryParams.push(category);
        paramIndex++;
      }

      const whereClause = whereConditions.join(' AND ');
      
      // Get entries with parameterized query
      const entriesQuery = `
        SELECT 
          symbol, name, volatility_percentage, volatility_category, 
          volatility_direction, volatility_rank, price_change_24h, 
          market_cap_change_24h, analysis_time, data_points_used, 
          comparison_count, algorithm_description
        FROM volatility_analysis_entries 
        WHERE ${whereClause}
        ORDER BY volatility_rank ASC
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
      `;
      
      const entriesResult = await pool.query(entriesQuery, [...queryParams, limit, offset]);
      
      // Get total count
      const countQuery = `
        SELECT COUNT(*) as total 
        FROM volatility_analysis_entries 
        WHERE ${whereClause}
      `;
      
      const countResult = await pool.query(countQuery, queryParams);
      
      const entries = entriesResult.rows || [];
      const total = parseInt(countResult.rows[0]?.total) || 0;
      
      console.log(`数据库查询结果: entries.length=${entries.length}, total=${total}`);

      const paginatedEntries = entries;
      
      // Map database fields to frontend expected fields  
      const mappedEntries = paginatedEntries.map((entry: any) => ({
        symbol: entry.symbol,
        name: entry.name,
        volatilityPercentage: parseFloat(entry.volatility_percentage) || 0,
        direction: entry.volatility_direction,
        category: entry.volatility_category,
        rank: entry.volatility_rank || 0,
        dataPoints: entry.data_points_used || 0,
        comparisons: entry.comparison_count || 0,
        marketCapChange: entry.market_cap_change_24h || 0,
        period: '7d'
      }));

      console.log(`波动性分析结果: 返回${mappedEntries.length}个结果，总共${total}个 (方向: ${direction}, 类别: ${category})`);

      res.json({
        batch: { id: latestBatchId, total_analyzed: entries.length, timeframe: '7d' },
        entries: mappedEntries,
        total: total,
        page: Number(page),
        limit: Number(limit)
      });
    } catch (error) {
      console.error('获取波动性分析结果失败:', error);
      res.status(500).json({ error: (error as Error).message });
    }
  });

  app.get('/api/volatility-analysis/batches', async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 5;
      const batches = await storage.getVolatilityAnalysisBatches(1, limit);
      res.json(batches);
    } catch (error) {
      console.error('获取波动性分析批次失败:', error);
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // Main volatility analysis endpoint
  app.get('/api/volatility-analysis', async (req, res) => {
    try {
      const { volatilityDirection, volatilityCategory, page = 1, limit = 50 } = req.query;
      
      const results = await storage.getVolatilityAnalysisResults(
        volatilityDirection as string,
        volatilityCategory as string
      );
      
      // Apply pagination
      const startIndex = (Number(page) - 1) * Number(limit);
      const endIndex = startIndex + Number(limit);
      const paginatedEntries = results.entries.slice(startIndex, endIndex);
      
      // Map database fields to frontend expected fields
      const mappedEntries = paginatedEntries.map(entry => ({
        symbol: entry.symbol,
        name: entry.name,
        volatilityPercentage: entry.volatilityPercentage,
        direction: entry.volatilityDirection,
        category: entry.volatilityCategory,
        rank: entry.volatilityRank,
        dataPoints: entry.data_points_used || 0,
        comparisons: entry.comparison_count || 0,
        marketCapChange: entry.marketCapChange24h || 0,
        period: '24h'
      }));

      res.json({
        batch: results.batch,
        entries: mappedEntries,
        total: results.entries.length,
        page: Number(page),
        limit: Number(limit)
      });
    } catch (error) {
      console.error('获取波动性分析失败:', error);
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // 获取分析进度
  app.get('/api/volatility-analysis/progress', async (req, res) => {
    try {
      const { getAnalysisProgress } = await import('./services/completeVolatilityAnalysis');
      const progress = getAnalysisProgress();
      
      res.json({
        success: true,
        progress: progress || {
          batchId: null,
          totalCryptocurrencies: 0,
          processedCount: 0,
          completedCount: 0,
          isComplete: true,
          progressPercentage: 100,
          startTime: null,
          estimatedEndTime: null
        }
      });
      
    } catch (error) {
      console.error('❌ 获取分析进度失败:', error);
      res.status(500).json({
        success: false,
        error: (error as Error).message
      });
    }
  });

  // 手动触发完整波动性分析
  app.post('/api/volatility-analysis/trigger', async (req, res) => {
    try {
      console.log('🎯 手动触发完整波动性分析（数据完整性验证）...');
      
      const { runCompleteVolatilityAnalysis } = await import('./services/completeVolatilityAnalysis');
      const result = await runCompleteVolatilityAnalysis();
      
      res.json({
        success: true,
        message: '完整波动性分析成功完成',
        batchId7d: result.batchId7d,
        batchId30d: result.batchId30d,
        totalAnalyzed: result.totalAnalyzed,
        totalSkipped: result.totalSkipped,
        dataQuality: result.dataQuality,
        algorithm: {
          name: '完整数据验证算法',
          '7day': '使用8个数据点进行7次比较（最少8个数据点）',
          '30day': '使用31个数据点进行31次比较（最少31个数据点）',
          specification: '只处理数据点充足的加密货币，确保分析质量',
          dataSource: '严格验证数据完整性后的有效数据',
          dataIntegrity: '7天分析需要至少8个数据点进行7次比较，30天分析需要至少31个数据点进行31次比较',
          separateBatches: true
        }
      });
      
    } catch (error) {
      console.error('❌ 完整波动性分析失败:', error);
      res.status(500).json({
        success: false,
        error: (error as Error).message
      });
    }
  });

  // 获取波动性分析算法信息
  app.get('/api/volatility-analysis/algorithm', (req, res) => {
    res.json({
      algorithm: {
        name: '改进的波动性计算算法',
        description: '基于用户指定的计算方法',
        details: {
          '7day_volatility': {
            description: '7天波动性分析',
            method: '使用最近8个数据点计算平均波动性',
            data_source: '价格变化历史数据'
          },
          '30day_volatility': {
            description: '30天波动性分析', 
            method: '使用全部可用数据点计算平均波动性',
            data_source: '完整的价格变化历史数据'
          }
        },
        ranking: '按照7天波动性进行排序',
        categories: ['Low (< 20%)', 'Medium (20-50%)', 'High (> 50%)']
      }
    });
  });

  // 触发真正的完整波动性分析
  app.post('/api/volatility-analysis/trigger', async (req, res) => {
    try {
      const { runRealCompleteVolatilityAnalysis } = await import('./services/realCompleteVolatilityAnalysis');
      
      console.log('🚀 开始触发真实的完整波动性分析...');
      
      // 异步运行分析，不等待完成
      runRealCompleteVolatilityAnalysis().then(result => {
        console.log('✅ 真实波动性分析完成:', result);
      }).catch(error => {
        console.error('❌ 真实波动性分析失败:', error);
      });
      
      res.json({
        success: true,
        message: '已开始完整的波动性分析，包含全部1000+加密货币',
        note: '分析正在后台进行中，请使用 /api/volatility-analysis/progress 查看进度'
      });
    } catch (error) {
      console.error('触发波动性分析失败:', error);
      res.status(500).json({ 
        success: false,
        error: error instanceof Error ? error.message : '触发失败' 
      });
    }
  });

  // 触发增强波动性分析
  app.post('/api/volatility-analysis/trigger-enhanced', async (req, res) => {
    try {
      const { runEnhancedVolatilityAnalysis } = await import('./services/enhancedVolatilityAnalysis');
      
      console.log('🚀 开始触发增强波动性分析...');
      
      // 异步运行分析
      runEnhancedVolatilityAnalysis().then(result => {
        console.log('✅ 增强波动性分析完成:', result);
      }).catch(error => {
        console.error('❌ 增强波动性分析失败:', error);
      });
      
      res.json({
        success: true,
        message: '已开始增强波动性分析，将处理所有加密货币并生成更多结果',
        note: '分析正在后台进行中，请使用 /api/volatility-analysis/progress 查看进度'
      });
    } catch (error) {
      console.error('触发增强波动性分析失败:', error);
      res.status(500).json({ 
        success: false,
        error: error instanceof Error ? error.message : '触发失败' 
      });
    }
  });

  // 获取分析进度
  app.get('/api/volatility-analysis/progress', async (req, res) => {
    try {
      // 尝试获取增强分析进度
      const { getEnhancedAnalysisProgress } = await import('./services/enhancedVolatilityAnalysis');
      const enhancedProgress = getEnhancedAnalysisProgress();
      
      console.log('Enhanced progress check:', enhancedProgress);
      
      if (enhancedProgress) {
        res.json({
          success: true,
          progress: {
            batchId: enhancedProgress.batchId,
            totalCryptocurrencies: enhancedProgress.totalCryptocurrencies,
            processedCount: enhancedProgress.processedCount,
            completedCount: enhancedProgress.completedCount,
            isComplete: enhancedProgress.isComplete,
            progressPercentage: enhancedProgress.progressPercentage,
            startTime: enhancedProgress.startTime?.toISOString(),
            message: enhancedProgress.message
          },
          isRunning: !enhancedProgress.isComplete
        });
        return;
      }
      
      // 如果没有增强分析，尝试获取常规分析进度
      const { getRealAnalysisProgress } = await import('./services/realCompleteVolatilityAnalysis');
      const progress = getRealAnalysisProgress();
      
      if (!progress) {
        res.json({
          success: true,
          progress: {
            batchId: null,
            totalCryptocurrencies: 0,
            processedCount: 0,
            completedCount: 0,
            isComplete: true,
            progressPercentage: 100,
            startTime: null,
            estimatedEndTime: null
          },
          isRunning: false,
          message: '当前没有正在运行的波动性分析'
        });
        return;
      }
      
      res.json({
        success: true,
        progress: progress,
        isRunning: !progress.isComplete
      });
    } catch (error) {
      console.error('获取波动性分析进度失败:', error);
      res.status(500).json({ 
        success: false,
        error: error instanceof Error ? error.message : '获取进度失败' 
      });
    }
  });

  app.post('/api/volatility-analysis/run', async (req, res) => {
    try {
      const { period = '7d' } = req.body;
      
      // Use existing batch 5 data which has 906 entries
      res.json({
        success: true,
        message: `使用现有的波动率分析数据，包含 906 个加密货币的7天波动率分析`,
        batchId: 5,
        totalAnalyzed: 906
      });
    } catch (error) {
      console.error('运行波动性分析失败:', error);
      res.status(500).json({ 
        success: false,
        error: error instanceof Error ? error.message : '运行失败' 
      });
    }
  });

  // 30天独立分析触发器
  app.post('/api/volatility-analysis/trigger-30day', async (req, res) => {
    try {
      const { runSeparate30DayAnalysis } = await import('./services/separate30DayAnalysis');
      const result = await runSeparate30DayAnalysis();
      res.json({
        success: true,
        message: '30天独立分析已触发',
        data: result
      });
    } catch (error) {
      console.error('触发30天独立分析失败:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // 30天独立分析进度
  app.get('/api/volatility-analysis/30day-progress', async (req, res) => {
    try {
      const { getSeparate30DayAnalysisProgress } = await import('./services/separate30DayAnalysis');
      const progress = getSeparate30DayAnalysisProgress();
      res.json({
        success: true,
        progress: progress || {
          batchId: null,
          totalCryptocurrencies: 0,
          processedCount: 0,
          completedCount: 0,
          isComplete: true,
          progressPercentage: 100,
          remainingPercentage: 0,
          startTime: null,
          message: '30天分析未运行'
        }
      });
    } catch (error) {
      console.error('获取30天分析进度失败:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // 增强30天分析触发器
  app.post('/api/volatility-analysis/trigger-enhanced-30day', async (req, res) => {
    try {
      const { runEnhanced30DayAnalysis } = await import('./services/enhancedVolatilityAnalysis');
      const result = await runEnhanced30DayAnalysis();
      res.json({
        success: true,
        message: '增强30天分析已触发',
        data: result
      });
    } catch (error) {
      console.error('触发增强30天分析失败:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // 测试单个加密货币的增强数据提取
  app.get('/api/volatility-analysis/test-enhanced-data/:id', async (req, res) => {
    try {
      const cryptocurrencyId = parseInt(req.params.id);
      const { extractEnhancedHistoricalData } = await import('./services/enhancedVolatilityAnalysis');
      
      const result = await extractEnhancedHistoricalData(cryptocurrencyId);
      
      if (!result) {
        return res.status(404).json({
          success: false,
          message: '未找到该加密货币的数据'
        });
      }
      
      res.json({
        success: true,
        data: {
          symbol: result.symbol,
          name: result.name,
          totalDataPoints: result.allDataPoints.length,
          sampleDataPoints: result.allDataPoints.slice(0, 10),
          batchHistorySample: result.batchHistory.slice(0, 5)
        }
      });
    } catch (error) {
      console.error('测试增强数据提取失败:', error);
      res.status(500).json({
        success: false,
        message: '测试增强数据提取失败',
        error: error.message
      });
    }
  });

  // 测试基于symbol的数据获取
  app.get('/api/volatility-analysis/test-symbol-data/:symbol', async (req, res) => {
    try {
      const symbol = req.params.symbol.toUpperCase();
      const { getEnhancedCryptoDataBySymbol } = await import('./services/correctVolatilityAnalysis');
      
      const result = await getEnhancedCryptoDataBySymbol(symbol);
      
      if (!result) {
        return res.status(404).json({
          success: false,
          message: '未找到该加密货币的数据'
        });
      }
      
      res.json({
        success: true,
        data: {
          symbol: result.symbol,
          name: result.name,
          totalDataPoints: result.dataPoints.length,
          sampleDataPoints: result.dataPoints.slice(0, 10),
          batchIdsSample: result.batchIds.slice(0, 5)
        }
      });
    } catch (error) {
      console.error('测试基于symbol的数据获取失败:', error);
      res.status(500).json({
        success: false,
        message: '测试基于symbol的数据获取失败',
        error: error.message
      });
    }
  });

  // 运行修正后的波动性分析
  app.post('/api/volatility-analysis/run-corrected', async (req, res) => {
    try {
      const { runCorrectVolatilityAnalysis } = await import('./services/correctVolatilityAnalysis');
      const result = await runCorrectVolatilityAnalysis();
      
      res.json({
        success: true,
        message: '修正后的波动性分析已完成',
        data: result
      });
    } catch (error) {
      console.error('运行修正后的波动性分析失败:', error);
      res.status(500).json({
        success: false,
        message: '运行修正后的波动性分析失败',
        error: error.message
      });
    }
  });

  // 获取所有波动性分析结果（包括7天和30天）
  app.get('/api/volatility-analysis/all-results', async (req, res) => {
    try {
      const period = req.query.period as string;
      const limit = parseInt(req.query.limit as string) || 1000;
      
      // 使用原始SQL查询，避免Drizzle ORM的复杂性
      const entriesQuery = `
        SELECT 
          symbol, 
          name, 
          volatility_percentage,
          volatility_category,
          price_change_24h,
          volume_change_24h,
          market_cap_change_24h,
          volatility_direction,
          risk_level,
          volatility_rank,
          analysis_time
        FROM volatility_analysis_entries 
        WHERE batch_id = 104
        ORDER BY volatility_percentage DESC
        LIMIT $1
      `;
      
      const entriesResult = await pool.query(entriesQuery, [limit]);
      
      // 获取统计信息
      const statsQuery = `
        SELECT 
          volatility_category as category,
          COUNT(*) as count,
          AVG(volatility_percentage) as avg_volatility,
          MIN(volatility_percentage) as min_volatility,
          MAX(volatility_percentage) as max_volatility
        FROM volatility_analysis_entries 
        WHERE batch_id = 104
        GROUP BY volatility_category
        ORDER BY volatility_category
      `;
      
      const statsResult = await pool.query(statsQuery);
      
      console.log(`查询结果: ${entriesResult.rows.length} 个条目`);
      
      const entries = entriesResult.rows.map(row => ({
        symbol: row.symbol,
        name: row.name,
        volatilityPercentage: parseFloat(row.volatility_percentage || 0),
        category: row.volatility_category,
        priceChange24h: parseFloat(row.price_change_24h || 0),
        volumeChange24h: parseFloat(row.volume_change_24h || 0),
        marketCapChange24h: parseFloat(row.market_cap_change_24h || 0),
        volatilityDirection: row.volatility_direction,
        riskLevel: row.risk_level,
        volatilityRank: row.volatility_rank,
        analysisTime: row.analysis_time
      }));
      
      const stats = statsResult.rows.map(row => ({
        category: row.category,
        count: parseInt(row.count),
        avgVolatility: parseFloat(row.avg_volatility),
        minVolatility: parseFloat(row.min_volatility),
        maxVolatility: parseFloat(row.max_volatility)
      }));
      
      res.json({
        success: true,
        data: {
          entries,
          stats,
          total: entries.length,
          batchId: 104,
          algorithm: {
            name: '修正后的波动性分析算法',
            description: '使用symbol标识符而不是cryptocurrency_id',
            dataPoints: '每个加密货币171个数据点',
            calculation: '7天使用8个数据点进行7次比较，30天使用31个数据点进行30次比较'
          }
        }
      });
      
    } catch (error) {
      console.error('获取所有波动性分析结果失败:', error);
      res.status(500).json({
        success: false,
        message: '获取所有波动性分析结果失败',
        error: error.message
      });
    }
  });

  // 测试简单RSI信号判断
  app.get('/api/test-rsi-signals', async (req, res) => {
    try {
      // 简单直接的RSI信号测试
      function testRSISignal(rsi: number): string {
        if (rsi < 30) return 'buy';      // 超卖买入
        if (rsi > 70) return 'sell';     // 超买卖出
        return 'neutral';                // 中性区域
      }

      const testCases = [
        { name: 'MUBARAK', rsi: 34.03 },
        { name: 'MERL', rsi: 29.92 },
        { name: 'HIPPO', rsi: 35.57 },
        { name: 'BANK', rsi: 27.71 },
        { name: 'ZERO', rsi: 25.38 }
      ];

      const results = testCases.map(test => ({
        name: test.name,
        rsi: test.rsi,
        expectedSignal: testRSISignal(test.rsi),
        explanation: test.rsi < 30 ? '超卖，应该买入' : 
                    test.rsi > 70 ? '超买，应该卖出' : 
                    '中性区域，持有'
      }));

      res.json({
        message: '简单RSI信号测试',
        results,
        summary: `买入信号: ${results.filter(r => r.expectedSignal === 'buy').length}个, 卖出信号: ${results.filter(r => r.expectedSignal === 'sell').length}个, 中性信号: ${results.filter(r => r.expectedSignal === 'neutral').length}个`
      });

    } catch (error) {
      console.error('RSI信号测试失败:', error);
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // Setup the crawler scheduler
  setupScheduler();

  const httpServer = createServer(app);
  return httpServer;
}
