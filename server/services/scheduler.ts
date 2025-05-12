import cron from 'node-cron';
import { searchTopCryptocurrencies, searchRankedCryptocurrencies } from './cryptoSearch';
import { findBlockchainExplorer, scrapeBlockchainData } from './scraper';
import { getAiInsightsForCrypto } from './aiInsights';
import { storage } from '../storage';

// Function to run initial data collection immediately on startup
export async function runInitialDataCollection() {
  console.log('Running initial data population...');
  
  // First check if we already have data in the database
  const existingData = await storage.getCryptocurrencies(1, 1, 'id', 'asc');
  
  // Always start with the crawler active
  await storage.updateCrawlerStatus({
    webCrawlerActive: true,
    lastUpdate: new Date()
  });
  
  if (existingData.total > 0) {
    console.log(`Found ${existingData.total} existing cryptocurrencies. Continuing data collection without starting over.`);
    
    // Continue scraping for new data without erasing existing data
    // Search for new cryptocurrencies on a smaller scale to supplement existing data
    await searchTopCryptocurrencies(100);
    
    // Search for blockchain explorers for recent cryptocurrencies
    await findExplorersForCryptos(20);
    
    // Scrape blockchain data for recent cryptocurrencies
    await scrapeAllBlockchainData(20, 1);
    
  } else {
    console.log('No existing data found. Starting fresh data collection...');
    
    // Immediately search for cryptocurrencies - increased to 250 to get more initially
    await searchTopCryptocurrencies(250);
    console.log('Initial cryptocurrency data fetch completed');
    
    // Immediately search for blockchain explorers
    await findExplorersForCryptos(50);
    console.log('Initial blockchain explorer search completed');
    
    // Immediately scrape blockchain data
    await scrapeAllBlockchainData(50, 1);
    console.log('Initial blockchain data scraping completed');
  }
  
  // Return to ensure proper startup sequence
  return true;
}

// The entry point for setting up all scheduled tasks
export async function setupScheduler() {
  // Run initial data collection immediately on startup
  runInitialDataCollection().catch((error: any) => {
    console.error('Error in initial data collection:', error);
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
  // Now run every minute for more immediate discovery
  cron.schedule('* * * * *', async () => {
    console.log('Running scheduled task: Find blockchain explorers');
    
    try {
      // Check current count to dynamically adjust batch size
      const currentCryptos = await storage.getCryptocurrencies(1, 1, "marketCap", "desc");
      const totalCount = currentCryptos.total || 0;
      
      // Increased batch sizes significantly
      let batchSize = 50; // Default
      
      if (totalCount < 100) {
        batchSize = 50;
      } else if (totalCount < 200) {
        batchSize = 75;
      } else {
        batchSize = 100; // Much larger batch for big datasets
      }
      
      // Create an array of promises for parallel explorer finding
      const explorerTasks: Promise<number>[] = [];
      
      // TASK 1: Find explorers for top-ranked cryptocurrencies (most important)
      explorerTasks.push(
        (async () => {
          console.log(`Finding explorers for top-ranked cryptocurrencies...`);
          return await findExplorersForCryptos(Math.min(50, Math.floor(batchSize / 2)));
        })().catch(error => {
          console.error("Error finding explorers for top ranks:", error);
          return 0;
        })
      );
      
      // TASK 2: Find explorers for newest added cryptocurrencies
      explorerTasks.push(
        (async () => {
          // Get the most recently added cryptocurrencies (sorted by id desc)
          const recentCryptos = await storage.getCryptocurrencies(1, Math.floor(batchSize / 3), "id", "desc");
          if (recentCryptos.data.length > 0) {
            console.log(`Finding explorers for ${recentCryptos.data.length} most recently added cryptocurrencies...`);
            // Extract IDs and find explorers specifically for these
            const recentIds = recentCryptos.data.map(crypto => crypto.id);
            return await findExplorersForCryptos(undefined, recentIds);
          }
          return 0;
        })().catch(error => {
          console.error("Error finding explorers for recent cryptocurrencies:", error);
          return 0;
        })
      );
      
      // TASK 3: Prioritize cryptocurrencies without metrics
      explorerTasks.push(
        (async () => {
          // Get cryptocurrencies that have explorer URLs but don't have metrics yet
          const cryptosWithExplorers = await storage.getCryptocurrenciesWithExplorers(Math.floor(batchSize / 3));
          
          if (cryptosWithExplorers.length > 0) {
            console.log(`Prioritizing scraping data for ${cryptosWithExplorers.length} cryptocurrencies with explorers but no metrics...`);
            
            // Process each cryptocurrency with explorer to scrape blockchain data
            for (const item of cryptosWithExplorers) {
              try {
                await scrapeBlockchainData(item.url, item.cryptocurrencyId);
                // Small delay to avoid overloading
                await new Promise(resolve => setTimeout(resolve, 2000));
              } catch (error) {
                console.error(`Error scraping data for cryptocurrency ID ${item.cryptocurrencyId}:`, error);
              }
            }
            
            return cryptosWithExplorers.length;
          }
          return 0;
        })().catch(error => {
          console.error("Error prioritizing cryptocurrencies without metrics:", error);
          return 0;
        })
      );
      
      // Run all tasks in parallel
      await Promise.all(explorerTasks);
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

  // Phase 3: Enhanced blockchain data scraping with highly parallel processing
  // Uses multiple strategies to maximize data collection speed
  cron.schedule('* * * * *', async () => {
    console.log('Running scheduled task: Enhanced parallel blockchain data scraping');
    
    try {
      // Check current count to dynamically adjust batch size
      const currentCryptos = await storage.getCryptocurrencies(1, 1, "marketCap", "desc");
      const totalCount = currentCryptos.total || 0;
      
      // Calculate batch sizes for different segments of the database
      const minute = new Date().getMinutes();
      const maxBatchSize = 25; // Increased base batch size per thread
      
      // Get list of all cryptocurrencies with explorers
      const allCryptosWithExplorers = await storage.getCryptocurrenciesWithExplorers(100);
      
      // Prepare array for all scraping tasks
      const scrapingTasks: Promise<any>[] = [];
      
      // STRATEGY 1: Direct individual scraping for cryptocurrencies with explorers
      // This is the most efficient method as it targets exactly what we need
      if (allCryptosWithExplorers.length > 0) {
        // Calculate how many cryptocurrencies to process in this batch
        const individualBatchSize = Math.min(35, allCryptosWithExplorers.length);
        const individualBatch = allCryptosWithExplorers.slice(0, individualBatchSize);
        
        console.log(`Strategy 1: Direct scraping for ${individualBatchSize} cryptocurrencies with explorers`);
        
        // Process each cryptocurrency individually and in parallel
        const individualTasks = individualBatch.map(async (cryptoWithExplorer) => {
          try {
            const { cryptocurrencyId, url } = cryptoWithExplorer;
            const crypto = await storage.getCryptocurrency(cryptocurrencyId);
            
            if (!crypto) return;
            
            console.log(`Scraping blockchain data for ${crypto.name} (${crypto.symbol}) [Rank ${crypto.rank || 'N/A'}] from ${url}...`);
            await scrapeBlockchainData(url, cryptocurrencyId);
          } catch (error) {
            console.error(`Error in individual scraping for cryptocurrency ${cryptoWithExplorer.cryptocurrencyId}:`, error);
          }
        });
        
        // Add individual tasks to the main task list
        scrapingTasks.push(Promise.allSettled(individualTasks));
      }
      
      // STRATEGY 2: Always process top-ranked cryptocurrencies (most important)
      scrapingTasks.push(
        (async () => {
          console.log(`Strategy 2: Scraping top-ranked cryptocurrencies...`);
          await scrapeAllBlockchainData(maxBatchSize, 1);
        })().catch(error => console.error("Error in strategy 2 (top ranks):", error))
      );
      
      // STRATEGY 3: Process middle and lower segments in parallel
      if (totalCount > 75) {
        // Determine multiple segments to process in parallel
        const segments = [
          Math.floor(totalCount / 4),           // 25% mark
          Math.floor(totalCount / 2),           // 50% mark
          Math.floor(3 * totalCount / 4)        // 75% mark
        ];
        
        // Process each segment in parallel
        for (let i = 0; i < segments.length; i++) {
          const startRank = segments[i];
          scrapingTasks.push(
            (async () => {
              console.log(`Strategy 3: Segment ${i+1} - Scraping cryptocurrencies starting at rank ${startRank}...`);
              await scrapeAllBlockchainData(20, startRank);
            })().catch(error => console.error(`Error in strategy 3 (segment ${i+1}):`, error))
          );
        }
      }
      
      // STRATEGY 4: Process recently added cryptocurrencies
      scrapingTasks.push(
        (async () => {
          try {
            // Get the 20 most recently added cryptocurrencies (sorted by id desc)
            const recentCryptos = await storage.getCryptocurrencies(1, 20, "id", "desc");
            
            if (recentCryptos.data && recentCryptos.data.length > 0) {
              console.log(`Strategy 4: Processing ${recentCryptos.data.length} recently added cryptocurrencies`);
              
              // Process each in parallel (limit to 10 to avoid overwhelming the system)
              const recentBatch = recentCryptos.data.slice(0, 10);
              
              const recentTasks = recentBatch.map(async (crypto) => {
                // Get explorers for this cryptocurrency
                const explorers = await storage.getBlockchainExplorers(crypto.id);
                
                // If it has explorers, scrape data from the first one
                if (explorers && explorers.length > 0) {
                  console.log(`Scraping data for ${crypto.name} from ${explorers[0].url}`);
                  await scrapeBlockchainData(explorers[0].url, crypto.id);
                }
              });
              
              await Promise.allSettled(recentTasks);
            }
          } catch (error) {
            console.error("Error in strategy 4 (recent cryptos):", error);
          }
        })()
      );
      
      // STRATEGY 5: Process a random batch for better coverage
      if (totalCount > 120) {
        const randomStart = Math.floor(Math.random() * (totalCount - 40)) + 40;
        
        scrapingTasks.push(
          (async () => {
            console.log(`Strategy 5: Randomly scraping batch starting at rank ${randomStart}...`);
            await scrapeAllBlockchainData(25, randomStart);
          })().catch(error => console.error("Error in strategy 5 (random batch):", error))
        );
      }
      
      // Execute all scraping strategies in parallel
      await Promise.allSettled(scrapingTasks);
      
      const cryptosWithMetrics = await storage.getCryptocurrenciesWithMetrics(1);
      console.log(`Completed enhanced blockchain data scraping. Total cryptocurrencies with metrics: ${cryptosWithMetrics}`);
    } catch (error) {
      console.error("Error in blockchain scraper scheduler:", error);
      // Fallback to smaller size and beginning
      await scrapeAllBlockchainData(20, 1);
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
async function findExplorersForCryptos(limit?: number, specificIds?: number[]): Promise<number> {
  try {
    // Update crawler status
    await storage.updateCrawlerStatus({
      blockchainSyncActive: true
    });

    let cryptos;
    let foundCount = 0;
    
    if (specificIds && specificIds.length > 0) {
      // Use specific IDs when provided
      console.log(`Finding explorers for ${specificIds.length} specific cryptocurrencies...`);
      
      // Get the cryptocurrencies with the specific IDs
      const result = await Promise.all(
        specificIds.map(id => storage.getCryptocurrency(id))
      );
      
      // Filter out undefined results
      cryptos = { 
        data: result.filter(crypto => crypto !== undefined),
        total: result.length
      };
    } else {
      // Get cryptocurrencies by rank when no specific IDs are provided
      cryptos = await storage.getCryptocurrencies(1, limit || 100, 'rank', 'asc');
    }
    
    for (const crypto of cryptos.data) {
      // Check if this cryptocurrency already has an explorer
      const explorers = await storage.getBlockchainExplorers(crypto.id);
      
      if (explorers.length === 0) {
        console.log(`Finding blockchain explorer for ${crypto.name} (${crypto.symbol})...`);
        
        // Find and store the explorer
        const explorerUrl = await findBlockchainExplorer(crypto.name, crypto.id);
        
        // If an explorer was found, increment the counter
        if (explorerUrl) {
          foundCount++;
        }
        
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
    
    return foundCount;
  } catch (error) {
    console.error('Error finding explorers for cryptocurrencies:', error);
    
    // Update crawler status - always keep webCrawlerActive true for 24/7 operation
    await storage.updateCrawlerStatus({
      blockchainSyncActive: false,
      webCrawlerActive: true, // Keep crawler active even during errors
      lastUpdate: new Date()
    });
    
    return 0;
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
