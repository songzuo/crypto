/**
 * 高级市场数据爬虫
 * 
 * 专注于从更多的加密货币数据来源获取信息:
 * - Binance
 * - 1inch
 * - DeFi Llama
 * - Uniswap
 * - Crypto.com Pro
 * - Google搜索结果
 * 
 * 主要获取信息包括:
 * - 排名
 * - 市值
 * - 价格
 * - 24小时交易量
 * - 官方网站
 * - 区块链浏览器
 */

import * as cheerio from 'cheerio';
import https from 'https';
import { setTimeout } from 'timers/promises';
import { Cryptocurrency, InsertCryptocurrency } from '@shared/schema';
import { storage } from '../storage';

// 请求配置参数
const REQUEST_TIMEOUT = 30000; // 30秒
const RETRY_ATTEMPTS = 3;
const RETRY_DELAY = 2000; // 2秒
const MAX_CONCURRENT_REQUESTS = 5;

// 网站配置
const DATA_SOURCES = {
  BINANCE: {
    name: 'Binance',
    baseUrl: 'https://www.binance.com',
    marketsUrl: 'https://www.binance.com/en/markets/overview',
    apiUrl: 'https://www.binance.com/bapi/composite/v1/public/marketing/symbol/list',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
  },
  ONEINCH: {
    name: '1inch',
    baseUrl: 'https://app.1inch.io',
    marketsUrl: 'https://app.1inch.io/#/1/classic/token-lists',
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15'
  },
  DEFILLAMA: {
    name: 'DefiLlama',
    baseUrl: 'https://defillama.com',
    tokensUrl: 'https://defillama.com/currencies',
    apiUrl: 'https://api.llama.fi/protocols',
    userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
  },
  UNISWAP: {
    name: 'Uniswap',
    baseUrl: 'https://app.uniswap.org',
    tokensUrl: 'https://app.uniswap.org/#/tokens',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
  },
  CRYPTOCOMPARE: {
    name: 'CryptoCompare',
    baseUrl: 'https://www.cryptocompare.com',
    apiUrl: 'https://min-api.cryptocompare.com/data/top/mktcapfull?limit=100&tsym=USD&page=',
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15'
  },
  GOOGLE: {
    name: 'Google',
    baseUrl: 'https://www.google.com',
    searchUrl: (query: string) => `https://www.google.com/search?q=${encodeURIComponent(query)}+cryptocurrency+market+cap`,
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
    'Cache-Control': 'max-age=0',
    'Upgrade-Insecure-Requests': '1'
  },
  {
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-GB,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    'Referer': 'https://duckduckgo.com/',
    'Pragma': 'no-cache'
  },
  {
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.5',
    'Accept-Encoding': 'gzip, deflate, br',
    'DNT': '1',
    'Connection': 'keep-alive',
    'Upgrade-Insecure-Requests': '1'
  }
];

/**
 * 获取随机请求头
 */
function getRandomHeaders(source: string): Record<string, string> {
  const baseHeaders = ROTATED_HEADERS[Math.floor(Math.random() * ROTATED_HEADERS.length)];
  
  let userAgent = '';
  switch(source) {
    case 'Binance':
      userAgent = DATA_SOURCES.BINANCE.userAgent;
      break;
    case '1inch':
      userAgent = DATA_SOURCES.ONEINCH.userAgent;
      break;
    case 'DefiLlama':
      userAgent = DATA_SOURCES.DEFILLAMA.userAgent;
      break;
    case 'Uniswap':
      userAgent = DATA_SOURCES.UNISWAP.userAgent;
      break;
    case 'CryptoCompare':
      userAgent = DATA_SOURCES.CRYPTOCOMPARE.userAgent;
      break;
    case 'Google':
      userAgent = DATA_SOURCES.GOOGLE.userAgent;
      break;
    default:
      userAgent = DATA_SOURCES.BINANCE.userAgent;
  }
  
  return {
    ...baseHeaders,
    'User-Agent': userAgent
  };
}

/**
 * 安全地获取网页内容
 */
async function makeHttpsRequest(url: string, headers: Record<string, string>, isJson = false): Promise<string> {
  return new Promise((resolve, reject) => {
    let retryCount = 0;
    
    const makeRequest = () => {
      const req = https.get(url, { 
        headers,
        timeout: REQUEST_TIMEOUT
      }, (res) => {
        // 检查响应状态码
        if (res.statusCode !== 200) {
          if (retryCount < RETRY_ATTEMPTS) {
            console.log(`[${headers['User-Agent'].substring(0, 15)}...] 请求失败 (${retryCount + 1}/${RETRY_ATTEMPTS}): ${url} - 状态码: ${res.statusCode}`);
            retryCount++;
            setTimeout(RETRY_DELAY).then(makeRequest);
            return;
          }
          reject(new Error(`HTTP Error: ${res.statusCode}`));
          return;
        }
        
        // 处理响应数据
        let data = '';
        
        // 处理数据不考虑压缩编码，简化处理避免崩溃
        res.on('data', (chunk) => {
          data += chunk;
        });
        
        res.on('end', () => {
          resolve(data);
        });
      });
      
      req.on('timeout', () => {
        req.destroy();
        if (retryCount < RETRY_ATTEMPTS) {
          console.log(`[${headers['User-Agent'].substring(0, 15)}...] 请求超时 (${retryCount + 1}/${RETRY_ATTEMPTS}): ${url}`);
          retryCount++;
          setTimeout(RETRY_DELAY).then(makeRequest);
        } else {
          reject(new Error('Request timeout'));
        }
      });
      
      req.on('error', (err) => {
        if (retryCount < RETRY_ATTEMPTS) {
          console.log(`[${headers['User-Agent'].substring(0, 15)}...] 请求错误 (${retryCount + 1}/${RETRY_ATTEMPTS}): ${url} - ${err.message}`);
          retryCount++;
          setTimeout(RETRY_DELAY).then(makeRequest);
        } else {
          reject(err);
        }
      });
    };
    
    makeRequest();
  });
}

/**
 * 从Binance获取加密货币数据
 */
async function scrapeBinance(): Promise<Cryptocurrency[]> {
  console.log('从Binance获取加密货币数据...');
  
  try {
    const headers = getRandomHeaders('Binance');
    const url = DATA_SOURCES.BINANCE.apiUrl;
    
    // Binance使用API，返回JSON格式数据
    const response = await makeHttpsRequest(url, headers, true);
    const data = JSON.parse(response);
    
    if (!data.data || !Array.isArray(data.data)) {
      console.error('Binance API返回格式异常');
      return [];
    }
    
    const cryptocurrencies: Cryptocurrency[] = [];
    
    // 处理每个加密货币
    for (let i = 0; i < data.data.length; i++) {
      const item = data.data[i];
      
      if (!item.name || !item.symbol) continue;
      
      const crypto: Partial<InsertCryptocurrency> = {
        name: item.name,
        symbol: item.symbol,
        slug: item.name.toLowerCase().replace(/\s+/g, '-'),
        rank: i + 1,
        marketCap: parseFloat(item.circulatingMarketCap || '0'),
        price: parseFloat(item.price || '0'),
        volume24h: parseFloat(item.volume || '0'),
        priceChange24h: parseFloat(item.priceChangePercent || '0'),
        lastUpdated: new Date()
      };
      
      // 确保添加的是有市值的币种
      if (crypto.marketCap && crypto.marketCap > 0) {
        cryptocurrencies.push(crypto as Cryptocurrency);
      }
    }
    
    console.log(`从Binance找到 ${cryptocurrencies.length} 个加密货币`);
    return cryptocurrencies;
  } catch (error) {
    console.error('抓取Binance数据时出错:', error);
    return [];
  }
}

/**
 * 从DeFi Llama获取加密货币数据
 */
async function scrapeDefiLlama(): Promise<Cryptocurrency[]> {
  console.log('从DeFi Llama获取加密货币数据...');
  
  try {
    const headers = getRandomHeaders('DefiLlama');
    const url = DATA_SOURCES.DEFILLAMA.apiUrl;
    
    // DeFi Llama提供API，返回JSON格式数据
    const response = await makeHttpsRequest(url, headers, true);
    const data = JSON.parse(response);
    
    if (!Array.isArray(data)) {
      console.error('DeFi Llama API返回格式异常');
      return [];
    }
    
    const cryptocurrencies: Cryptocurrency[] = [];
    
    // 处理每个协议/加密货币
    for (let i = 0; i < data.length; i++) {
      const item = data[i];
      
      if (!item.name || !item.symbol) continue;
      
      const crypto: Partial<InsertCryptocurrency> = {
        name: item.name,
        symbol: item.symbol,
        slug: item.name.toLowerCase().replace(/\s+/g, '-'),
        rank: i + 1,
        marketCap: item.mcap || 0,
        price: 0, // DeFi Llama API可能不直接提供价格
        officialWebsite: item.url,
        lastUpdated: new Date()
      };
      
      // 确保添加的是有市值的币种
      if (crypto.marketCap && crypto.marketCap > 0) {
        cryptocurrencies.push(crypto as Cryptocurrency);
      }
    }
    
    console.log(`从DeFi Llama找到 ${cryptocurrencies.length} 个加密货币`);
    return cryptocurrencies;
  } catch (error) {
    console.error('抓取DeFi Llama数据时出错:', error);
    return [];
  }
}

/**
 * 从CryptoCompare获取加密货币数据
 */
async function scrapeCryptoCompare(page: number = 0): Promise<Cryptocurrency[]> {
  console.log(`从CryptoCompare获取第${page+1}页加密货币数据...`);
  
  try {
    const headers = getRandomHeaders('CryptoCompare');
    const url = `${DATA_SOURCES.CRYPTOCOMPARE.apiUrl}${page}`;
    
    // CryptoCompare提供API，返回JSON格式数据
    const response = await makeHttpsRequest(url, headers, true);
    const data = JSON.parse(response);
    
    if (!data.Data || !Array.isArray(data.Data)) {
      console.error('CryptoCompare API返回格式异常');
      return [];
    }
    
    const cryptocurrencies: Cryptocurrency[] = [];
    
    // 处理每个加密货币
    for (let i = 0; i < data.Data.length; i++) {
      const item = data.Data[i];
      const coinInfo = item.CoinInfo;
      const rawData = item.RAW?.USD;
      
      if (!coinInfo || !coinInfo.Name) continue;
      
      const crypto: Partial<InsertCryptocurrency> = {
        name: coinInfo.FullName || coinInfo.Name,
        symbol: coinInfo.Name,
        slug: (coinInfo.FullName || coinInfo.Name).toLowerCase().replace(/\s+/g, '-'),
        rank: (page * 100) + i + 1,
        marketCap: rawData?.MKTCAP || 0,
        price: rawData?.PRICE || 0,
        volume24h: rawData?.VOLUME24HOUR || 0,
        priceChange24h: rawData?.CHANGEPCT24HOUR || 0,
        officialWebsite: coinInfo.Url ? `https://${coinInfo.Url}` : undefined,
        lastUpdated: new Date()
      };
      
      // 确保添加的是有市值的币种
      if (crypto.marketCap && crypto.marketCap > 0) {
        cryptocurrencies.push(crypto as Cryptocurrency);
      }
    }
    
    console.log(`从CryptoCompare第${page+1}页找到 ${cryptocurrencies.length} 个加密货币`);
    return cryptocurrencies;
  } catch (error) {
    console.error(`抓取CryptoCompare第${page+1}页数据时出错:`, error);
    return [];
  }
}

/**
 * 通过Google搜索获取特定加密货币的数据
 */
async function searchCryptoViaGoogle(cryptoName: string): Promise<Partial<InsertCryptocurrency> | null> {
  console.log(`通过Google搜索 ${cryptoName} 的数据...`);
  
  try {
    const headers = getRandomHeaders('Google');
    const url = DATA_SOURCES.GOOGLE.searchUrl(`${cryptoName} cryptocurrency market cap price`);
    
    const html = await makeHttpsRequest(url, headers);
    const $ = cheerio.load(html);
    
    // 尝试从Google搜索结果提取市值信息
    let marketCap = 0;
    let price = 0;
    
    // 查找可能包含市值信息的元素
    $('div:contains("Market cap")').each((_, el) => {
      const text = $(el).text();
      if (text.includes('Market cap') && text.includes('$')) {
        const match = text.match(/\$[\d.,]+[BMK]?/);
        if (match) {
          marketCap = parseMarketCap(match[0]);
        }
      }
    });
    
    // 查找可能包含价格信息的元素
    $('div:contains("price")').each((_, el) => {
      const text = $(el).text();
      if ((text.includes('price') || text.includes('Price')) && text.includes('$')) {
        const match = text.match(/\$[\d.,]+/);
        if (match) {
          price = parseFloat(match[0].replace('$', '').replace(/,/g, ''));
        }
      }
    });
    
    if (marketCap > 0 || price > 0) {
      return {
        name: cryptoName,
        symbol: findSymbolInText($('body').text(), cryptoName),
        marketCap,
        price,
        lastUpdated: new Date()
      };
    }
    
    return null;
  } catch (error) {
    console.error(`通过Google搜索 ${cryptoName} 数据时出错:`, error);
    return null;
  }
}

/**
 * 解析市值字符串（例如：$1.2B）
 */
function parseMarketCap(text: string): number {
  text = text.replace('$', '').replace(/,/g, '');
  
  const value = parseFloat(text.replace(/[BMK]/g, ''));
  
  if (text.includes('B')) {
    return value * 1_000_000_000;
  } else if (text.includes('M')) {
    return value * 1_000_000;
  } else if (text.includes('K')) {
    return value * 1_000;
  }
  
  return value;
}

/**
 * 尝试从文本中查找加密货币的符号
 */
function findSymbolInText(text: string, cryptoName: string): string {
  // 尝试查找括号中的符号，如 "Bitcoin (BTC)"
  const bracketMatch = text.match(new RegExp(`${cryptoName}\\s*\\(([A-Za-z0-9]+)\\)`));
  if (bracketMatch && bracketMatch[1]) {
    return bracketMatch[1];
  }
  
  // 尝试查找常见模式，如 "BTC Bitcoin"
  const symbolPattern = /([A-Z]{3,5})\s+[A-Z][a-z]+/g;
  let match;
  while ((match = symbolPattern.exec(text)) !== null) {
    if (text.includes(match[1] + " " + cryptoName)) {
      return match[1];
    }
  }
  
  // 如果无法找到，返回名称的前3个字母
  return cryptoName.substring(0, 3).toUpperCase();
}

/**
 * 主函数：执行多源市场数据爬取
 */
export async function scrapeAdvancedMarketData(): Promise<number> {
  console.log('开始执行高级市场数据爬取...');
  
  let newCryptos = 0;
  let updatedCryptos = 0;
  
  try {
    // 1. 从Binance获取数据
    const binanceData = await scrapeBinance();
    
    // 2. 从DeFi Llama获取数据
    const defiLlamaData = await scrapeDefiLlama();
    
    // 3. 从CryptoCompare获取数据（爬取前5页）
    const cryptoCompareData: Cryptocurrency[] = [];
    for (let page = 0; page < 5; page++) {
      const pageData = await scrapeCryptoCompare(page);
      cryptoCompareData.push(...pageData);
      
      // 等待一段时间再请求下一页
      if (page < 4) await setTimeout(2000);
    }
    
    // 合并所有来源的数据
    const allCryptos = [...binanceData, ...defiLlamaData, ...cryptoCompareData];
    console.log(`从所有高级来源共找到 ${allCryptos.length} 个加密货币`);
    
    // 去重，以符号为主键
    const uniqueCryptos = removeDuplicates(allCryptos);
    console.log(`去重后共有 ${uniqueCryptos.length} 个唯一加密货币`);
    
    // 处理每个加密货币，更新或添加到数据库
    for (const crypto of uniqueCryptos) {
      try {
        // 查找是否已存在
        const existingCrypto = await findExistingCrypto(crypto.symbol);
        
        if (existingCrypto) {
          // 更新现有加密货币
          if (shouldUpdate(existingCrypto, crypto)) {
            await storage.updateCryptocurrency(existingCrypto.id, {
              marketCap: crypto.marketCap,
              price: crypto.price,
              volume24h: crypto.volume24h,
              priceChange24h: crypto.priceChange24h,
              rank: crypto.rank,
              lastUpdated: new Date()
            });
            updatedCryptos++;
          }
        } else {
          // 添加新加密货币
          const newCrypto: InsertCryptocurrency = {
            symbol: crypto.symbol,
            name: crypto.name,
            slug: crypto.slug,
            marketCap: crypto.marketCap,
            price: crypto.price,
            volume24h: crypto.volume24h,
            priceChange24h: crypto.priceChange24h,
            rank: crypto.rank,
            officialWebsite: crypto.officialWebsite,
            logoUrl: crypto.logoUrl,
            lastUpdated: new Date(),
            createdAt: new Date()
          };
          
          await storage.createCryptocurrency(newCrypto);
          newCryptos++;
        }
      } catch (error) {
        console.error(`处理加密货币 ${crypto.symbol} 时出错:`, error);
      }
    }
    
    console.log(`
    ===== 高级市场数据爬取完成 =====
    - 找到加密货币: ${allCryptos.length}
    - 去重后: ${uniqueCryptos.length}
    - 新增: ${newCryptos}
    - 更新: ${updatedCryptos}
    ============================
    `);
    
    return newCryptos;
  } catch (error) {
    console.error('高级市场数据爬取过程中发生错误:', error);
    return 0;
  }
}

/**
 * 去除重复加密货币
 */
function removeDuplicates(cryptos: Cryptocurrency[]): Cryptocurrency[] {
  const uniqueMap = new Map<string, Cryptocurrency>();
  
  for (const crypto of cryptos) {
    const key = crypto.symbol.toUpperCase();
    
    // 如果已存在，则保留市值更大或排名更高的那个
    if (uniqueMap.has(key)) {
      const existing = uniqueMap.get(key)!;
      
      if ((crypto.marketCap || 0) > (existing.marketCap || 0) || 
          (crypto.rank || 9999) < (existing.rank || 9999)) {
        uniqueMap.set(key, crypto);
      }
    } else {
      uniqueMap.set(key, crypto);
    }
  }
  
  return Array.from(uniqueMap.values());
}

/**
 * 查找是否已存在该加密货币
 */
async function findExistingCrypto(symbol: string): Promise<Cryptocurrency | undefined> {
  try {
    // 使用符号进行搜索
    const results = await storage.searchCryptocurrencies(symbol);
    
    // 查找完全匹配的加密货币
    return results.find(c => c.symbol.toUpperCase() === symbol.toUpperCase());
  } catch (error) {
    console.error(`查找加密货币 ${symbol} 时出错:`, error);
    return undefined;
  }
}

/**
 * 检查是否需要更新现有加密货币
 */
function shouldUpdate(existing: Cryptocurrency, newData: Cryptocurrency): boolean {
  // 如果新数据的市值为0，不更新
  if (!newData.marketCap || newData.marketCap === 0) {
    return false;
  }
  
  // 如果现有数据的lastUpdated是最近1小时内，且没有显著变化，不更新
  const oneHourAgo = new Date();
  oneHourAgo.setHours(oneHourAgo.getHours() - 1);
  
  if (existing.lastUpdated && new Date(existing.lastUpdated) > oneHourAgo) {
    // 价格变化小于5%，且排名变化小于10，不更新
    const priceChange = Math.abs(((newData.price || 0) - (existing.price || 0)) / (existing.price || 1)) * 100;
    const rankChange = Math.abs((newData.rank || 9999) - (existing.rank || 9999));
    
    if (priceChange < 5 && rankChange < 10) {
      return false;
    }
  }
  
  return true;
}