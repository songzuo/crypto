import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import cron from "node-cron";
import { setupScheduler } from "./services/scheduler";
import { searchTopCryptocurrencies } from "./services/cryptoSearch";
import { findBlockchainExplorer, scrapeBlockchainData } from "./services/scraper";
import { getAiInsightsForCrypto } from "./services/aiInsights";

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

  // Search cryptocurrencies
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

  // Setup the crawler scheduler
  setupScheduler();

  const httpServer = createServer(app);
  return httpServer;
}
