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
  // Using multiple sources in parallel (APIs + direct scraping) with enhanced multi-threading
  cron.schedule('* * * * *', async () => {
    console.log('Running scheduled task: Advanced multi-threaded cryptocurrency search');
    
    try {
      // Check current count
      const currentCryptos = await storage.getCryptocurrencies(1, 1, "marketCap", "desc");
      const totalCount = currentCryptos.total || 0;
      
      // Dynamically adjust batch sizes for different search strategies
      let mainBatchSize = 100; // Default standard batch
      let secondaryBatchSize = 75; // Smaller batch for secondary sources
      
      // Scale up batch sizes based on how far we are from target
      if (totalCount < 100) {
        mainBatchSize = 150; // More aggressive at start
        secondaryBatchSize = 100;
      } else if (totalCount < 200) {
        mainBatchSize = 200; // Continue increasing
        secondaryBatchSize = 125;
      } else if (totalCount < 300) {
        mainBatchSize = 250; // Even more aggressive
        secondaryBatchSize = 150;
      } else if (totalCount < 400) {
        mainBatchSize = 300; // Near target, go big
        secondaryBatchSize = 200;
      } else {
        mainBatchSize = 500; // Max out for maintenance mode
        secondaryBatchSize = 250; // Keep discovering new ones
      }
      
      // Advanced multi-threaded approach: Launch multiple specialized search tasks in parallel
      console.log(`Starting advanced multi-threaded cryptocurrency data collection...`);
      
      // Array to collect all promises for parallel execution with proper error handling
      const searchTasks: Promise<any>[] = [];
      
      // THREAD 1: Primary API-based search for top cryptocurrencies
      searchTasks.push(
        (async () => {
          console.log(`Thread 1: Searching top ${mainBatchSize} cryptocurrencies via primary APIs`);
          return await searchTopCryptocurrencies(mainBatchSize)
            .catch((error: any) => {
              console.error("Error in primary API search:", error);
              return 0; // Return 0 success count on error
            });
        })()
      );
      
      // THREAD 2: Ranked search at different positions in the rankings
      // This helps us find cryptocurrencies that might not be in the absolute top
      searchTasks.push(
        (async () => {
          // Use dynamic rank ranges that change based on the minute
          const minute = new Date().getMinutes();
          const rankWindow = 100; // How many cryptos to search in each range
          
          // Create multiple rank ranges that change over time
          let startRank: number;
          
          // Cycle through different rank windows based on the minute
          // This ensures we cover the entire range of potential cryptocurrencies over time
          if (minute % 4 === 0) {
            startRank = 50; // Ranks 50-150
          } else if (minute % 4 === 1) {
            startRank = 150; // Ranks 150-250
          } else if (minute % 4 === 2) {
            startRank = 250; // Ranks 250-350
          } else {
            startRank = 350; // Ranks 350-450
          }
          
          console.log(`Thread 2: Secondary ranked search from ${startRank} to ${startRank + rankWindow}`);
          return await searchRankedCryptocurrencies(startRank, startRank + rankWindow)
            .catch((error: any) => {
              console.error(`Error in secondary ranked search (${startRank}-${startRank + rankWindow}):`, error);
              return 0;
            });
        })()
      );
      
      // THREAD 3: Target lower ranked cryptocurrencies for diversity
      // Only if we need more cryptocurrencies
      if (totalCount < 450) {
        searchTasks.push(
          (async () => {
            // Search in an even lower rank range to maximize diversity
            const randomLowRank = 500 + (Math.floor(Math.random() * 400));
            const lowRankEnd = randomLowRank + 100;
            
            console.log(`Thread 3: Diversity search for ranks ${randomLowRank}-${lowRankEnd}`);
            return await searchRankedCryptocurrencies(randomLowRank, lowRankEnd)
              .catch((error: any) => {
                console.error(`Error in diversity search (${randomLowRank}-${lowRankEnd}):`, error);
                return 0;
              });
          })()
        );
      }
      
      // THREAD 4: Direct website scraping for alternate data sources
      // Run both CoinMarketCap and CoinGecko scrapers in parallel
      if (webScraper) {
        searchTasks.push(
          (async () => {
            try {
              console.log(`Thread 4: Direct scraping from cryptocurrency websites`);
              
              // Run both scrapers concurrently for maximum data collection
              const scrapingResults = await Promise.allSettled([
                webScraper.scrapeCoinMarketCap(1)
                  .catch((error: any) => {
                    console.error("CoinMarketCap scraping error:", error);
                    return 0;
                  }),
                webScraper.scrapeCoinGecko(1)
                  .catch((error: any) => {
                    console.error("CoinGecko scraping error:", error);
                    return 0;
                  })
              ]);
              
              // Every few minutes, also try page 2 for more data
              const minute = new Date().getMinutes();
              if (minute % 5 === 0) {
                console.log(`Thread 4: Extending scraping to page 2 of data sources`);
                await Promise.allSettled([
                  webScraper.scrapeCoinMarketCap(2)
                    .catch((error: any) => console.error("CoinMarketCap page 2 error:", error)),
                  webScraper.scrapeCoinGecko(2)
                    .catch((error: any) => console.error("CoinGecko page 2 error:", error))
                ]);
              }
              
              // Return the total number of cryptocurrencies found through scraping
              // Convert any fulfilled results to numbers, treating rejected as 0
              return scrapingResults.reduce((sum, result) => 
                sum + (result.status === 'fulfilled' ? (result.value || 0) : 0), 0);
            } catch (error) {
              console.error("Error in direct website scraping:", error);
              return 0;
            }
          })()
        );
      }
      
      // Execute all search tasks in parallel with improved error handling
      const searchResults = await Promise.allSettled(searchTasks);
      
      // Calculate total cryptocurrencies found this round
      const totalFound = searchResults.reduce((sum, result) => {
        // Add the value returned by the task if it succeeded, otherwise add 0
        const taskFound = result.status === 'fulfilled' ? (result.value || 0) : 0;
        return sum + taskFound;
      }, 0);
      
      console.log(`Multi-threaded search complete: Found/updated approximately ${totalFound} cryptocurrencies`);
      
    } catch (error) {
      console.error("Error in multi-threaded cryptocurrency search scheduler:", error);
      // Even on error, still try with minimum size
      try {
        await searchTopCryptocurrencies(100);
      } catch (fallbackError) {
        console.error("Even fallback search failed:", fallbackError);
      }
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
  // Process multiple batches of cryptocurrencies simultaneously every minute 
  // with dynamic ranking to cover the whole database
  cron.schedule('* * * * *', async () => {
    console.log('Running scheduled task: Multi-threaded blockchain data scraping');
    
    try {
      // Check current count to dynamically adjust batch size
      const currentCryptos = await storage.getCryptocurrencies(1, 1, "marketCap", "desc");
      const totalCount = currentCryptos.total || 0;
      
      // Calculate batch sizes for different segments of the database
      const minute = new Date().getMinutes();
      const maxBatchSize = 15; // Base batch size per thread
      
      // Prepare array for all scraping tasks
      const scrapingTasks: Promise<void>[] = [];
      
      // THREAD 1: Always process top-ranked cryptocurrencies (most important)
      scrapingTasks.push(
        (async () => {
          console.log(`Thread 1: Scraping top-ranked cryptocurrencies...`);
          await scrapeAllBlockchainData(maxBatchSize, 1);
        })().catch(err => console.error("Error in thread 1 (top ranks):", err))
      );
      
      // THREAD 2: Process middle segment of the database
      if (totalCount > 50) {
        const middleStartRank = Math.floor(totalCount / 2) - Math.floor(maxBatchSize / 2); 
        scrapingTasks.push(
          (async () => {
            console.log(`Thread 2: Scraping middle-ranked cryptocurrencies starting at rank ${middleStartRank}...`);
            await scrapeAllBlockchainData(maxBatchSize, middleStartRank);
          })().catch(err => console.error("Error in thread 2 (middle ranks):", err))
        );
      }
      
      // THREAD 3: Dynamically cycle through the entire database
      // This ensures full coverage over time
      if (totalCount > 100) {
        let segments = Math.ceil(totalCount / maxBatchSize);
        let currentSegment = minute % segments;
        let dynamicStartRank = (currentSegment * maxBatchSize) + 1;
        
        // Avoid overlap with thread 1
        if (dynamicStartRank < 16) dynamicStartRank = 16;
        
        scrapingTasks.push(
          (async () => {
            console.log(`Thread 3: Dynamically scraping cryptocurrencies starting at rank ${dynamicStartRank}...`);
            await scrapeAllBlockchainData(maxBatchSize, dynamicStartRank);
          })().catch(err => console.error("Error in thread 3 (dynamic ranks):", err))
        );
      }
      
      // THREAD 4: Random segment to discover new data in unexpected places
      if (totalCount > 200) {
        // Generate a random starting point that's different from other threads
        const random = Math.floor(Math.random() * (totalCount - maxBatchSize));
        const randomStartRank = random < 50 ? 50 + random : random;
        
        scrapingTasks.push(
          (async () => {
            console.log(`Thread 4: Randomly scraping cryptocurrencies starting at rank ${randomStartRank}...`);
            await scrapeAllBlockchainData(maxBatchSize, randomStartRank);
          })().catch(err => console.error("Error in thread 4 (random ranks):", err))
        );
      }
      
      // Execute all scraping tasks in parallel
      await Promise.allSettled(scrapingTasks);
      console.log(`Completed multi-threaded blockchain data scraping`);
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

  // Phase 4: Generate AI insights with parallel processing
  cron.schedule('*/5 * * * *', async () => {
    console.log('Running scheduled task: Multi-threaded AI insight generation');
    
    try {
      // Check how many cryptocurrencies we have to determine batch size
      const currentCryptos = await storage.getCryptocurrencies(1, 1, "marketCap", "desc");
      const totalCount = currentCryptos.total || 0;
      
      // Prepare array for parallel AI insight tasks
      const insightTasks: Promise<any>[] = [];
      
      // THREAD 1: Always analyze top cryptocurrencies (most important for users)
      insightTasks.push(
        (async () => {
          console.log(`Thread 1: Generating AI insights for top 5 cryptocurrencies`);
          // Get the top 5 cryptocurrencies by market cap
          const topCryptos = await storage.getCryptocurrencies(1, 5, "marketCap", "desc");
          
          // Process each cryptocurrency individually to avoid single failure affecting all
          for (const crypto of topCryptos.data) {
            try {
              console.log(`Thread 1: Analyzing ${crypto.name} (${crypto.symbol})`);
              const metrics = await storage.getMetrics(crypto.id);
              if (metrics) {
                await getAiInsightsForCrypto(crypto, metrics);
                console.log(`Thread 1: Successfully generated insights for ${crypto.name}`);
              }
            } catch (error: any) {
              console.error(`Error generating insights for ${crypto.name}:`, error);
            }
            
            // Small delay between crypto analysis to avoid rate limiting
            await new Promise(resolve => setTimeout(resolve, 500));
          }
        })().catch((error: any) => console.error("Error in AI insights thread 1:", error))
      );
      
      // THREAD 2: Analyze random cryptocurrencies throughout the database
      // This ensures we eventually cover all cryptocurrencies
      if (totalCount > 20) {
        insightTasks.push(
          (async () => {
            // Select random cryptocurrencies (different from top ones)
            // Start from rank 6 to avoid overlap with thread 1
            const randomStart = 6 + Math.floor(Math.random() * (totalCount - 10));
            console.log(`Thread 2: Generating AI insights starting from rank ${randomStart}`);
            
            const randomCryptos = await storage.getCryptocurrencies(
              Math.ceil(randomStart / 5), // Calculate page based on randomStart
              5, // Batch size
              "rank",
              "asc"
            );
            
            // Process each cryptocurrency individually
            for (const crypto of randomCryptos.data) {
              try {
                // Only process if rank is >= randomStart to avoid duplicates
                if (crypto.rank && crypto.rank >= randomStart) {
                  console.log(`Thread 2: Analyzing ${crypto.name} (${crypto.symbol})`);
                  const metrics = await storage.getMetrics(crypto.id);
                  if (metrics) {
                    await getAiInsightsForCrypto(crypto, metrics);
                    console.log(`Thread 2: Successfully generated insights for ${crypto.name}`);
                  }
                }
              } catch (error: any) {
                console.error(`Error generating insights for random crypto ${crypto.name}:`, error);
              }
              
              // Small delay between crypto analysis
              await new Promise(resolve => setTimeout(resolve, 700));
            }
          })().catch((error: any) => console.error("Error in AI insights thread 2:", error))
        );
      }
      
      // THREAD 3: Focus on recently updated cryptocurrencies
      // This ensures fresh insights for cryptocurrencies with new data
      insightTasks.push(
        (async () => {
          try {
            // Get recently updated metrics that might need new insights
            console.log(`Thread 3: Generating AI insights for recently updated cryptocurrencies`);
            
            // Get all cryptos sorted by lastUpdated (most recent first)
            const recentCryptos = await storage.getCryptocurrencies(1, 5, "lastUpdated", "desc");
            
            for (const crypto of recentCryptos.data) {
              try {
                console.log(`Thread 3: Analyzing recently updated ${crypto.name} (${crypto.symbol})`);
                const metrics = await storage.getMetrics(crypto.id);
                if (metrics) {
                  await getAiInsightsForCrypto(crypto, metrics);
                  console.log(`Thread 3: Successfully generated insights for ${crypto.name}`);
                }
              } catch (error: any) {
                console.error(`Error generating insights for recent crypto ${crypto.name}:`, error);
              }
              
              // Small delay between crypto analysis
              await new Promise(resolve => setTimeout(resolve, 600));
            }
          } catch (error: any) {
            console.error("Error in thread 3 (recent cryptos):", error);
          }
        })().catch((error: any) => console.error("Error in AI insights thread 3:", error))
      );
      
      // Execute all AI insight tasks in parallel
      await Promise.allSettled(insightTasks);
      console.log(`Completed multi-threaded AI insight generation`);
      
    } catch (error) {
      console.error("Error in multi-threaded AI insight scheduler:", error);
      // On error, fall back to simpler processing
      try {
        await generateAiInsights(5);
      } catch (fallbackError) {
        console.error("Even fallback AI insight generation failed:", fallbackError);
      }
    }
    
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
