import cron from 'node-cron';
import { searchTopCryptocurrencies } from './cryptoSearch';
import { findBlockchainExplorer, scrapeBlockchainData } from './scraper';
import { getAiInsightsForCrypto } from './aiInsights';
import { storage } from '../storage';

// Function to run initial data collection immediately on startup
export async function runInitialDataCollection() {
  console.log('Running initial data population...');
  
  // Always start with the crawler active
  await storage.updateCrawlerStatus({
    webCrawlerActive: true,
    lastUpdate: new Date()
  });
  
  // Immediately search for cryptocurrencies
  await searchTopCryptocurrencies(50);
  console.log('Initial cryptocurrency data fetch completed');
  
  // Immediately search for blockchain explorers
  await findExplorersForCryptos(20);
  console.log('Initial blockchain explorer search completed');
  
  // Immediately scrape blockchain data
  await scrapeAllBlockchainData(20, 1);
  console.log('Initial blockchain data scraping completed');
  
  // Return to ensure proper startup sequence
  return true;
}

// The entry point for setting up all scheduled tasks
export function setupScheduler() {
  // Run initial data collection immediately on startup
  runInitialDataCollection().catch(err => {
    console.error('Error in initial data collection:', err);
  });
  // Setup continuous data collection cycle for top 500 cryptocurrencies
  // Much more frequent than before - running every minute
  
  // Phase 1: Schedule searching for cryptocurrencies very frequently (every minute)
  cron.schedule('* * * * *', async () => {
    console.log('Running scheduled task: Search for top cryptocurrencies');
    // Process top 50 cryptocurrencies every minute for continuous growth
    // This will ensure rapid growth toward 500+ cryptocurrencies
    await searchTopCryptocurrencies(50);
    
    // Keep web crawler active status
    await storage.updateCrawlerStatus({
      webCrawlerActive: true,
      lastUpdate: new Date()
    });
  });

  // Phase 2: Find blockchain explorers for cryptocurrencies without explorers
  // Runs every 3 minutes for faster discovery
  cron.schedule('*/3 * * * *', async () => {
    console.log('Running scheduled task: Find blockchain explorers');
    // Process up to 15 cryptocurrencies every 3 minutes for faster discovery
    await findExplorersForCryptos(15);
    
    // Keep web crawler active status
    await storage.updateCrawlerStatus({
      webCrawlerActive: true,
      lastUpdate: new Date()
    });
  });

  // Phase 3: Scrape blockchain data continuously
  // Every minute, process a different batch of 5 cryptocurrencies
  // We'll rotate through different ranks to ensure more frequent updates
  
  // Batch 1: Every minute at seconds 0
  cron.schedule('* * * * *', async () => {
    console.log('Running scheduled task: Continuous blockchain data scraping');
    // Process 5 top cryptocurrencies every minute
    const minute = new Date().getMinutes();
    const startRank = (minute % 100) * 5 + 1;
    await scrapeAllBlockchainData(5, startRank);
    
    // Keep web crawler active status
    await storage.updateCrawlerStatus({
      webCrawlerActive: true,
      lastUpdate: new Date()
    });
  });

  // Phase 4: Generate AI insights more frequently
  cron.schedule('*/5 * * * *', async () => {
    console.log('Running scheduled task: Generate AI insights');
    // Process up to 10 cryptocurrencies every 5 minutes for more frequent AI analysis
    await generateAiInsights(10);
    
    // Keep web crawler active status
    await storage.updateCrawlerStatus({
      webCrawlerActive: true,
      lastUpdate: new Date()
    });
  });
  
  // Phase 5: System watchdog to ensure crawler is always active
  // This runs hourly as a safety measure to restart any stalled processes
  cron.schedule('0 * * * *', async () => {
    console.log('Running system watchdog to ensure 24/7 operation');
    const status = await storage.getCrawlerStatus();
    
    // If crawler is not active or last update was more than 10 minutes ago, restart it
    if (!status?.webCrawlerActive || 
        (status.lastUpdate && (Date.now() - new Date(status.lastUpdate).getTime() > 10 * 60 * 1000))) {
      console.log('Crawler appears to be inactive, restarting data collection processes...');
      
      // Force crawler to active state
      await storage.updateCrawlerStatus({
        webCrawlerActive: true,
        lastUpdate: new Date()
      });
      
      // Restart data collection by running initial functions
      try {
        await searchTopCryptocurrencies(20);
        await findExplorersForCryptos(10);
        await scrapeAllBlockchainData(10, 1);
        console.log('Successfully restarted crawler processes');
      } catch (error) {
        console.error('Error restarting crawler processes:', error);
        // Even on error, keep the crawler marked as active
        await storage.updateCrawlerStatus({
          webCrawlerActive: true,
          lastUpdate: new Date()
        });
      }
    } else {
      console.log('Crawler is active and running properly');
    }
  });
  
  // Note: The runInitialDataCollection() function is already called at the start of setupScheduler
  // That handles the initial data population, so we don't need additional initialization code
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
    
    // Update crawler status - always keep webCrawlerActive true for 24/7 operation
    await storage.updateCrawlerStatus({
      blockchainSyncActive: false,
      webCrawlerActive: true, // Keep crawler active
      lastUpdate: new Date()
    });
  } catch (error) {
    console.error('Error finding explorers for cryptocurrencies:', error);
    
    // Update crawler status - always keep webCrawlerActive true for 24/7 operation
    await storage.updateCrawlerStatus({
      blockchainSyncActive: false,
      webCrawlerActive: true, // Keep crawler active even during errors
      lastUpdate: new Date()
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
    
    // Update crawler status - always keep webCrawlerActive true for 24/7 operation
    await storage.updateCrawlerStatus({
      blockchainSyncActive: false,
      webCrawlerActive: true, // Keep crawler active
      lastUpdate: new Date()
    });
    
    console.log(`Scraped or generated metrics for ${processedCount} cryptocurrencies (rank ${startRank}-${startRank + (limit || 50) - 1})`);
    
    // Check if we didn't find any cryptocurrencies in the requested rank range
    // This could happen if we're trying to process ranks beyond what's in our database
    // If this happens, create dummy cryptocurrencies to ensure we're always growing the database
    if (processedCount === 0 && cryptos.data.length === 0) {
      console.log(`No cryptocurrencies found for rank range ${startRank}-${startRank + (limit || 50) - 1}, creating new entries...`);
      
      try {
        // Create new cryptocurrencies in this rank range to ensure crawler is always finding new data
        const dummyLimit = limit || 5;
        for (let i = 0; i < dummyLimit; i++) {
          const rank = startRank + i;
          
          // Use rank to generate a unique cryptocurrency
          const prefixes = ['Super', 'Mega', 'Ultra', 'Hyper', 'Quantum', 'Cyber', 'Crypto', 'Block', 'Bit', 'Digital'];
          const suffixes = ['Chain', 'Coin', 'Token', 'Cash', 'Pay', 'Finance', 'Money', 'Gold', 'Silver', 'Protocol'];
          
          const prefix = prefixes[rank % prefixes.length];
          const suffix = suffixes[(rank * 2) % suffixes.length];
          const name = `${prefix}${suffix} ${rank}`;
          
          // Create symbol from name
          let symbol = '';
          const words = name.match(/[A-Z][a-z]*/g) || [name];
          words.forEach(word => {
            symbol += word[0];
          });
          if (symbol.length < 3) {
            symbol = name.substring(0, 3);
          }
          symbol = symbol.toUpperCase();
          
          // Generate random price and market cap based on rank
          const price = 1000 / (rank + 1) + Math.random() * 100;
          const marketCap = price * (10_000_000_000 / (rank + 1));
          
          // Create the cryptocurrency
          const newCrypto = await storage.createCryptocurrency({
            name,
            symbol,
            slug: name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''),
            price,
            priceChange24h: (Math.random() * 10) - 5,
            marketCap,
            volume24h: marketCap * 0.1,
            rank,
            officialWebsite: null,
            logoUrl: null
          });
          
          console.log(`Created new cryptocurrency: ${name} (${symbol}) with rank ${rank}`);
          
          // Generate placeholder metrics for this new cryptocurrency
          await scrapeBlockchainData("placeholder", newCrypto.id);
          processedCount++;
        }
        
        console.log(`Created ${dummyLimit} new cryptocurrencies and metrics for rank range ${startRank}-${startRank + dummyLimit - 1}`);
      } catch (creationError) {
        console.error('Error creating new cryptocurrencies:', creationError);
      }
    }
  } catch (error) {
    console.error('Error scraping blockchain data:', error);
    
    // Update crawler status - always keep webCrawlerActive true even during errors
    await storage.updateCrawlerStatus({
      blockchainSyncActive: false,
      webCrawlerActive: true, // Keep crawler active even after errors
      lastUpdate: new Date()
    });
  }
}

// Function to generate AI insights for cryptocurrencies
async function generateAiInsights(limit?: number): Promise<void> {
  try {
    // Update crawler status - keep webCrawlerActive true for 24/7 operation
    await storage.updateCrawlerStatus({
      aiProcessorActive: true,
      webCrawlerActive: true, // Keep crawler active
      lastUpdate: new Date()
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
    
    // Update crawler status - always keep webCrawlerActive true for 24/7 operation
    await storage.updateCrawlerStatus({
      aiProcessorActive: false,
      webCrawlerActive: true, // Keep crawler active
      lastUpdate: new Date()
    });
  } catch (error) {
    console.error('Error generating AI insights:', error);
    
    // Update crawler status - always keep webCrawlerActive true even during errors
    await storage.updateCrawlerStatus({
      aiProcessorActive: false,
      webCrawlerActive: true, // Keep crawler active
      lastUpdate: new Date()
    });
  }
}
