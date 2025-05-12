/**
 * 专门的链上指标恢复模块
 * 
 * 从排名第一位开始按顺序修复数据库中所有币种的metrics指标缺失问题
 * 优先处理主流币种(Bitcoin, Ethereum等)，使用多种数据源和解析策略
 */

import { storage } from '../storage';
import * as cheerio from 'cheerio';
import https from 'https';
import { InsertMetric, Cryptocurrency } from '@shared/schema';

// 配置信息
const CONFIG = {
  BATCH_SIZE: 50,            // 每次处理的币种数量
  THREAD_COUNT: 5,           // 并行处理线程数
  TIMEOUT_MS: 10000,         // 请求超时时间
  RETRY_COUNT: 3,            // 请求重试次数
  DELAY_BETWEEN_REQUESTS: 1000, // 请求间隔时间(毫秒)
};

// 主流币种特定的数据爬取策略
interface CoinStrategy {
  name: string;
  symbol: string;
  explorerURLs: string[];  // 按优先级排序的浏览器URL列表
  dataSelectors: {         // CSS选择器或文本匹配模式
    activeAddresses?: string[];
    totalTransactions?: string[];
    hashrate?: string[];
    transactionsPerSecond?: string[];
    [key: string]: string[] | undefined;
  };
  apiEndpoints?: string[]; // 备用API端点
  keywords: {              // 特定的关键词匹配
    activeAddresses: string[];
    totalTransactions: string[];
    hashrate: string[];
    transactionsPerSecond: string[];
    [key: string]: string[];
  };
}

// 主流币种的特定爬取策略
const COIN_STRATEGIES: CoinStrategy[] = [
  {
    name: "Bitcoin",
    symbol: "BTC",
    explorerURLs: [
      "https://blockchair.com/bitcoin",
      "https://blockchain.com/explorer",
      "https://live.blockcypher.com/btc/",
      "https://www.blockchain.com/explorer/assets/btc"
    ],
    dataSelectors: {
      activeAddresses: ['.active-addresses', '[data-metrics="active-addresses"]'],
      totalTransactions: ['.total-transactions', '[data-metrics="transactions"]'],
      hashrate: ['.hashrate', '[data-metrics="hashrate"]'],
      transactionsPerSecond: ['.transactions-per-second', '[data-metrics="tps"]']
    },
    keywords: {
      activeAddresses: ['active addresses', 'active wallets', 'unique addresses', 'daily active addresses'],
      totalTransactions: ['total transactions', 'transaction count', 'tx count', 'number of transactions'],
      hashrate: ['hashrate', 'hash rate', 'network hashrate', 'mining power', 'total hashpower'],
      transactionsPerSecond: ['tps', 'transactions per second', 'tx/s', 'tx per second']
    }
  },
  {
    name: "Ethereum",
    symbol: "ETH",
    explorerURLs: [
      "https://etherscan.io/",
      "https://blockchair.com/ethereum",
      "https://ethplorer.io/",
      "https://etherchain.org/"
    ],
    dataSelectors: {
      activeAddresses: ['.unique-addresses', '[data-metrics="addresses"]'],
      totalTransactions: ['.transactions-count', '[data-metrics="txs"]'],
      hashrate: ['.network-hashrate', '[data-metrics="hashrate"]'],
      transactionsPerSecond: ['.tps-counter', '[data-metrics="tps"]']
    },
    keywords: {
      activeAddresses: ['unique addresses', 'active accounts', 'distinct addresses', 'total accounts'],
      totalTransactions: ['transactions', 'transaction count', 'txn count', 'total transactions'],
      hashrate: ['hashrate', 'hash rate', 'network hashrate', 'network health'],
      transactionsPerSecond: ['tps', 'transactions per second', 'tx per second', 'network speed']
    }
  },
  {
    name: "Solana",
    symbol: "SOL",
    explorerURLs: [
      "https://solscan.io/",
      "https://explorer.solana.com/",
      "https://solanabeach.io/",
      "https://solanafm.com/"
    ],
    dataSelectors: {
      activeAddresses: ['.accounts-stat', '[data-metrics="accounts"]'],
      totalTransactions: ['.tx-count', '[data-metrics="transactions"]'],
      hashrate: ['.stake-stat', '[data-metrics="stake"]'],
      transactionsPerSecond: ['.tps-stat', '[data-metrics="tps"]']
    },
    keywords: {
      activeAddresses: ['accounts', 'wallets', 'active accounts', 'unique accounts', 'unique wallets', 'holders', 'total accounts'],
      totalTransactions: ['transactions', 'tx count', 'total tx', 'total transactions', 'txns'],
      hashrate: ['stake', 'staked sol', 'total stake', 'staked tokens', 'total staked'],
      transactionsPerSecond: ['tps', 'transactions per second', 'tx/s', 'current tps', 'network throughput']
    }
  },
  {
    name: "XRP",
    symbol: "XRP",
    explorerURLs: [
      "https://xrpscan.com/",
      "https://bithomp.com/explorer/",
      "https://xrpcharts.ripple.com/"
    ],
    dataSelectors: {
      activeAddresses: ['.active-accounts', '[data-stat="accounts"]'],
      totalTransactions: ['.tx-total', '[data-stat="transactions"]'],
      transactionsPerSecond: ['.tps-stat', '[data-stat="tps"]']
    },
    keywords: {
      activeAddresses: ['active accounts', 'unique addresses', 'wallet count', 'accounts'],
      totalTransactions: ['total transactions', 'transaction count', 'txn count'],
      hashrate: ['validators', 'total validators', 'consensus nodes'],
      transactionsPerSecond: ['tps', 'tx per second', 'transactions per second']
    }
  },
  {
    name: "Cardano",
    symbol: "ADA",
    explorerURLs: [
      "https://cardanoscan.io/",
      "https://explorer.cardano.org/",
      "https://adastat.net/",
      "https://adaex.org/"
    ],
    dataSelectors: {
      activeAddresses: ['.addresses-stat', '[data-cardano="addresses"]'],
      totalTransactions: ['.transactions-stat', '[data-cardano="transactions"]'],
      transactionsPerSecond: ['.tps-stat', '[data-cardano="tps"]']
    },
    keywords: {
      activeAddresses: ['addresses', 'active wallets', 'unique wallets', 'wallet quantity'],
      totalTransactions: ['transactions', 'tx count', 'transactions count'],
      hashrate: ['stake pools', 'total pools', 'stake amount', 'total stake'],
      transactionsPerSecond: ['tps', 'transactions per second', 'network speed']
    }
  },
  // 可以添加更多币种的配置...
];

/**
 * 安全地获取网页内容
 */
function makeHttpsRequest(url: string, timeoutMs = CONFIG.TIMEOUT_MS): Promise<string> {
  return new Promise((resolve, reject) => {
    const request = https.get(url, { timeout: timeoutMs }, (response) => {
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
 * 尝试从各个来源获取币种的链上指标数据
 */
async function recoverMetricsForCoin(crypto: Cryptocurrency, threadIndex: number): Promise<boolean> {
  console.log(`[线程 ${threadIndex+1}] 正在恢复 ${crypto.name} (${crypto.symbol}) [排名: ${crypto.rank || 'N/A'}] 的链上指标数据...`);
  
  // 首先检查是否已有指标数据
  const existingMetrics = await storage.getMetrics(crypto.id);
  let metricsFound = false;
  
  // 1. 检查是否有币种特定的策略
  const specificStrategy = COIN_STRATEGIES.find(
    s => s.name === crypto.name || s.symbol === crypto.symbol
  );
  
  // 2. 尝试从区块链浏览器获取数据
  // 首先获取该币种所有已知的浏览器URL
  const explorerUrls: string[] = [];
  
  // 添加策略中的浏览器URL
  if (specificStrategy) {
    explorerUrls.push(...specificStrategy.explorerURLs);
  }
  
  // 添加数据库中记录的浏览器URL
  const dbExplorers = await storage.getBlockchainExplorers(crypto.id);
  for (const explorer of dbExplorers) {
    if (!explorerUrls.includes(explorer.url)) {
      explorerUrls.push(explorer.url);
    }
  }
  
  // 如果没有找到任何浏览器URL，尝试通过官方网站或查询常见区块链浏览器URL
  if (explorerUrls.length === 0 && crypto.officialWebsite) {
    console.log(`[线程 ${threadIndex+1}] 没有找到区块链浏览器URL，尝试使用官方网站: ${crypto.officialWebsite}`);
    explorerUrls.push(crypto.officialWebsite);
    
    // 添加基于币名的通用浏览器URL
    const symbol = crypto.symbol.toLowerCase();
    const commonUrls = [
      `https://${symbol}scan.io`,
      `https://${symbol}explorer.com`,
      `https://${symbol}chain.com`,
      `https://explorer.${symbol}.org`,
      `https://scan.${symbol}.org`
    ];
    
    explorerUrls.push(...commonUrls);
  }
  
  // 3. 尝试每个URL
  for (const url of explorerUrls) {
    try {
      console.log(`[线程 ${threadIndex+1}] 尝试从 ${url} 提取 ${crypto.name} 的指标数据...`);
      
      // 重试机制
      let html = '';
      let success = false;
      
      for (let attempt = 1; attempt <= CONFIG.RETRY_COUNT && !success; attempt++) {
        try {
          html = await makeHttpsRequest(url);
          success = true;
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          if (attempt < CONFIG.RETRY_COUNT) {
            console.log(`[线程 ${threadIndex+1}] 尝试 #${attempt} 失败: ${errorMsg}，正在重试...`);
            // 增加延迟避免连续失败
            await new Promise(resolve => setTimeout(resolve, CONFIG.DELAY_BETWEEN_REQUESTS * attempt));
          } else {
            console.log(`[线程 ${threadIndex+1}] 无法获取 ${url} 的内容: ${errorMsg}`);
          }
        }
      }
      
      if (!success) continue;
      
      // 收集找到的指标
      const metricsUpdate: Partial<InsertMetric> = {
        metrics: {} // 存储其他发现的指标
      };
      
      const $ = cheerio.load(html);
      
      // 使用特定币种的选择器
      if (specificStrategy) {
        console.log(`[线程 ${threadIndex+1}] 使用特定策略提取 ${crypto.name} 指标...`);
        
        // 使用CSS选择器
        for (const [metricKey, selectors] of Object.entries(specificStrategy.dataSelectors || {})) {
          if (!selectors) continue;
          
          for (const selector of selectors) {
            const elements = $(selector);
            if (elements.length > 0) {
              const text = elements.first().text().trim();
              const value = parseNumberWithUnits(text);
              
              if (value !== null) {
                updateMetricValue(metricsUpdate, metricKey, value, threadIndex, crypto.name);
                metricsFound = true;
                break; // 找到一个有效值就停止
              }
            }
          }
        }
        
        // 关键词搜索
        if (!metricsFound) {
          for (const [metricKey, keywords] of Object.entries(specificStrategy.keywords)) {
            findMetricByKeywords($, metricKey, keywords, metricsUpdate, threadIndex, crypto.name);
          }
        }
      }
      
      // 通用指标搜索 - 即使有特定策略也执行
      const genericKeywords = {
        activeAddresses: ['active addresses', 'active accounts', 'unique addresses', 'accounts', 'wallets', 'addresses'],
        totalTransactions: ['total transactions', 'transaction count', 'tx count', 'transactions', 'txns'],
        hashrate: ['hashrate', 'hash rate', 'network hash rate', 'total stake', 'staked', 'validators'],
        transactionsPerSecond: ['tps', 'transactions per second', 'tx/s'],
        totalBlocks: ['blocks', 'block height', 'total blocks'],
        totalValidators: ['validators', 'nodes', 'active validators', 'stake pools'],
        circulatingSupply: ['circulating', 'supply', 'total supply', 'current supply']
      };
      
      for (const [metricKey, keywords] of Object.entries(genericKeywords)) {
        findMetricByKeywords($, metricKey, keywords, metricsUpdate, threadIndex, crypto.name);
      }
      
      // 如果找到了任何指标数据，更新数据库
      if (Object.keys(metricsUpdate).length > 1 || Object.keys(metricsUpdate.metrics || {}).length > 0) {
        if (existingMetrics) {
          // 更新现有指标
          await storage.updateMetrics(existingMetrics.id, metricsUpdate);
        } else {
          // 创建新指标记录
          const fullMetrics: InsertMetric = {
            cryptocurrencyId: crypto.id,
            activeAddresses: metricsUpdate.activeAddresses || null,
            totalTransactions: metricsUpdate.totalTransactions || null,
            averageTransactionValue: null,
            hashrate: metricsUpdate.hashrate || null,
            transactionsPerSecond: metricsUpdate.transactionsPerSecond || null,
            metrics: metricsUpdate.metrics || {},
          };
          await storage.createMetrics(fullMetrics);
        }
        
        console.log(`[线程 ${threadIndex+1}] ✓ 成功从 ${url} 提取并更新 ${crypto.name} 的链上指标数据`);
        return true;
      }
    } catch (error) {
      console.error(`[线程 ${threadIndex+1}] 处理 ${url} 时出错:`, error);
    }
    
    // 请求间加入延迟，避免被限制
    await new Promise(resolve => setTimeout(resolve, CONFIG.DELAY_BETWEEN_REQUESTS));
  }
  
  console.log(`[线程 ${threadIndex+1}] 未能为 ${crypto.name} 恢复任何链上指标数据`);
  return false;
}

// 通过关键词在HTML中查找指标
function findMetricByKeywords($: cheerio.CheerioAPI, metricKey: string, keywords: string[], 
                             metricsUpdate: Partial<InsertMetric>, threadIndex: number, coinName: string): boolean {
  let found = false;
  
  $('body').find('*').each((_, element) => {
    const text = $(element).text().toLowerCase();
    
    for (const keyword of keywords) {
      if (text.includes(keyword)) {
        // 寻找数字
        const parentText = $(element).parent().text().trim();
        const numberMatch = parentText.match(/[\d,\.]+[KkMmBbTt]?/);
        
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
  
  return found;
}

// 更新指标值
function updateMetricValue(metricsUpdate: Partial<InsertMetric>, metricKey: string, 
                         value: number, threadIndex: number, coinName: string): void {
  switch (metricKey) {
    case 'activeAddresses':
      metricsUpdate.activeAddresses = value;
      console.log(`[线程 ${threadIndex+1}]   提取到 ${coinName} 活跃地址数: ${value}`);
      break;
    case 'totalTransactions':
      metricsUpdate.totalTransactions = value;
      console.log(`[线程 ${threadIndex+1}]   提取到 ${coinName} 总交易数: ${value}`);
      break;
    case 'hashrate':
      metricsUpdate.hashrate = value;
      console.log(`[线程 ${threadIndex+1}]   提取到 ${coinName} 算力/质押量: ${value}`);
      break;
    case 'transactionsPerSecond':
      metricsUpdate.transactionsPerSecond = value;
      console.log(`[线程 ${threadIndex+1}]   提取到 ${coinName} 每秒交易数: ${value}`);
      break;
    default:
      // 存储其他发现的指标
      if (!metricsUpdate.metrics) metricsUpdate.metrics = {};
      (metricsUpdate.metrics as Record<string, string>)[metricKey] = String(value);
      console.log(`[线程 ${threadIndex+1}]   提取到 ${coinName} 其他指标 ${metricKey}: ${value}`);
  }
}

/**
 * 主函数：执行指标恢复
 */
export async function recoverMetricsForAllCoins(limit: number = CONFIG.BATCH_SIZE): Promise<number> {
  console.log(`开始为加密货币恢复链上指标数据 (多线程，优先处理排名前列币种)...`);
  let fixedCount = 0;
  
  try {
    // 获取所有排名前的加密货币
    const result = await storage.getCryptocurrencies(1, limit * 2, "rank", "asc");
    let cryptos = result.data;
    
    // 过滤掉没有rank值的币，然后添加到列表末尾
    const rankedCoins = cryptos.filter(c => c.rank !== null && c.rank > 0);
    const unrankedCoins = cryptos.filter(c => c.rank === null || c.rank === 0);
    
    // 按排名排序
    rankedCoins.sort((a, b) => {
      // 确保a和b的rank都不为null
      const rankA = a.rank || Infinity;
      const rankB = b.rank || Infinity;
      return rankA - rankB;
    });
    
    // 组合排序后的币种
    cryptos = [...rankedCoins, ...unrankedCoins];
    
    // 限制处理数量
    cryptos = cryptos.slice(0, limit);
    
    console.log(`准备处理 ${cryptos.length} 个加密货币的链上指标数据`);
    console.log("排序后的待处理币种（按优先级）:");
    cryptos.forEach((crypto, index) => {
      console.log(`${index + 1}. ${crypto.name} (${crypto.symbol}) - 排名: ${crypto.rank || '未知'}`);
    });
    
    // 计算并行线程数 - 根据可用处理能力动态调整
    const threadCount = Math.min(CONFIG.THREAD_COUNT, cryptos.length);
    console.log(`将使用 ${threadCount} 个并行线程进行处理`);
    
    // 将币种分配到不同的线程中
    const threadsItems = Array.from({ length: threadCount }, () => [] as Cryptocurrency[]);
    cryptos.forEach((crypto, index) => {
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
    fixedCount = results.reduce((total, count) => total + count, 0);
    
    console.log(`链上指标数据恢复完成。成功修复 ${fixedCount} 个币种的数据。`);
    return fixedCount;
    
  } catch (error) {
    console.error(`链上指标数据恢复过程中出错:`, error);
    return fixedCount;
  }
}

// 处理一批币种的指标数据恢复 - 在单个线程中执行
async function processMetricsBatch(items: Cryptocurrency[], threadIndex: number): Promise<number> {
  let successCount = 0;
  
  console.log(`[线程 ${threadIndex+1}] 开始处理 ${items.length} 个币种的链上指标数据`);
  
  for (const crypto of items) {
    try {
      const success = await recoverMetricsForCoin(crypto, threadIndex);
      if (success) {
        successCount++;
      }
      
      // 线程间隔，避免请求过于密集
      await new Promise(resolve => setTimeout(resolve, CONFIG.DELAY_BETWEEN_REQUESTS));
      
    } catch (error) {
      console.error(`[线程 ${threadIndex+1}] 处理币种 ${crypto.name} (ID: ${crypto.id}) 时出错:`, error);
    }
  }
  
  console.log(`[线程 ${threadIndex+1}] 完成处理，成功恢复 ${successCount} 个币种的链上指标数据`);
  return successCount;
}

// 在ES模块中不能使用__filename，直接导出函数供调度器使用
// 不再提供直接运行测试的功能