/**
 * 加密货币市场数据爬虫
 * 
 * 专注于从主流加密货币数据聚合网站获取基础信息:
 * - CoinMarketCap
 * - CoinGecko
 * - Crypto.com
 * 
 * 主要获取信息包括:
 * - 排名
 * - 市值
 * - 价格
 * - 24小时交易量
 * - 流通供应量
 * - 官方网站
 * - 区块链浏览器
 */

import * as cheerio from 'cheerio';
import https from 'https';
import { Cryptocurrency, InsertCryptocurrency } from '@shared/schema';
import { storage } from '../storage';
import { setTimeout } from 'timers/promises';

// 请求配置参数
const REQUEST_TIMEOUT = 30000; // 30秒
const RETRY_ATTEMPTS = 3;
const RETRY_DELAY = 2000; // 2秒
const MAX_CONCURRENT_REQUESTS = 5;
const PAGES_TO_SCRAPE = 10; // 每个网站爬取前10页，大约覆盖500-1000个币种

// 网站配置
const DATA_SOURCES = {
  COINMARKETCAP: {
    name: 'CoinMarketCap',
    baseUrl: 'https://coinmarketcap.com',
    paginationFormat: (page: number) => `https://coinmarketcap.com/?page=${page}`,
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
  },
  COINGECKO: {
    name: 'CoinGecko',
    baseUrl: 'https://www.coingecko.com',
    paginationFormat: (page: number) => `https://www.coingecko.com/en?page=${page}`,
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15'
  },
  CRYPTOCOM: {
    name: 'Crypto.com',
    baseUrl: 'https://crypto.com/price',
    paginationFormat: (page: number) => `https://crypto.com/price?page=${page}`,
    userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
  }
};

// 轮换请求头
const ROTATED_HEADERS = [
  {
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    'Referer': 'https://www.google.com/',
    'Sec-Ch-Ua': '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
    'Sec-Ch-Ua-Mobile': '?0',
    'Sec-Ch-Ua-Platform': '"Windows"',
    'Cache-Control': 'max-age=0',
    'Upgrade-Insecure-Requests': '1'
  },
  {
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-GB,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    'Referer': 'https://duckduckgo.com/',
    'Sec-Fetch-Site': 'none',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-User': '?1',
    'Sec-Fetch-Dest': 'document',
    'Pragma': 'no-cache'
  },
  {
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.5',
    'Accept-Encoding': 'gzip, deflate, br',
    'DNT': '1',
    'Connection': 'keep-alive',
    'Upgrade-Insecure-Requests': '1',
    'TE': 'Trailers'
  }
];

/**
 * 获取随机请求头
 */
function getRandomHeaders(source: string): Record<string, string> {
  const baseHeaders = ROTATED_HEADERS[Math.floor(Math.random() * ROTATED_HEADERS.length)];
  
  let userAgent = '';
  switch(source) {
    case 'CoinMarketCap':
      userAgent = DATA_SOURCES.COINMARKETCAP.userAgent;
      break;
    case 'CoinGecko':
      userAgent = DATA_SOURCES.COINGECKO.userAgent;
      break;
    case 'Crypto.com':
      userAgent = DATA_SOURCES.CRYPTOCOM.userAgent;
      break;
    default:
      userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
  }
  
  return {
    ...baseHeaders,
    'User-Agent': userAgent
  };
}

/**
 * 增强型HTTP请求函数
 */
async function fetchWithRetry(url: string, options: {
  source: string,
  timeout?: number,
  retries?: number
}): Promise<string> {
  const timeout = options.timeout || REQUEST_TIMEOUT;
  const maxRetries = options.retries || RETRY_ATTEMPTS;
  let retries = 0;
  
  while (retries < maxRetries) {
    try {
      return await new Promise<string>((resolve, reject) => {
        const req = https.get(url, {
          timeout,
          headers: getRandomHeaders(options.source)
        }, (res) => {
          // 处理重定向
          if (res.statusCode === 301 || res.statusCode === 302) {
            if (res.headers.location) {
              const redirectUrl = new URL(
                res.headers.location,
                res.headers.location.startsWith('http') ? undefined : url
              ).toString();
              console.log(`[${options.source}] 重定向到: ${redirectUrl}`);
              
              // 递归调用，但减少重试次数防止无限重定向
              fetchWithRetry(redirectUrl, { 
                source: options.source, 
                timeout, 
                retries: maxRetries - 1 
              })
                .then(resolve)
                .catch(reject);
              return;
            }
          }
          
          // 检查状态码
          if (res.statusCode !== 200) {
            reject(new Error(`HTTP Error: ${res.statusCode}`));
            return;
          }
          
          // 收集响应数据
          let data = '';
          res.on('data', (chunk) => {
            data += chunk;
          });
          
          res.on('end', () => {
            resolve(data);
          });
        });
        
        req.on('error', (err) => {
          reject(err);
        });
        
        req.on('timeout', () => {
          req.destroy();
          reject(new Error(`Request timeout after ${timeout}ms`));
        });
      });
    } catch (error) {
      retries++;
      console.error(`[${options.source}] 请求失败 (${retries}/${maxRetries}): ${url} - ${error}`);
      
      if (retries < maxRetries) {
        await setTimeout(RETRY_DELAY * retries); // 逐步增加延迟
        console.log(`[${options.source}] 重试请求: ${url}`);
      } else {
        throw error;
      }
    }
  }
  
  throw new Error(`Maximum retries exceeded for ${url}`);
}

/**
 * 解析带格式的数字文本
 * 例如: "$1.2B", "1,234.56", "$123.45M"
 */
function parseFormattedNumber(text: string | null): number | null {
  if (!text) return null;
  
  // 移除非数字字符，保留小数点
  let cleanText = text.replace(/[^0-9.]/g, '');
  
  // 确保只有一个小数点
  const parts = cleanText.split('.');
  if (parts.length > 2) {
    cleanText = parts[0] + '.' + parts.slice(1).join('');
  }
  
  // 尝试解析数字
  const num = parseFloat(cleanText);
  if (isNaN(num)) return null;
  
  // 应用单位倍数
  if (text.includes('T') || text.includes('t')) return num * 1_000_000_000_000;
  if (text.includes('B') || text.includes('b')) return num * 1_000_000_000;
  if (text.includes('M') || text.includes('m')) return num * 1_000_000;
  if (text.includes('K') || text.includes('k')) return num * 1_000;
  
  return num;
}

/**
 * 解析价格文本
 * 例如: "$1,234.56", "$0.0012"
 */
function parsePrice(text: string | null): number | null {
  if (!text) return null;
  
  // 移除货币符号和逗号，只保留数字和小数点
  const cleanText = text.replace(/[^0-9.]/g, '');
  
  // 尝试解析数字
  const price = parseFloat(cleanText);
  return isNaN(price) ? null : price;
}

/**
 * 从CoinMarketCap抓取数据
 */
async function scrapeCoinMarketCap(page: number): Promise<Partial<InsertCryptocurrency>[]> {
  const url = DATA_SOURCES.COINMARKETCAP.paginationFormat(page);
  console.log(`正在抓取CoinMarketCap第${page}页...`);
  
  try {
    const html = await fetchWithRetry(url, { source: 'CoinMarketCap' });
    const $ = cheerio.load(html);
    const results: Partial<InsertCryptocurrency>[] = [];
    
    // 查找币种表格
    $('.cmc-table tbody tr').each((index, element) => {
      try {
        // 排名
        const rank = parseInt($(element).find('td:nth-child(1)').text().trim());
        
        // 币种名称和符号
        const nameElement = $(element).find('td:nth-child(2) .crypto-symbol');
        const name = nameElement.text().trim();
        
        // 符号通常在名称旁边的括号内
        const symbolMatch = $(element).find('td:nth-child(2)').text().match(/\(([^)]+)\)/);
        const symbol = symbolMatch ? symbolMatch[1].trim() : '';
        
        // 获取价格
        const priceText = $(element).find('td:nth-child(3)').text().trim();
        const price = parsePrice(priceText);
        
        // 24小时百分比变化
        const priceChange24hText = $(element).find('td:nth-child(4)').text().trim();
        const priceChange24h = parseFormattedNumber(priceChange24hText);
        
        // 市值
        const marketCapText = $(element).find('td:nth-child(6)').text().trim();
        const marketCap = parseFormattedNumber(marketCapText);
        
        // 交易量
        const volumeText = $(element).find('td:nth-child(7)').text().trim();
        const volume24h = parseFormattedNumber(volumeText);
        
        // 获取详情页URL以后提取更多信息
        const detailUrl = $(element).find('td:nth-child(2) a').attr('href');
        
        if (name && symbol && marketCap && rank) {
          results.push({
            name,
            symbol,
            rank,
            marketCap,
            price: price || undefined,
            priceChange24h: priceChange24h || undefined,
            volume24h: volume24h || undefined,
            officialWebsite: undefined, // 需要从详情页获取
            source: 'CoinMarketCap'
          });
        }
      } catch (err) {
        console.error(`从CoinMarketCap解析币种时出错:`, err);
      }
    });
    
    console.log(`从CoinMarketCap第${page}页找到${results.length}个币种`);
    return results;
  } catch (error) {
    console.error(`抓取CoinMarketCap第${page}页时出错:`, error);
    return [];
  }
}

/**
 * 从CoinGecko抓取数据
 */
async function scrapeCoinGecko(page: number): Promise<Partial<InsertCryptocurrency>[]> {
  const url = DATA_SOURCES.COINGECKO.paginationFormat(page);
  console.log(`正在抓取CoinGecko第${page}页...`);
  
  try {
    const html = await fetchWithRetry(url, { source: 'CoinGecko' });
    const $ = cheerio.load(html);
    const results: Partial<InsertCryptocurrency>[] = [];
    
    // CoinGecko的表格结构
    $('table.coingecko-table tbody tr').each((index, element) => {
      try {
        // 排名
        const rank = parseInt($(element).find('td:nth-child(1) .table-number').text().trim());
        
        // 币种名称和符号
        const name = $(element).find('td:nth-child(2) .tw-hidden').text().trim();
        const symbol = $(element).find('td:nth-child(2) .d-lg-inline').text().trim();
        
        // 价格
        const priceText = $(element).find('td:nth-child(3) span').text().trim();
        const price = parsePrice(priceText);
        
        // 24小时百分比变化
        const priceChange24hText = $(element).find('td:nth-child(4)').text().trim();
        const priceChange24h = parseFormattedNumber(priceChange24hText);
        
        // 市值
        const marketCapText = $(element).find('td:nth-child(8)').text().trim();
        const marketCap = parseFormattedNumber(marketCapText);
        
        // 交易量
        const volumeText = $(element).find('td:nth-child(9)').text().trim();
        const volume24h = parseFormattedNumber(volumeText);
        
        // 获取详情页链接
        const detailUrl = $(element).find('td:nth-child(2) a').attr('href');
        
        if (name && symbol && (marketCap || rank)) {
          results.push({
            name,
            symbol,
            rank: rank || undefined,
            marketCap: marketCap || undefined,
            price: price || undefined,
            priceChange24h: priceChange24h || undefined,
            volume24h: volume24h || undefined,
            officialWebsite: undefined, // 需要从详情页获取
            source: 'CoinGecko'
          });
        }
      } catch (err) {
        console.error(`从CoinGecko解析币种时出错:`, err);
      }
    });
    
    console.log(`从CoinGecko第${page}页找到${results.length}个币种`);
    return results;
  } catch (error) {
    console.error(`抓取CoinGecko第${page}页时出错:`, error);
    return [];
  }
}

/**
 * 从Crypto.com抓取数据
 */
async function scrapeCryptoCom(page: number): Promise<Partial<InsertCryptocurrency>[]> {
  const url = DATA_SOURCES.CRYPTOCOM.paginationFormat(page);
  console.log(`正在抓取Crypto.com第${page}页...`);
  
  try {
    const html = await fetchWithRetry(url, { source: 'Crypto.com' });
    const $ = cheerio.load(html);
    const results: Partial<InsertCryptocurrency>[] = [];
    
    // Crypto.com的表格结构
    $('.css-1cxc880').each((index, element) => {
      try {
        // 排名
        const rank = parseInt($(element).find('.css-1nh9lk8').text().trim());
        
        // 币种名称和符号
        const name = $(element).find('.chakra-text.css-1jj7b1a').text().trim();
        const symbol = $(element).find('.chakra-text.css-ft1qn5').text().trim();
        
        // 价格
        const priceText = $(element).find('.css-b1ilzc').text().trim();
        const price = parsePrice(priceText);
        
        // 24小时百分比变化
        const priceChange24hText = $(element).find('.css-1b7j986').text().trim();
        const priceChange24h = parseFormattedNumber(priceChange24hText);
        
        // 市值
        const marketCapText = $(element).find('.css-1nh9lk8:nth-child(3)').text().trim();
        const marketCap = parseFormattedNumber(marketCapText);
        
        // 获取详情页链接
        const detailUrl = $(element).find('a').attr('href');
        
        if (name && symbol && (marketCap || rank)) {
          results.push({
            name,
            symbol,
            rank: rank || undefined,
            marketCap: marketCap || undefined,
            price: price || undefined,
            priceChange24h: priceChange24h || undefined,
            officialWebsite: undefined, // 需要从详情页获取
            source: 'Crypto.com'
          });
        }
      } catch (err) {
        console.error(`从Crypto.com解析币种时出错:`, err);
      }
    });
    
    console.log(`从Crypto.com第${page}页找到${results.length}个币种`);
    return results;
  } catch (error) {
    console.error(`抓取Crypto.com第${page}页时出错:`, error);
    return [];
  }
}

/**
 * 从币种详情页获取额外信息
 * 这里主要获取官方网站和区块链浏览器
 */
async function getAdditionalInfo(cryptoData: Partial<InsertCryptocurrency>, source: string): Promise<Partial<InsertCryptocurrency>> {
  // 根据数据来源确定详情页URL格式
  let detailUrl = '';
  
  switch (source) {
    case 'CoinMarketCap':
      detailUrl = `${DATA_SOURCES.COINMARKETCAP.baseUrl}/currencies/${cryptoData.name?.toLowerCase().replace(/\s+/g, '-')}`;
      break;
    case 'CoinGecko':
      detailUrl = `${DATA_SOURCES.COINGECKO.baseUrl}/en/coins/${cryptoData.name?.toLowerCase().replace(/\s+/g, '-')}`;
      break;
    case 'Crypto.com':
      detailUrl = `${DATA_SOURCES.CRYPTOCOM.baseUrl}/${cryptoData.name?.toLowerCase().replace(/\s+/g, '-')}`;
      break;
    default:
      return cryptoData;
  }
  
  try {
    const html = await fetchWithRetry(detailUrl, { source });
    const $ = cheerio.load(html);
    
    // 根据数据来源设置不同的选择器
    let officialWebsiteSelector = '';
    let explorerSelector = '';
    
    switch (source) {
      case 'CoinMarketCap':
        officialWebsiteSelector = '.cmc-link-button.link-button';
        explorerSelector = '.link-button:contains("Explorer")';
        break;
      case 'CoinGecko':
        officialWebsiteSelector = '.link-button:contains("Website")';
        explorerSelector = '.link-button:contains("Explorer")';
        break;
      case 'Crypto.com':
        officialWebsiteSelector = 'a:contains("Website")';
        explorerSelector = 'a:contains("Explorer")';
        break;
    }
    
    // 查找官方网站
    const officialWebsite = $(officialWebsiteSelector).attr('href');
    if (officialWebsite) {
      cryptoData.officialWebsite = officialWebsite;
    }
    
    // 找到区块链浏览器
    const explorerUrl = $(explorerSelector).attr('href');
    if (explorerUrl) {
      // 这里仅记录URL，区块链浏览器的创建将由其他任务负责
      cryptoData.explorerUrl = explorerUrl;
    }
    
    return cryptoData;
  } catch (error) {
    console.error(`获取${cryptoData.name}详情页信息时出错:`, error);
    return cryptoData;
  }
}

/**
 * 并行爬取指定数量的页面
 */
async function scrapeAllPages(): Promise<Partial<InsertCryptocurrency>[]> {
  const allResults: Partial<InsertCryptocurrency>[] = [];
  
  // 为每个数据源创建爬取任务
  const scrapingTasks = [];
  
  // CoinMarketCap
  for (let page = 1; page <= PAGES_TO_SCRAPE; page++) {
    scrapingTasks.push(async () => {
      await setTimeout(page * 500); // 错开请求
      return scrapeCoinMarketCap(page);
    });
  }
  
  // CoinGecko
  for (let page = 1; page <= PAGES_TO_SCRAPE; page++) {
    scrapingTasks.push(async () => {
      await setTimeout(page * 500 + 1000); // 错开请求
      return scrapeCoinGecko(page);
    });
  }
  
  // Crypto.com
  for (let page = 1; page <= PAGES_TO_SCRAPE; page++) {
    scrapingTasks.push(async () => {
      await setTimeout(page * 500 + 2000); // 错开请求
      return scrapeCryptoCom(page);
    });
  }
  
  // 限制并发请求数
  const results = [];
  const chunks = [];
  const chunkSize = MAX_CONCURRENT_REQUESTS;
  
  // 分块执行
  for (let i = 0; i < scrapingTasks.length; i += chunkSize) {
    chunks.push(scrapingTasks.slice(i, i + chunkSize));
  }
  
  for (const chunk of chunks) {
    const chunkResults = await Promise.allSettled(chunk.map(task => task()));
    
    for (const result of chunkResults) {
      if (result.status === 'fulfilled') {
        results.push(...result.value);
      }
    }
    
    // 在块之间添加一些延迟
    await setTimeout(3000);
  }
  
  return results;
}

/**
 * 去重和合并数据
 */
function deduplicateAndMerge(cryptoList: Partial<InsertCryptocurrency>[]): Partial<InsertCryptocurrency>[] {
  const mergedMap = new Map<string, Partial<InsertCryptocurrency>>();
  
  for (const crypto of cryptoList) {
    if (!crypto.symbol || !crypto.name) continue;
    
    const key = crypto.symbol.toUpperCase();
    
    if (mergedMap.has(key)) {
      const existing = mergedMap.get(key)!;
      
      // 保留最高的排名
      if (crypto.rank && (!existing.rank || crypto.rank < existing.rank)) {
        existing.rank = crypto.rank;
      }
      
      // 合并信息，优先考虑已有非空值
      existing.marketCap = existing.marketCap || crypto.marketCap;
      existing.price = existing.price || crypto.price;
      existing.priceChange24h = existing.priceChange24h || crypto.priceChange24h;
      existing.volume24h = existing.volume24h || crypto.volume24h;
      existing.officialWebsite = existing.officialWebsite || crypto.officialWebsite;
      existing.explorerUrl = existing.explorerUrl || crypto.explorerUrl;
      
      // 记录数据来源
      if (existing.source && crypto.source && existing.source !== crypto.source) {
        existing.source = `${existing.source},${crypto.source}`;
      }
    } else {
      mergedMap.set(key, { ...crypto });
    }
  }
  
  return Array.from(mergedMap.values());
}

/**
 * 根据抓取数据更新数据库
 */
async function updateDatabase(cryptoList: Partial<InsertCryptocurrency>[]): Promise<{
  added: number;
  updated: number;
  skipped: number;
}> {
  let added = 0;
  let updated = 0;
  let skipped = 0;
  
  for (const crypto of cryptoList) {
    try {
      // 检查是否已存在同名或同符号的加密货币
      let existingCrypto: Cryptocurrency | undefined;
      
      // 使用符号进行匹配，如果符号相同，很可能是同一个币种
      if (crypto.symbol) {
        const matchingCryptos = await storage.searchCryptocurrencies(crypto.symbol);
        
        // 尝试在搜索结果中找到完全符号匹配的
        existingCrypto = matchingCryptos.find(c => 
          c.symbol.toUpperCase() === crypto.symbol?.toUpperCase()
        );
      }
      
      if (existingCrypto) {
        // 已存在，更新值
        const updateData: Partial<InsertCryptocurrency> = {};
        
        // 只更新非空值
        if (crypto.rank !== undefined) updateData.rank = crypto.rank;
        if (crypto.marketCap !== undefined) updateData.marketCap = crypto.marketCap;
        if (crypto.price !== undefined) updateData.price = crypto.price;
        if (crypto.priceChange24h !== undefined) updateData.priceChange24h = crypto.priceChange24h;
        if (crypto.volume24h !== undefined) updateData.volume24h = crypto.volume24h;
        
        // 只在现有值为空时更新网站
        if (crypto.officialWebsite && !existingCrypto.officialWebsite) {
          updateData.officialWebsite = crypto.officialWebsite;
        }
        
        // 有真实数据才更新
        if (Object.keys(updateData).length > 0) {
          await storage.updateCryptocurrency(existingCrypto.id, updateData);
          updated++;
          
          console.log(`更新了 ${existingCrypto.name} (${existingCrypto.symbol}) 的市场数据`);
          
          // 如果有区块链浏览器URL，创建或更新区块链浏览器记录
          if (crypto.explorerUrl) {
            const explorers = await storage.getBlockchainExplorers(existingCrypto.id);
            
            // 检查是否已存在此浏览器
            const explorerExists = explorers.some(e => e.url === crypto.explorerUrl);
            
            if (!explorerExists) {
              await storage.createBlockchainExplorer({
                cryptocurrencyId: existingCrypto.id,
                url: crypto.explorerUrl,
                name: `${existingCrypto.name} Explorer`,
                isPrimary: explorers.length === 0 // 如果是第一个浏览器，设为主要
              });
              
              console.log(`为 ${existingCrypto.name} 添加了区块链浏览器 ${crypto.explorerUrl}`);
            }
          }
        } else {
          skipped++;
        }
      } else if (crypto.name && crypto.symbol) {
        // 创建新加密货币
        const newCrypto: InsertCryptocurrency = {
          name: crypto.name,
          symbol: crypto.symbol,
          rank: crypto.rank || null,
          marketCap: crypto.marketCap || null,
          price: crypto.price || null,
          priceChange24h: crypto.priceChange24h || null,
          volume24h: crypto.volume24h || null,
          officialWebsite: crypto.officialWebsite || null,
          logoUrl: null,
          source: crypto.source || 'MarketDataScraper'
        };
        
        const createdCrypto = await storage.createCryptocurrency(newCrypto);
        added++;
        
        console.log(`添加了新加密货币: ${createdCrypto.name} (${createdCrypto.symbol})`);
        
        // 如果有区块链浏览器URL，创建区块链浏览器记录
        if (crypto.explorerUrl) {
          await storage.createBlockchainExplorer({
            cryptocurrencyId: createdCrypto.id,
            url: crypto.explorerUrl,
            name: `${createdCrypto.name} Explorer`,
            isPrimary: true
          });
          
          console.log(`为 ${createdCrypto.name} 添加了区块链浏览器 ${crypto.explorerUrl}`);
        }
      } else {
        skipped++;
      }
    } catch (error) {
      console.error(`处理 ${crypto.name} (${crypto.symbol}) 时出错:`, error);
      skipped++;
    }
  }
  
  return { added, updated, skipped };
}

/**
 * 主函数: 爬取所有市场数据
 */
export async function scrapeAllMarketData(): Promise<{
  added: number;
  updated: number;
  skipped: number;
  total: number;
}> {
  console.log('开始从多个来源爬取加密货币市场数据...');
  
  try {
    // 爬取所有页面
    const results = await scrapeAllPages();
    console.log(`从所有来源共找到 ${results.length} 个加密货币`);
    
    // 去重和合并
    const deduplicated = deduplicateAndMerge(results);
    console.log(`去重后共有 ${deduplicated.length} 个唯一加密货币`);
    
    // 更新数据库
    const { added, updated, skipped } = await updateDatabase(deduplicated);
    
    console.log(`
    ===== 市场数据爬取完成 =====
    - 找到加密货币: ${results.length}
    - 去重后: ${deduplicated.length}
    - 新增: ${added}
    - 更新: ${updated}
    - 跳过: ${skipped}
    ============================
    `);
    
    return {
      added,
      updated,
      skipped,
      total: deduplicated.length
    };
  } catch (error) {
    console.error('爬取市场数据时出错:', error);
    return {
      added: 0,
      updated: 0,
      skipped: 0,
      total: 0
    };
  }
}

// 如果直接运行此文件，执行爬取
if (typeof process !== 'undefined' && process.argv[1]?.endsWith('marketDataScraper.ts')) {
  scrapeAllMarketData().then(() => {
    console.log('市场数据爬取完成');
    process.exit(0);
  }).catch(err => {
    console.error('执行市场数据爬取时出错:', err);
    process.exit(1);
  });
}