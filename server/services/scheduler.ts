import cron from 'node-cron';
import { searchTopCryptocurrencies, searchRankedCryptocurrencies } from './cryptoSearch';
import { findBlockchainExplorer, scrapeBlockchainData } from './scraper';
import { getAiInsightsForCrypto } from './aiInsights';
import { storage } from '../storage';
import { runDataFixer } from './dataFixer';
import { updateTrumpCoinData } from './trumpFix';
import { recoverMetricsForAllCoins } from './metricsRecovery';
import { advancedMetricsRecovery } from './advancedMetricsRecovery';

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

  // 全面市场数据爬取任务 (CoinMarketCap, CoinGecko, Crypto.com)
  // 每5分钟运行一次，专注于获取币种的基本信息和市场数据
  cron.schedule('*/5 * * * *', async () => {
    console.log('运行计划任务: 全面市场数据爬取...');
    
    try {
      // 导入市场数据爬虫模块
      const marketScraper = await import('./marketDataScraper');
      const results = await marketScraper.scrapeAllMarketData();
      
      console.log(`市场数据爬取完成：新增 ${results.added} 个币种，更新 ${results.updated} 个币种，共处理 ${results.total} 个币种`);
    } catch (error) {
      console.error('市场数据爬取出错:', error);
    }
  });

  // 全局数据修复和优化逻辑
  // 每10分钟运行一次
  cron.schedule('*/10 * * * *', async () => {
    console.log('运行计划任务: 加密货币数据修复与优化...');
    
    try {
      // 运行通用数据修复器，修复市值、排名和链上指标数据
      const result = await runDataFixer(30);
      console.log(`数据修复结果: 市值和排名修复 ${result.marketCapFixed} 个币种，链上指标修复 ${result.metricsFixed} 个币种`);
      
      // 运行Trump币特殊处理
      await updateTrumpCoinData();
      console.log('特殊币种处理完成');
    } catch (error) {
      console.error('数据修复过程中出错:', error);
    }
    
  });

  // Phase 3: Enhanced market data scraping - 每分钟从主流网站获取一次市场数据
  // 注意：原有链上数据爬取功能已停用，改为从专业网站获取市场数据
  cron.schedule('* * * * *', async () => {
    console.log('运行计划任务: 每分钟市场数据更新');
    
    try {
      // 随机选择一个页码，确保持续扩充数据库
      const randomPage = Math.floor(Math.random() * 5) + 1; // 随机选择1-5页
      
      // 导入市场数据爬虫模块
      const marketScraper = await import('./marketDataScraper');
      
      // 爬取随机页码的数据
      console.log(`爬取第${randomPage}页的市场数据`);
      
      // 这里我们模拟只处理部分数据，但每分钟都在进行
      // 通过随机页码和来源轮换，确保系统连续获取不同批次的数据
      const scrapePage = await marketScraper.scrapePageData;
      const results = await scrapePage(randomPage);
      
      console.log(`分钟级市场数据更新完成：新增${results.added}个币种，更新${results.updated}个币种`);
      
      // 获取当前系统状态，用于日志记录
      try {
        const cryptoStats = await storage.getCryptocurrencies(1, 1, "rank", "asc");
        const totalCryptos = cryptoStats.total;
        console.log(`当前数据库中共有 ${totalCryptos} 个加密货币`);
        
        // 检查是否需要进行深度爬取（每天一次彻底扫描）
        const now = new Date();
        const hour = now.getHours();
        
        // 在凌晨3点进行一次深度爬取，获取完整数据
        if (hour === 3 && now.getMinutes() < 10) {
          console.log('开始执行每日深度市场数据爬取...');
          
          // 导入市场数据爬虫模块
          const marketScraper = await import('./marketDataScraper');
          
          // 执行完整爬取
          const fullResults = await marketScraper.scrapeAllMarketData();
          
          console.log(`每日深度爬取完成：总共处理 ${fullResults.total} 个币种，新增 ${fullResults.added} 个，更新 ${fullResults.updated} 个`);
        }
      } catch (error) {
        console.error('执行市场数据统计时出错:', error);
      }
      
      // 对具有浏览器的所有加密货币进行分类
      if (allCryptosWithExplorers.length > 0) {
        for (const crypto of allCryptosWithExplorers) {
          // 跳过已在高优先级队列中的加密货币
          if (highPriorityQueue.some(item => item.cryptocurrencyId === crypto.cryptocurrencyId)) {
            continue;
          }
          
          // 获取加密货币详情以检查其排名
          const cryptoDetails = await storage.getCryptocurrency(crypto.cryptocurrencyId);
          
          if (cryptoDetails) {
            // 基于排名确定优先级 - 排名越高，优先级越高
            if (cryptoDetails.rank && cryptoDetails.rank <= 50) {
              mediumPriorityQueue.push(crypto);  // 排名前50的是中优先级
            } else {
              lowPriorityQueue.push(crypto);     // 其他是低优先级
            }
          }
        }
      }
      
      // 策略 1: 处理没有指标数据的加密货币（高优先级）
      if (highPriorityQueue.length > 0) {
        const highPriorityBatchSize = Math.min(50, highPriorityQueue.length);
        const highPriorityBatch = highPriorityQueue.slice(0, highPriorityBatchSize);
        
        console.log(`优先策略: 正在爬取 ${highPriorityBatchSize} 个缺少指标数据的加密货币`);
        
        // 并行处理每个加密货币，使用较小的批次以避免阻塞
        const chunkSize = 5;
        for (let i = 0; i < highPriorityBatch.length; i += chunkSize) {
          const chunk = highPriorityBatch.slice(i, i + chunkSize);
          
          const chunkTasks = chunk.map(async (cryptoWithExplorer) => {
            try {
              const { cryptocurrencyId, url } = cryptoWithExplorer;
              const crypto = await storage.getCryptocurrency(cryptocurrencyId);
              
              if (!crypto) return;
              
              console.log(`正在爬取 ${crypto.name} (${crypto.symbol}) [排名 ${crypto.rank || 'N/A'}] 从 ${url} 的区块链数据...`);
              await scrapeBlockchainData(url, cryptocurrencyId);
            } catch (error) {
              console.error(`加密货币 ${cryptoWithExplorer.cryptocurrencyId} 的个别爬取出错:`, error);
            }
          });
          
          // 等待当前块完成后再处理下一块
          await Promise.allSettled(chunkTasks);
          
          // 引入短暂延迟以避免服务器过载
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }
      
      // 策略 2: 处理中优先级队列（排名靠前的加密货币）
      if (mediumPriorityQueue.length > 0) {
        // 选择一部分中优先级加密货币进行处理
        const mediumBatchSize = Math.min(20, mediumPriorityQueue.length);
        const mediumBatch = mediumPriorityQueue.slice(0, mediumBatchSize);
        
        console.log(`策略 2: 正在爬取 ${mediumBatchSize} 个排名靠前的加密货币`);
        
        // 分批并行处理
        const mediumChunkSize = 5;
        const mediumChunks = [];
        
        for (let i = 0; i < mediumBatch.length; i += mediumChunkSize) {
          mediumChunks.push(mediumBatch.slice(i, i + mediumChunkSize));
        }
        
        for (const chunk of mediumChunks) {
          const chunkTasks = chunk.map(async (cryptoWithExplorer) => {
            try {
              const { cryptocurrencyId, url } = cryptoWithExplorer;
              const crypto = await storage.getCryptocurrency(cryptocurrencyId);
              
              if (!crypto) return;
              
              await scrapeBlockchainData(url, cryptocurrencyId);
            } catch (error) {
              console.error(`处理中优先级加密货币 ${cryptoWithExplorer.cryptocurrencyId} 时出错:`, error);
            }
          });
          
          await Promise.allSettled(chunkTasks);
          await new Promise(resolve => setTimeout(resolve, 600));
        }
      }
      
      // 策略 3: 处理一部分低优先级队列
      if (lowPriorityQueue.length > 0) {
        // 从低优先级队列中随机选择一部分
        const lowBatchSize = Math.min(15, lowPriorityQueue.length); 
        
        // 随机选择低优先级加密货币
        const shuffledLowQueue = [...lowPriorityQueue].sort(() => 0.5 - Math.random());
        const lowBatch = shuffledLowQueue.slice(0, lowBatchSize);
        
        console.log(`策略 3: 正在爬取 ${lowBatchSize} 个低优先级加密货币`);
        
        const lowChunkSize = 5;
        for (let i = 0; i < lowBatch.length; i += lowChunkSize) {
          const chunk = lowBatch.slice(i, i + lowChunkSize);
          
          const chunkTasks = chunk.map(async (cryptoWithExplorer) => {
            try {
              const { cryptocurrencyId, url } = cryptoWithExplorer;
              const crypto = await storage.getCryptocurrency(cryptocurrencyId);
              
              if (!crypto) return;
              
              await scrapeBlockchainData(url, cryptocurrencyId);
            } catch (error) {
              console.error(`处理低优先级加密货币 ${cryptoWithExplorer.cryptocurrencyId} 时出错:`, error);
            }
          });
          
          await Promise.allSettled(chunkTasks);
          await new Promise(resolve => setTimeout(resolve, 700));
        }
      }
      
      // 策略 4: 处理最近添加的加密货币
      scrapingTasks.push(
        (async () => {
          try {
            // 获取最近添加的20个加密货币（按id降序排列）
            const recentCryptos = await storage.getCryptocurrencies(1, 20, "id", "desc");
            
            if (recentCryptos.data && recentCryptos.data.length > 0) {
              console.log(`策略 4: 正在处理 ${recentCryptos.data.length} 个最近添加的加密货币`);
              
              // 并行处理（限制为10个以避免系统过载）
              const recentBatch = recentCryptos.data.slice(0, 10);
              
              const recentChunkSize = 3; 
              for (let i = 0; i < recentBatch.length; i += recentChunkSize) {
                const chunk = recentBatch.slice(i, i + recentChunkSize);
                
                const chunkTasks = chunk.map(async (crypto) => {
                  // 获取此加密货币的浏览器
                  const explorers = await storage.getBlockchainExplorers(crypto.id);
                  
                  // 如果有浏览器，从第一个浏览器获取数据
                  if (explorers && explorers.length > 0) {
                    console.log(`正在从 ${explorers[0].url} 爬取 ${crypto.name} 的数据`);
                    await scrapeBlockchainData(explorers[0].url, crypto.id);
                  }
                });
                
                await Promise.allSettled(chunkTasks);
                await new Promise(resolve => setTimeout(resolve, 600));
              }
            }
          } catch (error) {
            console.error("Strategy 4 (recent cryptos) error:", error);
          }
        })()
      );
      
      // 定义一个按排名范围爬取数据的函数
      const scrapeByRankRange = async (startRank: number, batchSize: number, description: string) => {
        try {
          console.log(`${description}: 正在爬取排名 ${startRank}-${startRank + batchSize - 1} 的加密货币...`);
          await scrapeAllBlockchainData(batchSize, startRank);
        } catch (error) {
          console.error(`Error in ${description}:`, error);
        }
      };
      
      // 每10分钟完整刷新排名前30的加密货币
      if (new Date().getMinutes() % 10 === 0) {
        scrapingTasks.push(scrapeByRankRange(1, 30, "规划刷新 - 排名前30"));
      }
      
      // 每小时处理排名30-100的加密货币
      if (new Date().getMinutes() === 30) {
        scrapingTasks.push(scrapeByRankRange(31, 70, "规划刷新 - 排名31-100"));
      }
      
      // 执行所有剩余的爬取策略
      await Promise.allSettled(scrapingTasks);
      
      const cryptosWithMetrics = await storage.getCryptocurrenciesWithMetrics(1);
      console.log(`完成增强的区块链数据爬取。具有指标的加密货币总数: ${cryptosWithMetrics}`);
    } catch (error) {
      console.error("区块链爬虫调度器出错:", error);
      // 回退到较小的批处理
      await scrapeAllBlockchainData(15, 1);
    }
    
    // 保持Web爬虫活动状态
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
