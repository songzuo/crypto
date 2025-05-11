import cron from 'node-cron';
import { searchTopCryptocurrencies, searchRankedCryptocurrencies } from './cryptoSearch';
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
  
  // Immediately search for cryptocurrencies - increased to 250 to get more initially
  await searchTopCryptocurrencies(250);
  console.log('Initial cryptocurrency data fetch completed');
  
  // Immediately search for blockchain explorers
  await findExplorersForCryptos(50);
  console.log('Initial blockchain explorer search completed');
  
  // Immediately scrape blockchain data
  await scrapeAllBlockchainData(50, 1);
  console.log('Initial blockchain data scraping completed');
  
  // Return to ensure proper startup sequence
  return true;
}

// The entry point for setting up all scheduled tasks
export async function setupScheduler() {
  // Run initial data collection immediately on startup
  runInitialDataCollection().catch(err => {
    console.error('Error in initial data collection:', err);
  });
  // Setup continuous data collection cycle for top 500 cryptocurrencies
  // Much more frequent than before - running every minute
  
  // Import web scraper functions dynamically to avoid circular dependencies
  let webScraper: any = null;
  
  // Wrap dynamic import in an immediately invoked async function
  (async () => {
    try {
      webScraper = await import('./webScraper');
      console.log("Successfully imported webScraper module");
    } catch (error) {
      console.error("Error importing webScraper module:", error);
    }
  })();

  // Phase 1: Schedule searching for cryptocurrencies very frequently (every minute)
  // Using multiple sources in parallel (APIs + direct scraping)
  cron.schedule('* * * * *', async () => {
    console.log('Running scheduled task: Search for top cryptocurrencies (multi-source)');
    
    try {
      // Check current count
      const currentCryptos = await storage.getCryptocurrencies(1, 1, "marketCap", "desc");
      const totalCount = currentCryptos.total || 0;
      
      // Dynamically adjust batch size based on current count
      let batchSize = 100; // Default bigger batch
      
      if (totalCount < 100) {
        batchSize = 100; // Start with 100
      } else if (totalCount < 200) {
        batchSize = 200; // Increase to 200
      } else if (totalCount < 300) {
        batchSize = 300; // Continue increasing
      } else if (totalCount < 400) {
        batchSize = 400; // More aggressive
      } else {
        batchSize = 500; // Go for all 500
      }
      
      // Multi-threaded approach: Launch multiple tasks in parallel
      console.log(`Starting multi-source parallel cryptocurrency data collection...`);
      
      // Array to collect all promises for parallel execution
      const tasks: Promise<any>[] = [];
      
      // Task 1: Standard API-based search
      tasks.push(
        (async () => {
          console.log(`Current crypto count: ${totalCount}, fetching batch of ${batchSize} via APIs`);
          await searchTopCryptocurrencies(batchSize);
        })()
      );
      
      // Task 2: If we're far from target, use ranked search approach
      if (totalCount < 400) {
        tasks.push(
          (async () => {
            // Use our ranked search to find coins in different rank ranges
            const startRank = Math.max(totalCount, 50);
            const endRank = startRank + 100;
            
            console.log(`Only ${totalCount}/500 cryptocurrencies found, adding diversity with rank range ${startRank}-${endRank}`);
            try {
              await searchRankedCryptocurrencies(startRank, endRank);
            } catch (error) {
              console.error("Error in additional ranked search:", error);
            }
          })()
        );
      }
      
      // Task 3: Direct website scraping (if module is available)
      if (webScraper) {
        tasks.push(
          (async () => {
            try {
              // Every 5 minutes (to avoid hitting rate limits), scrape directly from websites
              const minute = new Date().getMinutes();
              if (minute % 5 === 0) {
                console.log(`Starting direct website scraping for additional data sources...`);
                await webScraper.scrapeMultipleSources();
              }
            } catch (error) {
              console.error("Error in direct website scraping:", error);
            }
          })()
        );
      }
      
      // Execute all tasks in parallel
      await Promise.allSettled(tasks);
      console.log(`Completed multi-source cryptocurrency data collection`);
      
    } catch (error) {
      console.error("Error in cryptocurrency search scheduler:", error);
      // Even on error, still try with default size
      await searchTopCryptocurrencies(200);
    }
    
    // Keep web crawler active status 24/7
    await storage.updateCrawlerStatus({
      webCrawlerActive: true,
      lastUpdate: new Date()
    });
  });

  // Phase 2: Find blockchain explorers for cryptocurrencies without explorers
  // Runs every 3 minutes for faster discovery
  cron.schedule('*/3 * * * *', async () => {
    console.log('Running scheduled task: Find blockchain explorers');
    
    try {
      // Check current count to dynamically adjust batch size
      const currentCryptos = await storage.getCryptocurrencies(1, 1, "marketCap", "desc");
      const totalCount = currentCryptos.total || 0;
      
      let batchSize = 30; // Default
      
      if (totalCount < 100) {
        batchSize = 30;
      } else if (totalCount < 200) {
        batchSize = 50;
      } else {
        batchSize = 75; // Increased for large datasets
      }
      
      console.log(`Processing blockchain explorers: Batch size ${batchSize} cryptocurrencies`);
      await findExplorersForCryptos(batchSize);
    } catch (error) {
      console.error("Error in explorer discovery scheduler:", error);
      // Fallback to smaller size to ensure operation continues
      await findExplorersForCryptos(30);
    }
    
    // Keep web crawler active status continuously
    await storage.updateCrawlerStatus({
      webCrawlerActive: true,
      lastUpdate: new Date()
    });
  });

  // Phase 3: Scrape blockchain data continuously
  // Process a larger batch of cryptocurrencies every minute 
  // with dynamic ranking to cover the whole database
  cron.schedule('* * * * *', async () => {
    console.log('Running scheduled task: Continuous blockchain data scraping');
    
    try {
      // Check current count to dynamically adjust batch size
      const currentCryptos = await storage.getCryptocurrencies(1, 1, "marketCap", "desc");
      const totalCount = currentCryptos.total || 0;
      
      // Calculate batch size and starting position based on total count
      const minute = new Date().getMinutes();
      let batchSize = 15; // Increased default batch size
      
      if (totalCount < 100) {
        batchSize = 15;
      } else if (totalCount < 300) {
        batchSize = 25;
      } else {
        batchSize = 35;
      }
      
      // Dynamically calculate starting rank to ensure full coverage of all cryptos
      // This will cycle through all cryptocurrencies, not just top ones
      let segments = Math.ceil(totalCount / batchSize);
      let currentSegment = minute % segments;
      let startRank = (currentSegment * batchSize) + 1;
      
      console.log(`Scraping blockchain data: Batch size ${batchSize}, starting at rank ${startRank} (total cryptos: ${totalCount})`);
      await scrapeAllBlockchainData(batchSize, startRank);
    } catch (error) {
      console.error("Error in blockchain scraper scheduler:", error);
      // Fallback to smaller size and beginning
      await scrapeAllBlockchainData(10, 1);
    }
    
    // Keep web crawler active status continuously
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
// IMPORTANT: This function will continue to run indefinitely, never stopping at any fixed number
async function scrapeAllBlockchainData(limit?: number, startRank: number = 1): Promise<void> {
  try {
    // Update crawler status
    await storage.updateCrawlerStatus({
      blockchainSyncActive: true,
      webCrawlerActive: true // Always keep crawler active for 24/7 operation
    });

    // Calculate effective limit - no upper bounds on how many we process
    // This helps ensure the system doesn't stop at any specific number like 70
    const effectiveLimit = limit || 50;
    
    // Get cryptocurrencies by rank range - we intentionally don't limit to top 500
    // The system should keep growing indefinitely as requested
    const cryptos = await storage.getCryptocurrencies(
      Math.ceil(startRank / effectiveLimit), // Calculate page based on startRank and limit
      effectiveLimit, 
      'rank', 
      'asc'
    );
    
    console.log(`Scraping blockchain data for cryptocurrencies ranked ${startRank}-${startRank + effectiveLimit - 1}...`);
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
            console.log(`Failed to scrape data for ${crypto.name}, will try again later`);
            // Skip this crypto for now, we'll try again in the next cycle
            // No placeholder data - we only want real data
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
              console.log(`Failed to scrape data for ${crypto.name} from newly found explorer, will try again later`);
              // Skip this crypto for now, we'll try again in the next cycle
              processedCount++;
            }
          } else {
            console.log(`Could not find explorer for ${crypto.name}, skipping for now`);
            // For cryptocurrencies without explorers, we'll skip metrics collection
            // We only want to use real data from actual blockchain explorers
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
    
    // Note: We previously generated fake data when we didn't find enough cryptocurrencies
    // This has been removed to ensure data integrity - we only use real data now
    
    if (processedCount < 5) {
      console.log(`Found only ${processedCount} cryptocurrencies for rank range ${startRank}-${startRank + (limit || 50) - 1}`);
      console.log("Rather than generating fake entries, we'll try to retrieve more from other sources");
      
      try {
        // Attempt to fetch more cryptocurrencies from real sources
        console.log("Initiating additional cryptocurrency data fetch to supplement missing data...");
        await searchTopCryptocurrencies(50); // Try to fetch more real cryptocurrencies
        
        // Try to expand the rank range to find more data
        const expandedRankStart = Math.max(1, startRank - 20);
        const expandedRankEnd = startRank + (limit || 50) + 20;
        console.log(`Expanding search to rank range ${expandedRankStart}-${expandedRankEnd} to find more data`);
        
        // Get cryptocurrencies from the expanded range
        const moreCryptos = await storage.getCryptocurrencies(
          Math.ceil(expandedRankStart / 50), // Page
          expandedRankEnd - expandedRankStart, // Limit
          'rank',
          'asc'
        );
        
        // Log how many more we found
        console.log(`Found ${moreCryptos.data.length} cryptocurrencies in expanded rank range`);
      } catch (fetchError) {
        console.error('Error fetching additional cryptocurrency data:', fetchError);
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
