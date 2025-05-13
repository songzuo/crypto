import cron from 'node-cron';
import { searchTopCryptocurrencies, searchRankedCryptocurrencies } from './cryptoSearch';
import { getAiInsightsForCrypto } from './aiInsights';
import { storage } from '../storage';
import { runDataFixer } from './dataFixer';
import { updateTrumpCoinData } from './trumpFix';
import { scrapeAdvancedMarketData } from './advancedMarketDataScraper';
import { startWatchdog, updateActivityTime } from './watchdog';
import { scrapeCryptoNews } from './cryptoNewsScraper';
import { analyzeNewsWordTrends } from './wordTrendAnalyzer';
import { 
  updateLastTrendAnalysisTime, 
  getLastTrendAnalysisTime,
  cacheTrendAnalysisResult,
  getCachedTrendAnalysisResult
} from './cacheStore';

// 创建一个导出对象，用于存储函数引用和最新趋势分析结果
export const scheduler = {
  getCachedTrendsAnalysis: null as any
};

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
      // 1. 使用标准市场数据爬虫
      const marketScraper = await import('./marketDataScraper');
      const results = await marketScraper.scrapeAllMarketData();
      console.log(`标准市场数据初始爬取完成：新增 ${results.added} 个币种，更新 ${results.updated} 个币种，共处理 ${results.total} 个币种`);
      
      // 2. 使用高级市场数据爬虫获取更多数据源
      console.log('开始从高级数据源爬取数据...');
      const newCryptos = await scrapeAdvancedMarketData();
      console.log(`高级市场数据初始爬取完成：新增 ${newCryptos} 个币种`);
      
      // 3. 抓取加密货币新闻
      console.log('开始抓取加密货币新闻...');
      const newsCount = await scrapeCryptoNews();
      console.log(`初始加密货币新闻爬取完成: 添加了 ${newsCount} 条新闻`);
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
      // 1. 标准市场数据爬虫
      const marketScraper = await import('./marketDataScraper');
      console.log('开始从主流市场数据网站爬取数据...');
      const results = await marketScraper.scrapeAllMarketData();
      console.log(`标准市场数据初始爬取完成：新增 ${results.added} 个币种，更新 ${results.updated} 个币种，共处理 ${results.total} 个币种`);
      
      // 2. 高级市场数据爬虫
      console.log('开始从高级数据源（Binance、DeFi Llama等）爬取数据...');
      const newCryptos = await scrapeAdvancedMarketData();
      console.log(`高级市场数据初始爬取完成：新增 ${newCryptos} 个币种`);
      
      // 3. 抓取加密货币新闻
      console.log('开始抓取加密货币新闻...');
      const newsCount = await scrapeCryptoNews();
      console.log(`初始加密货币新闻爬取完成: 添加了 ${newsCount} 条新闻`);
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
  
  // 启动守护进程确保系统持续运行
  startWatchdog();
  console.log('系统守护进程已启动，将自动监控和恢复爬虫任务');
  
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
  // 以增量方式每3分钟从不同来源获取新的加密货币信息 (7/24不间断)
  cron.schedule('*/3 * * * *', async () => {
    console.log('运行计划任务: 市场数据补充收集 (每3分钟)');
    
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
  
  // 加密货币新闻爬取任务
  // 每4分钟爬取一次新闻 (7/24不间断)
  cron.schedule('*/4 * * * *', async () => {
    console.log('运行计划任务: 加密货币新闻爬取 (每4分钟)');
    
    try {
      // 爬取加密货币新闻
      const newsCount = await scrapeCryptoNews();
      console.log(`加密货币新闻爬取完成: 添加了 ${newsCount} 条新闻`);
      
      // 清理旧新闻，保持在400条限制以内
      const removedCount = await storage.cleanupOldNews(400);
      if (removedCount > 0) {
        console.log(`已清理 ${removedCount} 条旧新闻，保持在 400 条限制之内`);
      }
    } catch (error) {
      console.error('加密货币新闻爬取任务出错:', error);
    }
  });
  
  // 重点币种市场数据更新任务
  // 每小时专门查询和更新排名前30的币种
  cron.schedule('30 * * * *', async () => {
    console.log('运行计划任务: 重点币种市场数据更新');
    
    try {
      // 检查当前加密货币数量
      const currentCryptos = await storage.getCryptocurrencies(1, 1, 'id', 'asc');
      const totalCount = currentCryptos.total || 0;
      
      // 获取爬虫状态
      const crawlerStatus = await storage.getCrawlerStatus();
      
      // 如果数量停滞在467附近，启动突破性爬取
      if (totalCount >= 400 && totalCount < 500) {
        console.log(`检测到币种数量${totalCount}接近467，启动突破性大规模爬取...`);
        await forceBreakthroughScrape();
      }
      
      // 继续常规重点币种更新
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
  
// 大规模收集币种函数 - 不限制数量，持续扩充数据库
async function forceBreakthroughScrape(): Promise<void> {
  console.log('启动大规模收集币种任务，持续扩充数据库，不设上限...');
  
  try {
    // 导入数据修复工具
    const dataFixer = await import('./dataFixer');
    const marketCapFixer = await import('./marketCapFixer');
    
    // 首先删除没有市值的币种，确保数据质量
    console.log('第1步：清理没有市值的币种...');
    await marketCapFixer.removeCoinsWithoutMarketCap();
    
    // 统计当前币种数量
    const beforeCryptos = await storage.getCryptocurrencies(1, 1, 'id', 'asc');
    const beforeCount = beforeCryptos.total || 0;
    console.log(`清理后当前币种数量: ${beforeCount}`);
    
    // 尝试多种来源获取新币种
    console.log('第2步：从多个来源获取新币种...');
    
    // 使用市场数据爬虫同时爬取多个页面
    const marketScraper = await import('./marketDataScraper');
    
    // 创建多个平行爬取任务，使用多个页面和来源
    const scrapeTasks: Promise<any>[] = [];
    
    // 随机选择50个页面范围进行爬取，大幅增加覆盖范围，包括排名更靠后的币种
    const pages = new Set<number>();
    while (pages.size < 50) {
      // 增加随机范围到100页，覆盖更多币种
      const randomPage = Math.floor(Math.random() * 100) + 1;
      pages.add(randomPage);
    }
    
    // 添加爬取任务
    for (const page of Array.from(pages)) {
      scrapeTasks.push(
        marketScraper.scrapePageData(page).catch(error => {
          console.error(`爬取第${page}页时出错:`, error);
          return { added: 0, updated: 0 };
        })
      );
    }
    
    // 额外添加API搜索任务
    for (let i = 0; i < 10; i++) {
      const start = i * 100 + 1;
      const end = (i + 1) * 100;
      scrapeTasks.push(
        searchRankedCryptocurrencies(start, end).catch(error => {
          console.error(`搜索范围${start}-${end}时出错:`, error);
          return 0;
        })
      );
    }
    
    // 额外尝试搜索前1000名币种
    scrapeTasks.push(
      searchTopCryptocurrencies(1000).catch(error => {
        console.error('搜索前1000名币种时出错:', error);
        return false;
      })
    );
    
    // 并行执行所有任务
    console.log(`开始执行${scrapeTasks.length}个并行爬取任务...`);
    await Promise.allSettled(scrapeTasks);
    
    // 完成后再次统计币种数量
    const afterCryptos = await storage.getCryptocurrencies(1, 1, 'id', 'asc');
    const afterCount = afterCryptos.total || 0;
    
    console.log(`突破性爬取完成！之前: ${beforeCount}个币种, 之后: ${afterCount}个币种, 新增: ${afterCount - beforeCount}个币种`);
    
    // 如果数量仍然没有增加，记录警告
    if (afterCount <= beforeCount) {
      console.warn('警告：突破性爬取后币种数量没有增加，可能需要检查API访问限制或网络问题');
    }
    
    // 获取现有的爬虫状态
    const currentStatus = await storage.getCrawlerStatus();
    const currentCount = afterCount > (currentStatus?.maxCryptoCount || 0) ? afterCount : (currentStatus?.maxCryptoCount || 0);
    const breakthroughCount = (currentStatus?.breakthroughCount || 0) + 1;
    
    // 更新爬虫状态
    await storage.updateCrawlerStatus({
      webCrawlerActive: true,
      lastUpdate: new Date(),
      lastBreakthroughAttempt: new Date(),
      breakthroughCount: breakthroughCount,
      maxCryptoCount: currentCount
    });
    
  } catch (error) {
    console.error('突破性爬取过程中发生错误:', error);
  }
}

  // Data Fixing Task - Runs every hour
  cron.schedule('45 * * * *', async () => {
    console.log('Running scheduled task: Data Fixing');
    
    try {
      // Run the data fixer to clean up and fix any issues
      const fixResults = await runDataFixer();
      console.log(`Data fixing results: ${fixResults.marketCapFixed} market cap fixes, ${fixResults.metricsFixed} metrics fixes, ${fixResults.noMarketCapRemoved} coins without market cap removed`);
      
      // Special case for Trump Coin (as requested)
      await updateTrumpCoinData();
    } catch (error) {
      console.error("Data fixer task error:", error);
    }
  });
  
  // 高级多源市场数据爬取任务 - 每3分钟执行一次 (7/24不间断)
  cron.schedule('*/3 * * * *', async () => {
    console.log('运行计划任务: 高级多源市场数据爬取 (每3分钟)');
    
    try {
      // 执行高级市场数据爬取
      const newCryptos = await scrapeAdvancedMarketData();
      console.log(`高级多源市场数据爬取完成，新增 ${newCryptos} 个加密货币`);
      
      // 更新活动时间，告知守护进程爬虫正常运行
      updateActivityTime();
    } catch (error) {
      console.error("高级市场数据爬取任务出错:", error);
    }
  });
  
  // 突破467限制的专用任务 - 每3分钟执行一次 (7/24不间断)
  cron.schedule('*/3 * * * *', async () => {
    console.log('运行计划任务: 强制突破币种数量限制检查 (每3分钟)');
    
    try {
      // 获取当前加密货币数量
      const currentCryptos = await storage.getCryptocurrencies(1, 1, 'id', 'asc');
      const totalCount = currentCryptos.total || 0;
      
      console.log(`当前数据库中有 ${totalCount} 个加密货币`);
      
      // 永远执行突破性爬取，不管当前币种数量
      // 设定更激进的目标，确保爬虫持续收集新币种
      const targetCount = totalCount + 100; // 总是尝试再增加100个币种
      
      console.log(`当前数据库中有 ${totalCount} 个加密货币，目标是收集至少 ${targetCount} 个`);
      console.log(`启动突破性大规模爬取，不设置上限...`);
      
      // 使用多种方法尝试突破限制
      console.log("尝试使用多种方法获取更多币种");
      
      // 方法1: 使用forceBreakthroughScrape
      console.log("方法1: 使用突破性爬取");
      await forceBreakthroughScrape();
      
      // 无论结果如何，总是尝试方法2 - 直接搜索更多币种
      console.log(`继续尝试方法2: 直接搜索更多币种`);
      
      // 方法2: 搜索前1000名的币种，不设置上限
      const cryptoSearch = await import('./cryptoSearch');
      // 每次尝试搜索不同的币种范围，增加发现新币种的机会
      const randomStart = Math.floor(Math.random() * 900) + 1; // 1-900之间随机起点
      await cryptoSearch.searchRankedCryptocurrencies(randomStart, randomStart + 100);
    } catch (error) {
      console.error("突破限制任务出错:", error);
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
  
  // 创建一个用于存储最新趋势分析结果的全局变量
  let latestTrendsAnalysisResult: any = null;
  let trendsAnalysisExecutionTime: Date | null = null;

  // 执行趋势分析并缓存结果
  async function executeAndCacheTrendsAnalysis() {
    console.log('运行定时任务: 新闻词汇趋势分析 (每5分钟)');
    
    try {
      const startTime = new Date();
      trendsAnalysisExecutionTime = startTime;
      
      // 分析新闻词汇趋势
      console.log('开始执行后台定时词汇趋势分析...');
      const result = await analyzeNewsWordTrends(30);
      console.log(`后台词汇趋势分析完成: 找到 ${result.topWords.length} 个热门词汇`);
      
      // 保存结果到全局变量，供API调用时直接使用
      latestTrendsAnalysisResult = result;
      
      // 记录执行时间以供未来参考
      const endTime = new Date();
      const executionTimeMs = endTime.getTime() - startTime.getTime();
      console.log(`趋势分析执行时间: ${executionTimeMs}ms，在 ${startTime.toISOString()} 开始`);
      
      // 更新最后分析时间到缓存存储
      updateLastTrendAnalysisTime(startTime);
      
      // 更新活动时间
      updateActivityTime();
    } catch (error) {
      console.error('后台词汇趋势分析出错:', error);
    }
  }

  // 初始化时立即执行一次
  executeAndCacheTrendsAnalysis();

  // 设置严格的5分钟间隔定时任务 - 确保每5分钟运行一次而不依赖API请求
  cron.schedule('*/5 * * * *', executeAndCacheTrendsAnalysis);
  
  // 声明一个内部函数，用于后面导出
  function getCachedTrendsResult() {
    // 只有在存在结果的情况下才添加executionTime字段
    if (latestTrendsAnalysisResult) {
      return {
        ...latestTrendsAnalysisResult,
        executionTime: trendsAnalysisExecutionTime
      };
    }
    return null;
  }
  
  // 将内部函数赋值给外部变量
  scheduler.getCachedTrendsAnalysis = getCachedTrendsResult;

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