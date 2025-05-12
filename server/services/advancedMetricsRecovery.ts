/**
 * 高级指标恢复模块
 * 
 * 使用四种策略获取加密货币链上指标:
 * 1. 谷歌搜索指标
 * 2. 通过AI API查询
 * 3. 爬取区块链浏览器(Scan网站)
 * 4. 爬取项目方官方网站
 */

import { storage } from '../storage';
import * as cheerio from 'cheerio';
import https from 'https';
import { InsertMetric, Cryptocurrency } from '@shared/schema';
import { get } from 'https';
import { OpenAI } from 'openai';

// 配置信息
const CONFIG = {
  BATCH_SIZE: 20,            // 每次处理的币种数量
  THREAD_COUNT: 5,           // 并行处理线程数
  TIMEOUT_MS: 10000,         // 请求超时时间
  RETRY_COUNT: 3,            // 请求重试次数
  DELAY_BETWEEN_REQUESTS: 1000, // 请求间隔时间(毫秒)
  GOOGLE_SEARCH_DELAY: 2000, // 谷歌搜索间隔时间(避免被封)
  MAX_AGE_HOURS: 24,         // 指标数据过期时间(小时)
  OPENAI_MODEL: "gpt-4o",    // OpenAI模型
};

// 初始化OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * 安全地获取网页内容
 */
function makeHttpsRequest(url: string, timeoutMs = CONFIG.TIMEOUT_MS): Promise<string> {
  return new Promise((resolve, reject) => {
    const options = {
      timeout: timeoutMs,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      }
    };
    
    const request = https.get(url, options, (response) => {
      // 处理重定向
      if (response.statusCode === 301 || response.statusCode === 302) {
        if (response.headers.location) {
          console.log(`请求被重定向到 ${response.headers.location}`);
          return makeHttpsRequest(response.headers.location, timeoutMs)
            .then(resolve)
            .catch(reject);
        }
      }
      
      // 检查状态码
      if (response.statusCode !== 200) {
        reject(new Error(`HTTP Error: ${response.statusCode}`));
        return;
      }
      
      let data = '';
      response.on('data', (chunk) => {
        data += chunk;
      });
      response.on('end', () => {
        resolve(data);
      });
    }).on('error', (err) => {
      reject(err);
    }).on('timeout', () => {
      request.destroy();
      reject(new Error(`请求超时: ${url}`));
    });
  });
}

/**
 * 解析带单位的数字 (如 1.2K, 3.5M, 2B 等)
 */
function parseNumberWithUnits(value: string): number | null {
  try {
    if (!value || typeof value !== 'string') return null;
    
    // 移除所有空格和逗号
    const cleanValue = value.replace(/,|\s+/g, '');
    
    // 匹配数字和可能的单位
    const match = cleanValue.match(/^([\d.]+)([KkMmBbTt])?$/);
    
    if (match) {
      let num = parseFloat(match[1]);
      const unit = match[2]?.toLowerCase();
      
      // 根据单位调整数值
      if (unit === 'k') num *= 1000;
      else if (unit === 'm') num *= 1000000;
      else if (unit === 'b') num *= 1000000000;
      else if (unit === 't') num *= 1000000000000;
      
      return num;
    }
    
    // 尝试直接解析为数字
    const num = parseFloat(cleanValue);
    return isNaN(num) ? null : num;
  } catch (error) {
    return null;
  }
}

/**
 * 主函数：使用四种策略恢复指标
 */
export async function advancedMetricsRecovery(limit: number = CONFIG.BATCH_SIZE): Promise<number> {
  console.log(`开始高级链上指标恢复 (多策略)...(批处理大小: ${limit})`);
  let updatedCount = 0;
  
  try {
    // 获取所有排名靠前的币种
    const result = await storage.getCryptocurrencies(1, limit * 2, "rank", "asc");
    let cryptos = result.data;
    
    // 过滤出需要更新的币种
    const cryptosToUpdate = [];
    for (const crypto of cryptos) {
      // 检查是否已有指标数据，以及数据是否过期
      const metrics = await storage.getMetrics(crypto.id);
      const needsUpdate = !metrics || 
                          !metrics.lastUpdated || 
                          isDataExpired(metrics.lastUpdated, CONFIG.MAX_AGE_HOURS) ||
                          isDataIncomplete(metrics);
      
      if (needsUpdate) {
        cryptosToUpdate.push(crypto);
      }
    }
    
    // 按排名排序
    cryptosToUpdate.sort((a, b) => {
      // 如果两个都有排名，按排名排序
      if (a.rank && b.rank) {
        return a.rank - b.rank;
      }
      
      // 如果只有一个有排名，有排名的优先级更高
      if (a.rank && !b.rank) return -1;
      if (!a.rank && b.rank) return 1;
      
      // 都没有排名，按市值排序
      return (b.marketCap || 0) - (a.marketCap || 0);
    });
    
    // 限制处理数量
    const coinsToProcess = cryptosToUpdate.slice(0, limit);
    
    console.log(`需要更新指标的币种: ${coinsToProcess.length}`);
    if (coinsToProcess.length === 0) {
      return 0;
    }
    
    // 设置优先级队列 - 特殊处理一些重要币种
    const highPriorityCoins = coinsToProcess.filter(c => 
      ['Bitcoin', 'Ethereum', 'XRP', 'Solana', 'Cardano', 'BNB', 'Dogecoin'].includes(c.name));
    
    // 移除已经放入高优先级的币种
    const normalPriorityCoins = coinsToProcess.filter(c => 
      !highPriorityCoins.some(hpc => hpc.id === c.id));
    
    // 合并队列，高优先级币种优先处理
    const processQueue = [...highPriorityCoins, ...normalPriorityCoins];
    
    console.log("准备处理的币种队列:");
    processQueue.forEach((crypto, index) => {
      console.log(`${index + 1}. ${crypto.name} (${crypto.symbol}) - 排名: ${crypto.rank || '未知'}, 优先级: ${highPriorityCoins.some(c => c.id === crypto.id) ? '高' : '普通'}`);
    });
    
    // 计算并行线程数
    const threadCount = Math.min(CONFIG.THREAD_COUNT, processQueue.length);
    console.log(`将使用 ${threadCount} 个并行线程进行处理`);
    
    // 将币种分配到不同的线程中
    const threadsItems = Array.from({ length: threadCount }, () => [] as Cryptocurrency[]);
    processQueue.forEach((crypto, index) => {
      const threadIndex = index % threadCount;
      threadsItems[threadIndex].push(crypto);
    });
    
    // 创建并发执行的Promise数组
    const processingPromises = threadsItems.map((items, threadIndex) => 
      processMetricsBatch(items, threadIndex)
    );
    
    // 等待所有线程完成
    const results = await Promise.all(processingPromises);
    
    // 统计修复数量
    updatedCount = results.reduce((total, count) => total + count, 0);
    
    console.log(`高级指标恢复完成。成功更新 ${updatedCount} 个币种的数据。`);
    return updatedCount;
    
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`高级指标恢复过程中出错: ${errorMsg}`);
    return updatedCount;
  }
}

/**
 * 检查数据是否已过期
 */
function isDataExpired(lastUpdated: Date, maxAgeHours: number): boolean {
  const now = new Date();
  const ageMs = now.getTime() - new Date(lastUpdated).getTime();
  const ageHours = ageMs / (1000 * 60 * 60);
  return ageHours > maxAgeHours;
}

/**
 * 检查指标数据是否不完整
 */
function isDataIncomplete(metrics: any): boolean {
  return !metrics.activeAddresses && 
         !metrics.totalTransactions && 
         !metrics.hashrate && 
         !metrics.transactionsPerSecond && 
         (!metrics.metrics || Object.keys(metrics.metrics).length === 0);
}

/**
 * 处理一批币种的指标恢复
 */
async function processMetricsBatch(items: Cryptocurrency[], threadIndex: number): Promise<number> {
  let successCount = 0;
  
  console.log(`[线程 ${threadIndex+1}] 开始处理 ${items.length} 个币种的指标数据`);
  
  for (const crypto of items) {
    try {
      const result = await recoverMetricsForCoin(crypto, threadIndex);
      if (result) {
        successCount++;
      }
      
      // 线程间隔，避免请求过于密集
      await new Promise(resolve => setTimeout(resolve, CONFIG.DELAY_BETWEEN_REQUESTS));
      
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`[线程 ${threadIndex+1}] 处理币种 ${crypto.name} (ID: ${crypto.id}) 时出错: ${errorMsg}`);
    }
  }
  
  console.log(`[线程 ${threadIndex+1}] 完成处理，成功恢复 ${successCount} 个币种的指标数据`);
  return successCount;
}

/**
 * 为单个币种恢复指标数据，使用多种策略
 */
async function recoverMetricsForCoin(crypto: Cryptocurrency, threadIndex: number): Promise<boolean> {
  console.log(`[线程 ${threadIndex+1}] 开始为 ${crypto.name} (${crypto.symbol}) [排名: ${crypto.rank || 'N/A'}] 恢复指标数据...`);
  
  // 获取当前指标数据
  const currentMetrics = await storage.getMetrics(crypto.id);
  
  // 准备新的指标更新对象
  const metricsUpdate: Partial<InsertMetric> = {
    metrics: {} // 存储其他发现的指标
  };
  
  // 记录策略成功情况
  const strategyResults = {
    scanWebsite: false,
    officialWebsite: false,
    googleSearch: false,
    aiQuery: false
  };
  
  // 尝试所有策略，直到成功
  try {
    // 策略1: 爬取区块链浏览器
    console.log(`[线程 ${threadIndex+1}] 策略1: 尝试从区块链浏览器爬取 ${crypto.name} 的指标数据...`);
    strategyResults.scanWebsite = await scrapeScanWebsites(crypto, metricsUpdate, threadIndex);
    
    // 如果策略1失败，尝试策略2
    if (!strategyResults.scanWebsite) {
      console.log(`[线程 ${threadIndex+1}] 策略2: 尝试从官方网站爬取 ${crypto.name} 的指标数据...`);
      strategyResults.officialWebsite = await scrapeOfficialWebsite(crypto, metricsUpdate, threadIndex);
    }
    
    // 如果策略1和2都失败，尝试策略3
    if (!strategyResults.scanWebsite && !strategyResults.officialWebsite) {
      console.log(`[线程 ${threadIndex+1}] 策略3: 尝试通过谷歌搜索获取 ${crypto.name} 的指标数据...`);
      strategyResults.googleSearch = await searchGoogleForMetrics(crypto, metricsUpdate, threadIndex);
    }
    
    // 如果前三种策略都失败，尝试策略4
    if (!strategyResults.scanWebsite && !strategyResults.officialWebsite && !strategyResults.googleSearch) {
      console.log(`[线程 ${threadIndex+1}] 策略4: 尝试通过AI API查询 ${crypto.name} 的指标数据...`);
      strategyResults.aiQuery = await queryAIForMetrics(crypto, metricsUpdate, threadIndex);
    }
    
    // 如果任何策略成功，更新数据库
    const anyStrategySucceeded = Object.values(strategyResults).some(result => result);
    const hasUpdates = Object.keys(metricsUpdate).length > 1 || Object.keys(metricsUpdate.metrics || {}).length > 0;
    
    if (anyStrategySucceeded && hasUpdates) {
      // 更新数据库
      if (currentMetrics) {
        await storage.updateMetrics(currentMetrics.id, metricsUpdate);
        console.log(`[线程 ${threadIndex+1}] ✓ 成功更新 ${crypto.name} 的指标数据`);
      } else {
        // 创建新的指标记录
        const fullMetrics: InsertMetric = {
          cryptocurrencyId: crypto.id,
          activeAddresses: metricsUpdate.activeAddresses || null,
          totalTransactions: metricsUpdate.totalTransactions || null,
          averageTransactionValue: null,
          hashrate: metricsUpdate.hashrate || null,
          transactionsPerSecond: metricsUpdate.transactionsPerSecond || null,
          metrics: metricsUpdate.metrics || {}
        };
        await storage.createMetrics(fullMetrics);
        console.log(`[线程 ${threadIndex+1}] ✓ 成功创建 ${crypto.name} 的指标数据`);
      }
      
      // 输出使用的策略
      const successStrategies = Object.entries(strategyResults)
        .filter(([_, succeeded]) => succeeded)
        .map(([strategy, _]) => strategy);
      console.log(`[线程 ${threadIndex+1}] ${crypto.name} 指标数据成功通过以下策略获取: ${successStrategies.join(', ')}`);
      
      return true;
    } else {
      console.log(`[线程 ${threadIndex+1}] × 所有策略都未能获取到 ${crypto.name} 的有效指标数据`);
      return false;
    }
    
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`[线程 ${threadIndex+1}] 处理币种 ${crypto.name} 时出错: ${errorMsg}`);
    return false;
  }
}

/**
 * 策略1: 爬取区块链浏览器网站
 */
async function scrapeScanWebsites(crypto: Cryptocurrency, metricsUpdate: Partial<InsertMetric>, threadIndex: number): Promise<boolean> {
  try {
    // 获取该币种所有已知的浏览器URL
    const dbExplorers = await storage.getBlockchainExplorers(crypto.id);
    
    if (dbExplorers.length === 0) {
      console.log(`[线程 ${threadIndex+1}] ${crypto.name} 没有已知的区块链浏览器URL`);
      return false;
    }
    
    let successCount = 0;
    
    // 尝试每个浏览器URL
    for (const explorer of dbExplorers) {
      try {
        console.log(`[线程 ${threadIndex+1}] 尝试从 ${explorer.url} 抓取 ${crypto.name} 的指标数据...`);
        const html = await makeHttpsRequest(explorer.url);
        const $ = cheerio.load(html);
        
        // 定义要寻找的指标和关键词
        const metricsToFind = getMetricsKeywords(crypto.name, crypto.symbol);
        
        // 在页面中搜索这些指标
        for (const [metricKey, keywords] of Object.entries(metricsToFind)) {
          if (findMetricByKeywords($, metricKey, keywords, metricsUpdate, threadIndex, crypto.name)) {
            successCount++;
          }
        }
        
        // 如果找到了足够的指标，提前结束
        if (successCount >= 2) {
          return true;
        }
        
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.log(`[线程 ${threadIndex+1}] 从 ${explorer.url} 抓取失败: ${errorMsg}`);
      }
    }
    
    return successCount > 0;
    
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`[线程 ${threadIndex+1}] 爬取区块链浏览器数据过程中出错: ${errorMsg}`);
    return false;
  }
}

/**
 * 策略2: 爬取项目官方网站
 */
async function scrapeOfficialWebsite(crypto: Cryptocurrency, metricsUpdate: Partial<InsertMetric>, threadIndex: number): Promise<boolean> {
  if (!crypto.officialWebsite) {
    console.log(`[线程 ${threadIndex+1}] ${crypto.name} 没有官方网站URL`);
    return false;
  }
  
  try {
    console.log(`[线程 ${threadIndex+1}] 尝试从官方网站 ${crypto.officialWebsite} 抓取 ${crypto.name} 的指标数据...`);
    const html = await makeHttpsRequest(crypto.officialWebsite);
    const $ = cheerio.load(html);
    
    // 定义要寻找的指标和关键词
    const metricsToFind = getMetricsKeywords(crypto.name, crypto.symbol);
    
    let successCount = 0;
    
    // 在页面中搜索这些指标
    for (const [metricKey, keywords] of Object.entries(metricsToFind)) {
      if (findMetricByKeywords($, metricKey, keywords, metricsUpdate, threadIndex, crypto.name)) {
        successCount++;
      }
    }
    
    return successCount > 0;
    
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.log(`[线程 ${threadIndex+1}] 从官方网站抓取失败: ${errorMsg}`);
    return false;
  }
}

/**
 * 策略3: 通过谷歌搜索获取指标数据
 */
async function searchGoogleForMetrics(crypto: Cryptocurrency, metricsUpdate: Partial<InsertMetric>, threadIndex: number): Promise<boolean> {
  try {
    let successCount = 0;
    
    // 为不同指标创建搜索查询
    const searchQueries = [
      `${crypto.name} ${crypto.symbol} active addresses`,
      `${crypto.name} ${crypto.symbol} total transactions`,
      `${crypto.name} ${crypto.symbol} transactions per second tps`,
      `${crypto.name} ${crypto.symbol} hashrate mining power`,
      `${crypto.name} ${crypto.symbol} network statistics`
    ];
    
    for (const query of searchQueries) {
      try {
        // 模拟Google搜索
        console.log(`[线程 ${threadIndex+1}] 搜索: "${query}"`);
        const encodedQuery = encodeURIComponent(query);
        const searchUrl = `https://www.google.com/search?q=${encodedQuery}`;
        
        // 获取搜索结果页面
        const html = await makeHttpsRequest(searchUrl);
        const $ = cheerio.load(html);
        
        // 提取搜索结果中的第一页链接
        const resultLinks: string[] = [];
        $('a').each((_, element) => {
          const href = $(element).attr('href');
          if (href && href.startsWith('/url?q=')) {
            const url = href.substring(7).split('&')[0];
            if (url.startsWith('http') && 
                !url.includes('google.com') && 
                !url.includes('youtube.com') && 
                !resultLinks.includes(url)) {
              resultLinks.push(url);
            }
          }
        });
        
        // 只处理前3个链接
        const linksToProcess = resultLinks.slice(0, 3);
        
        for (const link of linksToProcess) {
          try {
            console.log(`[线程 ${threadIndex+1}] 尝试从搜索结果 ${link} 抓取数据...`);
            const resultHtml = await makeHttpsRequest(link);
            const resultPage = cheerio.load(resultHtml);
            
            // 寻找指标数据
            const metricsToFind = getMetricsKeywords(crypto.name, crypto.symbol);
            
            for (const [metricKey, keywords] of Object.entries(metricsToFind)) {
              if (findMetricByKeywords(resultPage, metricKey, keywords, metricsUpdate, threadIndex, crypto.name)) {
                successCount++;
              }
            }
            
            // 如果已经找到足够的指标，提前结束
            if (successCount >= 2) {
              return true;
            }
            
          } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            console.log(`[线程 ${threadIndex+1}] 处理搜索结果 ${link} 时出错: ${errorMsg}`);
          }
          
          // 延迟以避免被Google封锁
          await new Promise(resolve => setTimeout(resolve, CONFIG.GOOGLE_SEARCH_DELAY));
        }
        
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.log(`[线程 ${threadIndex+1}] 搜索 "${query}" 时出错: ${errorMsg}`);
      }
      
      // 延迟以避免被Google封锁
      await new Promise(resolve => setTimeout(resolve, CONFIG.GOOGLE_SEARCH_DELAY * 2));
    }
    
    return successCount > 0;
    
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`[线程 ${threadIndex+1}] 谷歌搜索过程中出错: ${errorMsg}`);
    return false;
  }
}

/**
 * 策略4: 通过AI API查询指标数据
 * 使用OpenAI获取链上指标数据
 */
async function queryAIForMetrics(crypto: Cryptocurrency, metricsUpdate: Partial<InsertMetric>, threadIndex: number): Promise<boolean> {
  // 检查是否有API密钥
  if (!process.env.OPENAI_API_KEY) {
    console.log(`[线程 ${threadIndex+1}] 缺少OpenAI API密钥，无法使用AI查询`);
    return false;
  }
  
  try {
    console.log(`[线程 ${threadIndex+1}] 使用OpenAI查询 ${crypto.name} 的最新链上指标数据...`);
    
    const systemPrompt = `You are a cryptocurrency data expert. I need the latest on-chain metrics for ${crypto.name} (${crypto.symbol}).
Please provide the following metrics with exact numbers (no ranges or approximations):
1. Active Addresses (number of unique addresses that have sent or received transactions recently)
2. Total Transactions (cumulative number of transactions on the network)
3. Transactions Per Second (TPS) (average transaction throughput)
4. Hashrate or Staking Total (for proof of work or proof of stake blockchains)

Provide ONLY factual data from reliable sources like block explorers or official statistics.
If you don't know a specific metric, say "unknown" for that metric.
Format your response as valid JSON with keys: activeAddresses, totalTransactions, transactionsPerSecond, hashrate.
Use integer values only (no commas, units, or text).`;

    const userPrompt = `I need accurate on-chain metrics for ${crypto.name} (${crypto.symbol}), including active addresses, total transactions, transactions per second, and hashrate/staking amount. Please respond with reliable factual data only. Do not make up or estimate values - if you don't know a metric, mark it as unknown.`;
    
    const completion = await openai.chat.completions.create({
      model: CONFIG.OPENAI_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      response_format: { type: "json_object" },
      temperature: 0.2,
    });
    
    const responseContent = completion.choices[0].message.content;
    
    if (!responseContent) {
      console.log(`[线程 ${threadIndex+1}] AI未返回有效响应`);
      return false;
    }
    
    console.log(`[线程 ${threadIndex+1}] AI响应: ${responseContent}`);
    
    try {
      const metricsData = JSON.parse(responseContent);
      let validMetricsFound = false;
      
      // 处理返回的指标数据
      if (metricsData.activeAddresses && metricsData.activeAddresses !== "unknown") {
        const value = parseFloat(metricsData.activeAddresses);
        if (!isNaN(value) && value > 0) {
          metricsUpdate.activeAddresses = value;
          console.log(`[线程 ${threadIndex+1}] AI提供的活跃地址数: ${value}`);
          validMetricsFound = true;
        }
      }
      
      if (metricsData.totalTransactions && metricsData.totalTransactions !== "unknown") {
        const value = parseFloat(metricsData.totalTransactions);
        if (!isNaN(value) && value > 0) {
          metricsUpdate.totalTransactions = value;
          console.log(`[线程 ${threadIndex+1}] AI提供的总交易数: ${value}`);
          validMetricsFound = true;
        }
      }
      
      if (metricsData.transactionsPerSecond && metricsData.transactionsPerSecond !== "unknown") {
        const value = parseFloat(metricsData.transactionsPerSecond);
        if (!isNaN(value) && value > 0) {
          metricsUpdate.transactionsPerSecond = value;
          console.log(`[线程 ${threadIndex+1}] AI提供的每秒交易数: ${value}`);
          validMetricsFound = true;
        }
      }
      
      if (metricsData.hashrate && metricsData.hashrate !== "unknown") {
        const value = parseFloat(metricsData.hashrate);
        if (!isNaN(value) && value > 0) {
          metricsUpdate.hashrate = String(value);  // 转换为字符串
          console.log(`[线程 ${threadIndex+1}] AI提供的算力/质押量: ${value}`);
          validMetricsFound = true;
        }
      }
      
      // 处理可能的其他指标
      for (const [key, value] of Object.entries(metricsData)) {
        if (!['activeAddresses', 'totalTransactions', 'transactionsPerSecond', 'hashrate'].includes(key) && 
            value !== "unknown" && value !== null) {
          
          const numValue = parseFloat(String(value));
          if (!isNaN(numValue) && numValue > 0) {
            if (!metricsUpdate.metrics) metricsUpdate.metrics = {};
            (metricsUpdate.metrics as Record<string, string>)[key] = String(numValue);
            console.log(`[线程 ${threadIndex+1}] AI提供的其他指标 ${key}: ${numValue}`);
            validMetricsFound = true;
          }
        }
      }
      
      // 添加来源信息
      if (validMetricsFound) {
        if (!metricsUpdate.metrics) metricsUpdate.metrics = {};
        (metricsUpdate.metrics as Record<string, string>)['dataSource'] = 'AI-assisted';
      }
      
      return validMetricsFound;
      
    } catch (parseError) {
      console.error(`[线程 ${threadIndex+1}] 解析AI响应时出错: ${parseError}`);
      return false;
    }
    
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`[线程 ${threadIndex+1}] 使用AI API查询过程中出错: ${errorMsg}`);
    return false;
  }
}

/**
 * 在HTML中查找指标
 */
function findMetricByKeywords(
  $: cheerio.CheerioAPI, 
  metricKey: string, 
  keywords: string[], 
  metricsUpdate: Partial<InsertMetric>, 
  threadIndex: number, 
  coinName: string
): boolean {
  let found = false;
  
  // 先尝试使用语义化查找（基于HTML结构和类名）
  if (metricKey === 'activeAddresses') {
    const selectors = [
      '[data-metric="active-addresses"]', 
      '.active-addresses', 
      '#active-addresses',
      '[data-stat="addresses"]',
      '.addresses-stat'
    ];
    
    for (const selector of selectors) {
      const element = $(selector);
      if (element.length > 0) {
        const text = element.text().trim();
        const value = parseNumberWithUnits(text);
        if (value !== null && value > 0) {
          metricsUpdate.activeAddresses = value;
          console.log(`[线程 ${threadIndex+1}] 通过选择器 ${selector} 找到 ${coinName} 活跃地址数: ${value}`);
          found = true;
          break;
        }
      }
    }
  }
  
  // 如果语义化查找失败，尝试关键词匹配
  if (!found) {
    $('body').find('*').each((_, element) => {
      const text = $(element).text().toLowerCase();
      
      for (const keyword of keywords) {
        if (text.includes(keyword)) {
          // 寻找数字 - 首先检查当前元素
          const selfText = $(element).text().trim();
          let numberMatch = selfText.match(/[\d,\.]+[KkMmBbTt]?/);
          
          // 如果当前元素没有找到数字，检查父元素
          if (!numberMatch) {
            const parentText = $(element).parent().text().trim();
            numberMatch = parentText.match(/[\d,\.]+[KkMmBbTt]?/);
          }
          
          // 如果父元素没有找到数字，检查下一个同级元素
          if (!numberMatch) {
            const nextText = $(element).next().text().trim();
            numberMatch = nextText.match(/[\d,\.]+[KkMmBbTt]?/);
          }
          
          if (numberMatch) {
            const value = parseNumberWithUnits(numberMatch[0]);
            if (value !== null && value > 0) {
              updateMetricValue(metricsUpdate, metricKey, value, threadIndex, coinName);
              found = true;
              return false; // 中断each循环
            }
          }
        }
      }
    });
  }
  
  return found;
}

/**
 * 更新指标值
 */
function updateMetricValue(
  metricsUpdate: Partial<InsertMetric>, 
  metricKey: string, 
  value: number, 
  threadIndex: number, 
  coinName: string
): void {
  switch (metricKey) {
    case 'activeAddresses':
      metricsUpdate.activeAddresses = value;
      console.log(`[线程 ${threadIndex+1}] 提取到 ${coinName} 活跃地址数: ${value}`);
      break;
    case 'totalTransactions':
      metricsUpdate.totalTransactions = value;
      console.log(`[线程 ${threadIndex+1}] 提取到 ${coinName} 总交易数: ${value}`);
      break;
    case 'hashrate':
      metricsUpdate.hashrate = String(value);  // 转换为字符串以匹配模式
      console.log(`[线程 ${threadIndex+1}] 提取到 ${coinName} 算力/质押量: ${value}`);
      break;
    case 'transactionsPerSecond':
      metricsUpdate.transactionsPerSecond = value;
      console.log(`[线程 ${threadIndex+1}] 提取到 ${coinName} 每秒交易数: ${value}`);
      break;
    default:
      // 存储其他发现的指标
      if (!metricsUpdate.metrics) metricsUpdate.metrics = {};
      (metricsUpdate.metrics as Record<string, string>)[metricKey] = String(value);
      console.log(`[线程 ${threadIndex+1}] 提取到 ${coinName} 其他指标 ${metricKey}: ${value}`);
  }
}

/**
 * 根据币种名称和符号获取特定的指标关键词
 */
function getMetricsKeywords(coinName: string, symbol: string): Record<string, string[]> {
  // 通用指标关键词
  const genericKeywords = {
    activeAddresses: ['active addresses', 'active accounts', 'unique addresses', 'accounts', 'wallets', 'addresses'],
    totalTransactions: ['total transactions', 'transaction count', 'tx count', 'transactions', 'txns'],
    hashrate: ['hashrate', 'hash rate', 'network hash rate', 'total stake', 'staked', 'validators'],
    transactionsPerSecond: ['tps', 'transactions per second', 'tx/s', 'network speed'],
    totalBlocks: ['blocks', 'block height', 'total blocks'],
    totalValidators: ['validators', 'nodes', 'active validators', 'stake pools'],
    circulatingSupply: ['circulating', 'supply', 'total supply', 'current supply']
  };
  
  // 基于币种的特定关键词
  switch (coinName) {
    case 'Bitcoin':
      return {
        activeAddresses: [...genericKeywords.activeAddresses, 'btc addresses', 'bitcoin wallets'],
        totalTransactions: [...genericKeywords.totalTransactions, 'bitcoin transactions', 'btc tx'],
        hashrate: [...genericKeywords.hashrate, 'btc hashrate', 'mining power', 'bitcoin network power'],
        transactionsPerSecond: [...genericKeywords.transactionsPerSecond, 'bitcoin tps'],
        totalBlocks: [...genericKeywords.totalBlocks, 'bitcoin blocks', 'block height'],
        difficulty: ['difficulty', 'mining difficulty', 'network difficulty']
      };
      
    case 'Ethereum':
      return {
        activeAddresses: [...genericKeywords.activeAddresses, 'eth addresses', 'ethereum wallets'],
        totalTransactions: [...genericKeywords.totalTransactions, 'ethereum transactions', 'eth tx'],
        hashrate: [...genericKeywords.hashrate, 'eth hashrate', 'eth stake', 'total eth staked'],
        transactionsPerSecond: [...genericKeywords.transactionsPerSecond, 'ethereum tps'],
        totalBlocks: [...genericKeywords.totalBlocks, 'ethereum blocks'],
        gasPrice: ['gas price', 'average gas', 'gas fee'],
        totalContracts: ['smart contracts', 'total contracts', 'deployed contracts']
      };
      
    case 'XRP':
      return {
        activeAddresses: [...genericKeywords.activeAddresses, 'xrp accounts', 'ripple accounts'],
        totalTransactions: [...genericKeywords.totalTransactions, 'xrp transactions', 'ledger transactions'],
        transactionsPerSecond: [...genericKeywords.transactionsPerSecond, 'xrp tps', 'ripple tps'],
        totalBlocks: ['ledger count', 'total ledgers', 'ledger index'],
        totalValidators: ['xrp validators', 'ripple validators', 'unique nodes'],
        reserveRequirement: ['reserve', 'account reserve', 'xrp reserve']
      };
      
    case 'Solana':
      return {
        activeAddresses: [...genericKeywords.activeAddresses, 'sol accounts', 'solana wallets'],
        totalTransactions: [...genericKeywords.totalTransactions, 'sol transactions', 'solana tx'],
        hashrate: ['stake', 'staked sol', 'total stake', 'sol stake'],
        transactionsPerSecond: [...genericKeywords.transactionsPerSecond, 'solana tps', 'sol tps'],
        epochInfo: ['epoch', 'current epoch', 'epoch progress'],
        slotCount: ['slot', 'slot height', 'current slot']
      };
      
    case 'Cardano':
      return {
        activeAddresses: [...genericKeywords.activeAddresses, 'ada addresses', 'cardano wallets'],
        totalTransactions: [...genericKeywords.totalTransactions, 'ada transactions', 'cardano tx'],
        hashrate: ['stake pools', 'total stake', 'staked ada', 'pledge'],
        transactionsPerSecond: [...genericKeywords.transactionsPerSecond, 'cardano tps', 'ada tps'],
        epochInfo: ['epoch', 'current epoch', 'epoch progress'],
        totalStakePools: ['stake pools', 'active pools', 'registered pools']
      };
      
    default:
      // For any other coin, add symbol-specific keywords to the generic ones
      const lowerSymbol = symbol.toLowerCase();
      return {
        activeAddresses: [...genericKeywords.activeAddresses, `${lowerSymbol} addresses`, `${lowerSymbol} accounts`],
        totalTransactions: [...genericKeywords.totalTransactions, `${lowerSymbol} transactions`],
        hashrate: genericKeywords.hashrate,
        transactionsPerSecond: [...genericKeywords.transactionsPerSecond, `${lowerSymbol} tps`],
        totalBlocks: genericKeywords.totalBlocks,
        totalValidators: genericKeywords.totalValidators
      };
  }
}