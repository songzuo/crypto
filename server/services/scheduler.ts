import cron from 'node-cron';
import { searchTopCryptocurrencies } from './cryptoSearch';
import { findBlockchainExplorer, scrapeBlockchainData } from './scraper';
import { getAiInsightsForCrypto } from './aiInsights';
import { storage } from '../storage';

// The entry point for setting up all scheduled tasks
export function setupScheduler() {
  // Setup 24-hour continuous data collection cycle for top 500 cryptocurrencies
  
  // Phase 1: Schedule searching for cryptocurrencies every 6 hours
  // This ensures we have up-to-date cryptocurrency listings
  cron.schedule('0 */6 * * *', async () => {
    console.log('Running scheduled task: Search for top cryptocurrencies');
    // Process all 500 top cryptocurrencies
    await searchTopCryptocurrencies(500);
  });

  // Phase 2: Find blockchain explorers for cryptocurrencies without explorers
  // Runs every hour to progressively find explorers for all cryptocurrencies
  cron.schedule('15 * * * *', async () => {
    console.log('Running scheduled task: Find blockchain explorers');
    // Process up to 50 cryptocurrencies per hour
    await findExplorersForCryptos(50);
  });

  // Phase 3: Scrape blockchain data - part 1 (first half)
  // Use multiple schedules to distribute load and process all cryptocurrencies
  cron.schedule('30 */2 * * *', async () => {
    console.log('Running scheduled task: Scrape blockchain data (batch 1)');
    // Process cryptocurrencies ranked 1-250
    await scrapeAllBlockchainData(250, 1);
  });

  // Phase 3: Scrape blockchain data - part 2 (second half)
  cron.schedule('30 1-23/2 * * *', async () => {
    console.log('Running scheduled task: Scrape blockchain data (batch 2)');
    // Process cryptocurrencies ranked 251-500
    await scrapeAllBlockchainData(250, 251);
  });

  // Phase 4: Generate AI insights
  // Runs every 4 hours for deeper analysis
  cron.schedule('45 */4 * * *', async () => {
    console.log('Running scheduled task: Generate AI insights');
    // Process up to 50 cryptocurrencies per run for AI analysis
    await generateAiInsights(50);
  });

  // Initial execution to populate data
  console.log('Running initial data population...');
  
  // Immediately get some initial crawler status data
  storage.updateCrawlerStatus({
    webCrawlerActive: true,
    lastUpdate: new Date()
  }).then(() => {
    // Start sequential processing with smaller limits for initial setup
    return searchTopCryptocurrencies(20);
  }).then(() => {
    console.log('Initial cryptocurrency data fetch completed');
    return findExplorersForCryptos(10);
  }).then(() => {
    console.log('Initial blockchain explorer search completed');
    return scrapeAllBlockchainData(10);
  }).then(() => {
    console.log('Initial blockchain data scraping completed');
    return generateAiInsights(5);
  }).then(() => {
    console.log('Initial AI insights generation completed');
    console.log('Initial data population completed successfully');
  }).catch(err => {
    console.error('Error in initial data population:', err);
  });
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
async function scrapeAllBlockchainData(limit?: number, startRank: number = 1): Promise<void> {
  try {
    // Update crawler status
    await storage.updateCrawlerStatus({
      blockchainSyncActive: true
    });

    // Get cryptocurrencies by rank range
    const cryptos = await storage.getCryptocurrencies(
      Math.ceil(startRank / (limit || 50)), // Calculate page based on startRank and limit
      limit || 50, 
      'rank', 
      'asc'
    );
    
    console.log(`Scraping blockchain data for cryptocurrencies ranked ${startRank}-${startRank + (limit || 50) - 1}...`);
    let processedCount = 0;
    
    for (const crypto of cryptos.data) {
      // Skip cryptocurrencies with rank less than startRank (could happen due to paging)
      if (crypto.rank && crypto.rank < startRank) {
        continue;
      }
      
      try {
        // Get explorers for this cryptocurrency
        const explorers = await storage.getBlockchainExplorers(crypto.id);
        
        if (explorers.length > 0) {
          console.log(`Scraping blockchain data for ${crypto.name} (${crypto.symbol}) [Rank ${crypto.rank || 'N/A'}] from ${explorers[0].url}...`);
          
          // Add random delay to avoid being blocked by the explorer
          await new Promise(resolve => setTimeout(resolve, Math.floor(Math.random() * 1000) + 500));
          
          // Scrape data from the first explorer
          const success = await scrapeBlockchainData(explorers[0].url, crypto.id);
          
          if (success) {
            processedCount++;
            console.log(`Successfully scraped data for ${crypto.name}`);
          } else {
            console.log(`Failed to scrape data for ${crypto.name}, generating metrics...`);
            // Generate metrics for failed scrapes
            await scrapeBlockchainData("placeholder", crypto.id);
            processedCount++;
          }
        } else {
          console.log(`No explorer found for ${crypto.name} [Rank ${crypto.rank || 'N/A'}], finding explorer...`);
          
          // First try to find an explorer
          const explorerUrl = await findBlockchainExplorer(crypto.name, crypto.id);
          
          if (explorerUrl) {
            console.log(`Found explorer for ${crypto.name}, scraping data...`);
            const success = await scrapeBlockchainData(explorerUrl, crypto.id);
            if (success) {
              processedCount++;
            } else {
              // Generate metrics as a fallback
              await scrapeBlockchainData("placeholder", crypto.id);
              processedCount++;
            }
          } else {
            console.log(`Could not find explorer for ${crypto.name}, generating metrics...`);
            // For cryptocurrencies without explorers, generate metrics
            await scrapeBlockchainData("placeholder", crypto.id);
            processedCount++;
          }
        }
        
        // Sleep between requests to avoid rate limiting
        // Use a slightly longer delay for higher-ranked cryptocurrencies (likely more requests)
        const delay = crypto.rank && crypto.rank < 100 ? 3000 : 2000;
        await new Promise(resolve => setTimeout(resolve, delay));
      } catch (cryptoError) {
        console.error(`Error processing cryptocurrency ${crypto.name}:`, cryptoError);
        // Continue with next cryptocurrency
      }
    }
    
    // Update crawler status
    await storage.updateCrawlerStatus({
      blockchainSyncActive: false,
      lastUpdate: new Date()
    });
    
    console.log(`Scraped or generated metrics for ${processedCount} cryptocurrencies (rank ${startRank}-${startRank + (limit || 50) - 1})`);
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
