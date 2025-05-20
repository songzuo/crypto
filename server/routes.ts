import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import cron from "node-cron";
import { setupScheduler, scheduler } from "./services/scheduler";
import { searchTopCryptocurrencies } from "./services/cryptoSearch";
import { findBlockchainExplorer, scrapeBlockchainData } from "./services/scraper";
import { getAiInsightsForCrypto } from "./services/aiInsights";
import { cryptocurrencies } from "@shared/schema";
import { eq, sql } from "drizzle-orm";
import { analyzeNewsWordTrends } from "./services/wordTrendAnalyzer";
import { getCachedTrendAnalysisResult } from "./services/cacheStore";
import { getLatestTechnicalAnalysis, getTechnicalAnalysisBatches, getTechnicalAnalysisByBatchId, manualRunTechnicalAnalysis } from "./services/technicalAnalysis";

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
  app.post("/api/technical-analysis/analyze", async (req, res) => {
    try {
      console.log('手动触发技术分析...');
      
      // 执行分析
      const result = await manualRunTechnicalAnalysis();
      
      res.json({ 
        success: true, 
        message: '技术分析已成功执行', 
        batchId: result.batchId,
        entriesCount: result.entriesCount
      });
    } catch (error) {
      console.error('手动触发技术分析失败:', error);
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // Setup the crawler scheduler
  setupScheduler();

  const httpServer = createServer(app);
  return httpServer;
}
