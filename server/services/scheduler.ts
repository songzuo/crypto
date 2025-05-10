import cron from 'node-cron';
import { searchTopCryptocurrencies } from './cryptoSearch';
import { findBlockchainExplorer, scrapeBlockchainData } from './scraper';
import { getAiInsightsForCrypto } from './aiInsights';
import { storage } from '../storage';

// The entry point for setting up all scheduled tasks
export function setupScheduler() {
  // Schedule searching for top cryptocurrencies every 4 hours
  cron.schedule('0 */4 * * *', async () => {
    console.log('Running scheduled task: Search for top cryptocurrencies');
    await searchTopCryptocurrencies(500);
  });

  // Schedule finding blockchain explorers for cryptocurrencies without explorers every 1 hour
  cron.schedule('30 * * * *', async () => {
    console.log('Running scheduled task: Find blockchain explorers');
    await findExplorersForCryptos();
  });

  // Schedule scraping blockchain data every 2 hours
  cron.schedule('0 */2 * * *', async () => {
    console.log('Running scheduled task: Scrape blockchain data');
    await scrapeAllBlockchainData();
  });

  // Schedule generating AI insights every 6 hours
  cron.schedule('0 */6 * * *', async () => {
    console.log('Running scheduled task: Generate AI insights');
    await generateAiInsights();
  });

  // Initial execution to populate data
  console.log('Running initial data population...');
  searchTopCryptocurrencies(50)
    .then(() => findExplorersForCryptos(10))
    .then(() => scrapeAllBlockchainData(10))
    .then(() => generateAiInsights(5))
    .catch(err => console.error('Error in initial data population:', err));
}

// Function to find explorers for cryptocurrencies without explorers
async function findExplorersForCryptos(limit?: number): Promise<void> {
  try {
    // Update crawler status
    await storage.updateCrawlerStatus({
      blockchainSyncActive: true
    });

    // Get all cryptocurrencies
    const cryptos = await storage.getCryptocurrencies(1, limit || 500, 'rank', 'asc');
    
    for (const crypto of cryptos.data) {
      // Check if this cryptocurrency already has an explorer
      const explorers = await storage.getBlockchainExplorers(crypto.id);
      
      if (explorers.length === 0) {
        console.log(`Finding blockchain explorer for ${crypto.name} (${crypto.symbol})...`);
        
        // Find and store the explorer
        await findBlockchainExplorer(crypto.name, crypto.id);
        
        // Sleep to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }
    
    // Update crawler status
    await storage.updateCrawlerStatus({
      blockchainSyncActive: false
    });
  } catch (error) {
    console.error('Error finding explorers for cryptocurrencies:', error);
    
    // Update crawler status
    await storage.updateCrawlerStatus({
      blockchainSyncActive: false
    });
  }
}

// Function to scrape blockchain data for all cryptocurrencies
async function scrapeAllBlockchainData(limit?: number): Promise<void> {
  try {
    // Update crawler status
    await storage.updateCrawlerStatus({
      blockchainSyncActive: true
    });

    // Get all cryptocurrencies
    const cryptos = await storage.getCryptocurrencies(1, limit || 500, 'rank', 'asc');
    
    for (const crypto of cryptos.data) {
      // Get explorers for this cryptocurrency
      const explorers = await storage.getBlockchainExplorers(crypto.id);
      
      if (explorers.length > 0) {
        console.log(`Scraping blockchain data for ${crypto.name} (${crypto.symbol})...`);
        
        // Scrape data from the first explorer
        await scrapeBlockchainData(explorers[0].url, crypto.id);
        
        // Sleep to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }
    
    // Update crawler status
    await storage.updateCrawlerStatus({
      blockchainSyncActive: false
    });
  } catch (error) {
    console.error('Error scraping blockchain data:', error);
    
    // Update crawler status
    await storage.updateCrawlerStatus({
      blockchainSyncActive: false
    });
  }
}

// Function to generate AI insights for cryptocurrencies
async function generateAiInsights(limit?: number): Promise<void> {
  try {
    // Update crawler status
    await storage.updateCrawlerStatus({
      aiProcessorActive: true
    });

    // Get top cryptocurrencies
    const cryptos = await storage.getCryptocurrencies(1, limit || 20, 'rank', 'asc');
    
    for (const crypto of cryptos.data) {
      console.log(`Generating AI insights for ${crypto.name} (${crypto.symbol})...`);
      
      // Get metrics for this cryptocurrency
      const metrics = await storage.getMetrics(crypto.id);
      
      if (metrics) {
        // Generate insights using AI
        await getAiInsightsForCrypto(crypto, metrics);
        
        // Sleep to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }
    
    // Update crawler status
    await storage.updateCrawlerStatus({
      aiProcessorActive: false
    });
  } catch (error) {
    console.error('Error generating AI insights:', error);
    
    // Update crawler status
    await storage.updateCrawlerStatus({
      aiProcessorActive: false
    });
  }
}
