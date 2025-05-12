import cron from 'node-cron';
import { searchTopCryptocurrencies, searchRankedCryptocurrencies } from './cryptoSearch';
import { getAiInsightsForCrypto } from './aiInsights';
import { storage } from '../storage';
import { runDataFixer } from './dataFixer';
import { updateTrumpCoinData } from './trumpFix';

// Function to run initial data collection immediately on startup
export async function runInitialDataCollection() {
  console.log('运行初始数据收集...');
  
  // 首先检查数据库中是否已有数据
  const existingData = await storage.getCryptocurrencies(1, 1, 'id', 'asc');
  
  // 始终确保爬虫处于活动状态
  await storage.updateCrawlerStatus({
    webCrawlerActive: true,
    lastUpdate: new Date()
  });
  
  if (existingData.total > 0) {
    console.log(`找到 ${existingData.total} 个现有加密货币。继续收集新数据而不重新开始。`);
    
    // 继续获取新数据而不删除现有数据
    // 以较小规模搜索新的加密货币来补充现有数据
    await searchTopCryptocurrencies(100);
    
    // 导入并使用市场数据爬虫
    try {
      const marketScraper = await import('./marketDataScraper');
      const results = await marketScraper.scrapeAllMarketData();
      console.log(`市场数据初始爬取完成：新增 ${results.added} 个币种，更新 ${results.updated} 个币种，共处理 ${results.total} 个币种`);
    } catch (error) {
      console.error('市场数据初始爬取出错:', error);
    }
    
  } else {
    console.log('未找到现有数据。开始全新数据收集...');
    
    // 立即搜索加密货币 - 增加到250个以初始获取更多
    await searchTopCryptocurrencies(250);
    console.log('初始加密货币数据获取完成');
    
    // 导入并使用市场数据爬虫进行第一次完整爬取
    try {
      const marketScraper = await import('./marketDataScraper');
      console.log('开始从主流市场数据网站爬取数据...');
      const results = await marketScraper.scrapeAllMarketData();
      console.log(`市场数据初始爬取完成：新增 ${results.added} 个币种，更新 ${results.updated} 个币种，共处理 ${results.total} 个币种`);
    } catch (error) {
      console.error('市场数据初始爬取出错:', error);
    }
  }
  
  // 返回以确保正确的启动顺序
  return true;
}

// The entry point for setting up all scheduled tasks
export async function setupScheduler() {
  // Run initial data collection immediately on startup
  await runInitialDataCollection();
  
  // Set up initial market data scraping task on startup
  const marketScraper = await import('./marketDataScraper');
  await marketScraper.scrapeAllMarketData().catch(err => {
    console.error('启动时市场数据爬取出错:', err);
  });

  console.log('Setting up scheduled tasks...');
  
  // Primary Market Data Collection - Every hour
  // This task ensures we get regular updates for the top cryptocurrencies
  cron.schedule('0 * * * *', async () => {
    console.log('Running scheduled task: Primary market data collection');
    
    try {
      // Check current count to dynamically adjust batch size
      const currentCryptos = await storage.getCryptocurrencies(1, 1, "id", "asc");
      const totalCount = currentCryptos.total || 0;
      
      // Determine appropriate batch sizes based on current data volume
      let mainBatchSize = 100; // Default
      let secondaryBatchSize = 50;
      
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
      
      // First, get the top ranked cryptocurrencies
      console.log(`Searching for top ${mainBatchSize} cryptocurrencies...`);
      await searchTopCryptocurrencies(mainBatchSize);
      
      // Then, get some additional cryptocurrencies to ensure diversity
      console.log(`Searching for additional ${secondaryBatchSize} cryptocurrencies...`);
      
      // Calculate offset based on current time to ensure different ranges over time
      const hourOffset = new Date().getHours() * 50;
      await searchRankedCryptocurrencies(mainBatchSize + hourOffset, mainBatchSize + hourOffset + secondaryBatchSize);
      
      // Update crawler status
      await storage.updateCrawlerStatus({
        webCrawlerActive: true,
        lastUpdate: new Date()
      });
    } catch (error) {
      console.error("Primary market data collection error:", error);
    }
  });
  
  // Phase 2: 市场数据补充任务 - 这里替换了原本的区块链浏览器查找任务
  // 以增量方式每分钟从不同来源获取新的加密货币信息
  cron.schedule('* * * * *', async () => {
    console.log('运行计划任务: 市场数据补充收集');
    
    try {
      // 检查当前计数以动态调整批处理大小
      const currentCryptos = await storage.getCryptocurrencies(1, 1, "marketCap", "desc");
      const totalCount = currentCryptos.total || 0;
      
      // 动态调整爬取策略
      let shouldUseCryptoSearch = true;
      let shouldUseMarketScraper = true;
      
      // 根据当前数据库规模调整策略
      if (totalCount < 200) {
        // 数据库较小时，积极收集数据
        shouldUseCryptoSearch = true; 
        shouldUseMarketScraper = true;
      } else if (totalCount < 400) {
        // 数据库中等规模，适度收集
        shouldUseCryptoSearch = new Date().getMinutes() % 2 === 0; // 隔分钟执行
        shouldUseMarketScraper = true;
      } else {
        // 数据库已经很大，减少频率
        shouldUseCryptoSearch = new Date().getMinutes() % 3 === 0; // 每3分钟执行一次
        shouldUseMarketScraper = new Date().getMinutes() % 2 === 0; // 隔分钟执行
      }
      
      // 创建并行任务数组
      const dataTasks: Promise<any>[] = [];
      
      // 任务1: 使用cryptoSearch模块查找新的加密货币
      if (shouldUseCryptoSearch) {
        dataTasks.push(
          (async () => {
            console.log(`使用API端点查找排名靠前的加密货币...`);
            
            // 随机选择执行范围
            const minute = new Date().getMinutes();
            const offset = (minute % 5) * 100; // 0, 100, 200, 300, 400
            
            // 使用不同的范围查找，确保全面覆盖
            return await searchRankedCryptocurrencies(offset + 1, offset + 100)
              .catch((error: any) => {
                console.error(`使用API查找加密货币出错 (范围 ${offset+1}-${offset+100}):`, error);
                return 0;
              });
          })()
        );
      }
      
      // 任务2: 使用市场数据爬虫获取详细信息
      if (shouldUseMarketScraper) {
        dataTasks.push(
          (async () => {
            try {
              // 导入市场数据爬虫
              const marketScraper = await import('./marketDataScraper');
              
              // 随机选择页面
              const randomPage = Math.floor(Math.random() * 5) + 1;
              console.log(`使用市场数据爬虫获取第${randomPage}页的数据...`);
              
              // 执行爬取
              const results = await marketScraper.scrapePageData(randomPage);
              
              console.log(`市场数据爬取结果: 新增${results.added}个, 更新${results.updated}个`);
              return results.added + results.updated;
            } catch (error) {
              console.error("市场数据爬取出错:", error);
              return 0;
            }
          })()
        );
      }
      
      // 并行运行所有任务
      const results = await Promise.allSettled(dataTasks);
      const successfulTasks = results.filter(r => r.status === 'fulfilled').length;
      
      console.log(`完成市场数据补充任务: ${successfulTasks}/${dataTasks.length} 个任务成功执行`);
      
    } catch (error) {
      console.error("市场数据补充任务出错:", error);
    }
    
    // 保持爬虫活动状态
    await storage.updateCrawlerStatus({
      webCrawlerActive: true,
      lastUpdate: new Date()
    });
  });

  // 全面市场数据爬取任务 (CoinMarketCap, CoinGecko, Crypto.com)
  // 每5分钟运行一次，专注于获取币种的基本信息和市场数据
  cron.schedule('*/5 * * * *', async () => {
    console.log('运行计划任务: 每5分钟市场数据更新');
    
    try {
      // 导入市场数据爬虫
      const marketScraper = await import('./marketDataScraper');
      
      // 随机选择一页进行爬取
      const randomPage = Math.floor(Math.random() * 10) + 1;
      console.log(`爬取第${randomPage}页的市场数据`);
      
      // 执行爬取
      const results = await marketScraper.scrapePageData(randomPage);
      
      console.log(`市场数据爬取完成: 新增 ${results.added} 个币种，更新 ${results.updated} 个币种`);
    } catch (error) {
      console.error('市场数据5分钟更新任务出错:', error);
    }
  });
  
  // 高级市场数据爬取任务
  // 每15分钟进行一次多线程深度爬取
  cron.schedule('*/15 * * * *', async () => {
    console.log('运行计划任务: 高级多线程市场数据爬取');
    
    try {
      // 导入市场数据爬虫
      const marketScraper = await import('./marketDataScraper');
      
      // 执行完整的市场数据爬取
      console.log('开始高级多线程加密货币数据收集...');
      const results = await marketScraper.scrapeAllMarketData();
      
      console.log(`高级市场数据爬取完成: 新增 ${results.added} 个币种，更新 ${results.updated} 个币种，共处理 ${results.total} 个币种`);
    } catch (error) {
      console.error('高级市场数据爬取任务出错:', error);
    }
  });
  
  // 重点币种市场数据更新任务
  // 每小时专门查询和更新排名前30的币种
  cron.schedule('30 * * * *', async () => {
    console.log('运行计划任务: 重点币种市场数据更新');
    
    try {
      // 使用API接口获取排名前30的币种
      console.log('更新排名前30的加密货币数据...');
      await searchRankedCryptocurrencies(1, 30);
      
      // 导入市场数据爬虫
      const marketScraper = await import('./marketDataScraper');
      
      // 爬取第一页数据 (通常包含排名靠前的币种)
      const results = await marketScraper.scrapePageData(1);
      
      console.log(`重点币种数据更新完成: 更新 ${results.updated} 个币种`);
    } catch (error) {
      console.error('重点币种数据更新任务出错:', error);
    }
  });

  // Data Fixing Task - Runs every hour
  cron.schedule('45 * * * *', async () => {
    console.log('Running scheduled task: Data Fixing');
    
    try {
      // Run the data fixer to clean up and fix any issues
      const fixResults = await runDataFixer();
      console.log(`Data fixing results: ${fixResults.marketCapFixed} market cap fixes, ${fixResults.metricsFixed} metrics fixes`);
      
      // Special case for Trump Coin (as requested)
      await updateTrumpCoinData();
    } catch (error) {
      console.error("Data fixer task error:", error);
    }
  });
  
  // AI Insights Generator - Runs daily
  cron.schedule('0 */8 * * *', async () => {
    console.log('Running scheduled task: AI Insights Generator');
    
    try {
      await generateAiInsights(5);
    } catch (error) {
      console.error("AI insights generator error:", error);
    }
  });
  
  console.log('All scheduler tasks have been set up and are running');
  return true;
}

// 市场数据爬取函数 - 替代原先的区块链数据爬取
async function scrapeAllMarketData(batchSize: number = 5): Promise<void> {
  try {
    // 导入市场数据爬虫模块
    const marketScraper = await import('./marketDataScraper');
    
    // 创建爬取任务数组
    const scrapingTasks: Promise<any>[] = [];
    
    // 生成要爬取的随机页面，避免重复
    const pagesToScrape: number[] = [];
    while (pagesToScrape.length < batchSize) {
      const randomPage = Math.floor(Math.random() * 10) + 1;
      if (!pagesToScrape.includes(randomPage)) {
        pagesToScrape.push(randomPage);
      }
    }
    
    // 创建爬取任务
    for (const page of pagesToScrape) {
      scrapingTasks.push(
        marketScraper.scrapePageData(page).catch(error => {
          console.error(`爬取第${page}页市场数据时出错:`, error);
          return { added: 0, updated: 0, total: 0, errors: 1 };
        })
      );
    }
    
    // 并行执行所有爬取任务
    const results = await Promise.all(scrapingTasks);
    
    // 计算总计
    const totalAdded = results.reduce((sum, r) => sum + r.added, 0);
    const totalUpdated = results.reduce((sum, r) => sum + r.updated, 0);
    const totalProcessed = results.reduce((sum, r) => sum + r.total, 0);
    const totalErrors = results.reduce((sum, r) => sum + (r.errors || 0), 0);
    
    console.log(`完成市场数据爬取: 共处理 ${totalProcessed} 个币种, 新增 ${totalAdded} 个, 更新 ${totalUpdated} 个, 出错 ${totalErrors} 个`);
  } catch (error) {
    console.error(`市场数据爬取出错:`, error);
  }
}

// 生成AI洞察的函数
async function generateAiInsights(limit: number = 5): Promise<void> {
  console.log(`Generating AI insights for ${limit} cryptocurrencies...`);
  
  try {
    // Get recently updated cryptocurrencies to generate insights for
    const recentCryptos = await storage.getRecentlyUpdatedCryptocurrencies(limit);
    
    // Process each cryptocurrency
    for (const crypto of recentCryptos) {
      try {
        console.log(`Thread 3: Analyzing recently updated ${crypto.name}`);
        
        // Get metrics for this cryptocurrency
        const metrics = await storage.getMetrics(crypto.id);
        
        if (metrics) {
          console.log(`Generating AI insights for ${crypto.name}...`);
          
          // Generate AI insights
          await getAiInsightsForCrypto(crypto, metrics);
          
          // Add small delay to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 2000));
        } else {
          console.log(`No metrics found for ${crypto.name}, skipping AI insights generation`);
        }
      } catch (error) {
        console.error(`Error generating AI insights for ${crypto.name}:`, error);
      }
    }
    
    console.log(`Completed AI insights generation for ${recentCryptos.length} cryptocurrencies`);
  } catch (error) {
    console.error("Error in AI insights generation:", error);
  }
}