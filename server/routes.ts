import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import cron from "node-cron";
import { setupScheduler } from "./services/scheduler";
import { searchTopCryptocurrencies } from "./services/cryptoSearch";
import { findBlockchainExplorer, scrapeBlockchainData } from "./services/scraper";
import { getAiInsightsForCrypto } from "./services/aiInsights";
import { cryptocurrencies } from "@shared/schema";
import { eq, sql } from "drizzle-orm";

export async function registerRoutes(app: Express): Promise<Server> {
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
  
  // PURGE AND RESET DATABASE on server start (as requested)
  try {
    console.log("PURGING ALL CRYPTOCURRENCY DATA ON STARTUP (as requested)...");
    
    setTimeout(async () => {
      try {
        // First completely purge all data
        const purgeResult = await storage.purgeAllCryptoData();
        console.log(purgeResult.message);
        
        // Then run initial data population with strict validation (only verified cryptos)
        console.log("Now starting fresh data population with verified crypto only...");
      } catch (purgeError) {
        console.error('Error during initial database purge:', purgeError);
      }
    }, 5000); // Slight delay to allow server to start properly
  } catch (err) {
    console.error('Failed to schedule initial purge:', err);
  }

  // Setup the crawler scheduler
  setupScheduler();

  const httpServer = createServer(app);
  return httpServer;
}
