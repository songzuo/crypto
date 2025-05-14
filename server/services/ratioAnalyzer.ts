/**
 * 交易量市值比率分析器
 * 
 * 优化版的交易量市值比率分析工具
 * 1. 能够处理更多加密货币（2000+ 币种）
 * 2. 过滤掉稳定币，避免干扰正常分析 
 * 3. 更高效的并行爬取和分析
 */

import axios from 'axios';
import * as cheerio from 'cheerio';
import { storage } from '../storage';
import { InsertVolumeToMarketCapRatio, InsertVolumeToMarketCapBatch } from '@shared/schema';
import { log } from '../vite';
import { updateActivityTime } from './watchdog';

// 稳定币符号列表 - 用于过滤结果
const STABLECOINS = new Set([
  'usdt', 'usdc', 'busd', 'dai', 'tusd', 'usdp', 'usdd', 'gusd', 'frax',
  'lusd', 'susd', 'cusdc', 'cdai', 'usdn', 'mim', 'fei', 'eurs', 'usdx',
  'husd', 'eurt', 'cusd', 'nusd', 'ousd', 'usdj', 'xaut', 'ustc', 'mim',
  'alusd', 'qcusd', 'usdk', 'idr', 'ust', 'ust-wormhole', 'usdt-terra'
]);

// 获取随机请求头来避免反爬虫机制
function getRandomHeaders(): Record<string, string> {
  const userAgents = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/92.0.4515.107 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:90.0) Gecko/20100101 Firefox/90.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 11.5; rv:91.0) Gecko/20100101 Firefox/91.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 11_5_1) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1.2 Safari/605.1.15'
  ];
  
  return {
    'User-Agent': userAgents[Math.floor(Math.random() * userAgents.length)],
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.5',
    'Accept-Encoding': 'gzip, deflate, br',
    'Connection': 'keep-alive',
    'Upgrade-Insecure-Requests': '1',
    'Cache-Control': 'max-age=0',
    'TE': 'Trailers'
  };
}

// 安全地获取网页内容，带有重试机制
async function makeHttpRequest(url: string, retries = 3): Promise<string> {
  let attempt = 0;
  
  while (attempt < retries) {
    try {
      const response = await axios.get(url, {
        headers: getRandomHeaders(),
        timeout: 30000,
        responseType: 'text'
      });
      
      return response.data;
    } catch (error: any) {
      attempt++;
      log(`请求失败 (${attempt}/${retries}): ${url} - ${error.message}`, 'volume-ratio');
      
      if (attempt >= retries) {
        throw new Error(`无法获取数据: ${error.message}`);
      }
      
      // 指数退避
      await new Promise(resolve => setTimeout(resolve, 2000 * Math.pow(2, attempt - 1)));
    }
  }
  
  throw new Error('所有重试尝试均失败');
}

// 从CoinMarketCap抓取交易量与市值数据
async function scrapeCoinMarketCap(): Promise<{ 
  cryptoId: number; 
  name: string; 
  symbol: string; 
  volume7d: number; 
  marketCap: number; 
  ratio: number 
}[]> {
  try {
    const results: { 
      cryptoId: number; 
      name: string; 
      symbol: string; 
      volume7d: number; 
      marketCap: number; 
      ratio: number 
    }[] = [];
    
    // 增加抓取页数，抓取前20页数据，每页100个币种
    const maxPages = 20;
    
    for (let page = 1; page <= maxPages; page++) {
      // 使用CoinMarketCap的分页URL
      const url = `https://coinmarketcap.com/?page=${page}`;
      log(`从${url}抓取交易量市值数据(第${page}/${maxPages}页)...`, 'volume-ratio');
      
      try {
        const html = await makeHttpRequest(url);
        const $ = cheerio.load(html);
        
        // 分析页面结构，找到包含加密货币列表的表格
        log(`分析页面结构，提取加密货币数据...`, 'volume-ratio');
        
        // CoinMarketCap在页面上表格的选择器 - 可能需要根据当前页面结构调整
        const tableSelector = 'table tbody tr';
        const rows = $(tableSelector);
        
        log(`CoinMarketCap页面${page}找到${rows.length}行加密货币数据`, 'volume-ratio');
        
        // 解析页面中的数据行
        $(tableSelector).each((i, element) => {
          try {
            // 注意：这些选择器可能需要定期更新，因为网站结构可能会变化
            const nameElement = $(element).find('td:nth-child(3)');
            const name = nameElement.find('.cmc-link').text().trim();
            const symbol = nameElement.find('.coin-item-symbol').text().trim();
            
            // 过滤稳定币
            if (STABLECOINS.has(symbol.toLowerCase())) {
              log(`跳过稳定币: ${name} (${symbol})`, 'volume-ratio');
              return;
            }
            
            // 获取价格和市值
            const priceText = $(element).find('td:nth-child(4)').text().trim();
            const marketCapText = $(element).find('td:nth-child(7)').text().trim();
            const volume24hText = $(element).find('td:nth-child(8)').text().trim();
            
            // 移除货币符号并转换为数字
            const price = parseFloat(priceText.replace(/[$,]/g, ''));
            const marketCap = parseFloat(marketCapText.replace(/[$,]/g, ''));
            const volume24h = parseFloat(volume24hText.replace(/[$,]/g, ''));
            
            // 计算7天交易量（粗略估计为24小时交易量的7倍）
            const volume7d = volume24h * 7;
            
            if (name && symbol && !isNaN(volume7d) && !isNaN(marketCap) && marketCap > 0) {
              const ratio = volume7d / marketCap;
              
              log(`解析到加密货币: ${name} (${symbol}), 7日交易量: ${volume7d}, 市值: ${marketCap}, 比率: ${ratio.toFixed(4)}`, 'volume-ratio');
              
              results.push({
                cryptoId: 0, // 临时值，将在后续步骤中查找
                name,
                symbol,
                volume7d,
                marketCap,
                ratio
              });
            }
          } catch (err: any) {
            log(`解析行数据时出错: ${err.message}`, 'volume-ratio');
          }
        });
        
        // 在页面之间添加延迟，以避免过快请求被封锁
        if (page < maxPages) {
          await new Promise(resolve => setTimeout(resolve, 2000 + Math.random() * 3000));
        }
      } catch (pageError: any) {
        log(`抓取CoinMarketCap第${page}页时出错: ${pageError.message}`, 'volume-ratio');
      }
    }
    
    log(`从CoinMarketCap成功解析了${results.length}个加密货币的交易量/市值数据`, 'volume-ratio');
    return results;
  } catch (error: any) {
    log(`从CoinMarketCap抓取数据失败: ${error.message}`, 'volume-ratio');
    return [];
  }
}

// 从CoinGecko抓取交易量与市值数据（备用方案）
async function scrapeCoinGecko(): Promise<{ 
  cryptoId: number; 
  name: string; 
  symbol: string; 
  volume7d: number; 
  marketCap: number; 
  ratio: number 
}[]> {
  try {
    const results: { 
      cryptoId: number; 
      name: string; 
      symbol: string; 
      volume7d: number; 
      marketCap: number; 
      ratio: number 
    }[] = [];
    
    // 增加抓取页数
    const maxPages = 20;
    
    for (let page = 1; page <= maxPages; page++) {
      // 使用CoinGecko的分页URL
      const url = `https://www.coingecko.com/en?page=${page}`;
      log(`从${url}抓取交易量市值数据...`, 'volume-ratio');
      
      try {
        const html = await makeHttpRequest(url);
        const $ = cheerio.load(html);
        
        // 解析页面中的数据行
        log(`分析CoinGecko页面${page}结构，提取加密货币数据...`, 'volume-ratio');
        
        // CoinGecko主页上加密货币表格的选择器
        const tableSelector = 'table.table tbody tr';
        const rows = $(tableSelector);
        
        log(`在CoinGecko页面${page}找到${rows.length}行加密货币数据`, 'volume-ratio');
        
        // 解析每一行
        $(tableSelector).each((i, element) => {
          try {
            // 注意：这些选择器可能需要定期更新，因为网站结构可能会变化
            const nameElement = $(element).find('td:nth-child(3)');
            const name = nameElement.find('a.tw-hidden').text().trim();
            const symbol = nameElement.find('a span.text-xs').text().trim().toUpperCase();
            
            // 过滤稳定币
            if (STABLECOINS.has(symbol.toLowerCase())) {
              log(`跳过稳定币: ${name} (${symbol})`, 'volume-ratio');
              return;
            }
            
            // 获取市值和交易量
            const marketCapText = $(element).find('td:nth-child(7) span').text().trim();
            const volume24hText = $(element).find('td:nth-child(8) span').text().trim();
            
            // 移除货币符号并转换为数字
            const marketCap = parseFloat(marketCapText.replace(/[$,]/g, ''));
            const volume24h = parseFloat(volume24hText.replace(/[$,]/g, ''));
            
            // 估算7天交易量（近似值）
            const volume7d = volume24h * 7;
            
            if (name && symbol && !isNaN(volume7d) && !isNaN(marketCap) && marketCap > 0) {
              const ratio = volume7d / marketCap;
              
              log(`解析到CoinGecko加密货币: ${name} (${symbol}), 7日交易量: ${volume7d}, 市值: ${marketCap}, 比率: ${ratio.toFixed(4)}`, 'volume-ratio');
              
              results.push({
                cryptoId: 0, // 临时值，将在后续步骤中查找
                name,
                symbol,
                volume7d,
                marketCap,
                ratio
              });
            }
          } catch (err: any) {
            log(`解析CoinGecko行数据时出错: ${err.message}`, 'volume-ratio');
          }
        });
        
        // 在页面之间添加延迟，以避免过快请求被封锁
        if (page < maxPages) {
          await new Promise(resolve => setTimeout(resolve, 2000 + Math.random() * 3000));
        }
      } catch (pageError: any) {
        log(`抓取CoinGecko第${page}页时出错: ${pageError.message}`, 'volume-ratio');
      }
    }
    
    log(`从CoinGecko成功解析了${results.length}个加密货币的交易量/市值数据`, 'volume-ratio');
    return results;
  } catch (error: any) {
    log(`从CoinGecko抓取数据失败: ${error.message}`, 'volume-ratio');
    return [];
  }
}

// 从Crypto.com抓取交易量与市值数据（备用方案）
async function scrapeCryptocom(): Promise<{ 
  cryptoId: number; 
  name: string; 
  symbol: string; 
  volume7d: number; 
  marketCap: number; 
  ratio: number 
}[]> {
  try {
    const results: { 
      cryptoId: number; 
      name: string; 
      symbol: string; 
      volume7d: number; 
      marketCap: number; 
      ratio: number 
    }[] = [];
    
    // 增加抓取页数
    const maxPages = 20;
    
    for (let page = 1; page <= maxPages; page++) {
      // 使用Crypto.com的分页URL
      const url = `https://crypto.com/price?page=${page}`;
      log(`从${url}抓取交易量市值数据...`, 'volume-ratio');
      
      try {
        const html = await makeHttpRequest(url);
        const $ = cheerio.load(html);
        
        // 解析页面中的数据行
        log(`分析Crypto.com页面${page}结构，提取加密货币数据...`, 'volume-ratio');
        
        // Crypto.com主页上加密货币表格的选择器
        const tableSelector = '.css-tlfecz-tbody tr';
        const rows = $(tableSelector);
        
        log(`在Crypto.com页面${page}找到${rows.length}行加密货币数据`, 'volume-ratio');
        
        $(tableSelector).each((i, element) => {
          try {
            // 注意：这些选择器可能需要定期更新，因为网站结构可能会变化
            const nameElement = $(element).find('td:nth-child(3)');
            const name = nameElement.text().trim();
            const symbolElement = $(element).find('td:nth-child(2)');
            const symbol = symbolElement.text().trim().toUpperCase();
            
            // 过滤稳定币
            if (STABLECOINS.has(symbol.toLowerCase())) {
              log(`跳过稳定币: ${name} (${symbol})`, 'volume-ratio');
              return;
            }
            
            // 获取市值和交易量
            const volume24hText = $(element).find('td:nth-child(9)').text().trim();
            const marketCapText = $(element).find('td:nth-child(8)').text().trim();
            
            // 移除货币符号并转换为数字
            const volumeMatch = volume24hText.match(/[$€£¥]?[\d,]+(\.\d+)?[KMBTkmbt]?/);
            const marketCapMatch = marketCapText.match(/[$€£¥]?[\d,]+(\.\d+)?[KMBTkmbt]?/);
            
            let volume24h = 0;
            let marketCap = 0;
            
            if (volumeMatch) {
              const volumeStr = volumeMatch[0].replace(/[$€£¥,]/g, '');
              volume24h = parseNumber(volumeStr);
            }
            
            if (marketCapMatch) {
              const marketCapStr = marketCapMatch[0].replace(/[$€£¥,]/g, '');
              marketCap = parseNumber(marketCapStr);
            }
            
            // 估算7天交易量（近似值）
            const volume7d = volume24h * 7;
            
            if (name && symbol && !isNaN(volume7d) && !isNaN(marketCap) && marketCap > 0) {
              const ratio = volume7d / marketCap;
              
              log(`解析到Crypto.com加密货币: ${name} (${symbol}), 7日交易量: ${volume7d}, 市值: ${marketCap}, 比率: ${ratio.toFixed(4)}`, 'volume-ratio');
              
              results.push({
                cryptoId: 0, // 临时值，将在后续步骤中查找
                name,
                symbol,
                volume7d,
                marketCap,
                ratio
              });
            }
          } catch (err: any) {
            log(`解析Crypto.com行数据时出错: ${err.message}`, 'volume-ratio');
          }
        });
        
        // 在页面之间添加延迟，以避免过快请求被封锁
        if (page < maxPages) {
          await new Promise(resolve => setTimeout(resolve, 2000 + Math.random() * 3000));
        }
      } catch (pageError: any) {
        log(`抓取Crypto.com第${page}页时出错: ${pageError.message}`, 'volume-ratio');
      }
    }
    
    log(`从Crypto.com成功解析了${results.length}个加密货币的交易量/市值数据`, 'volume-ratio');
    return results;
  } catch (error: any) {
    log(`从Crypto.com抓取数据失败: ${error.message}`, 'volume-ratio');
    return [];
  }
}

// 辅助函数：将带有K、M、B、T等后缀的数字字符串转换为实际数值
function parseNumber(str: string): number {
  const multipliers: Record<string, number> = {
    k: 1000,
    m: 1000000,
    b: 1000000000,
    t: 1000000000000
  };
  
  const match = str.match(/^([\d.]+)([kmbt])?$/i);
  
  if (!match) return NaN;
  
  const [, numStr, suffix] = match;
  const num = parseFloat(numStr);
  
  if (suffix) {
    const multiplier = multipliers[suffix.toLowerCase()];
    return num * multiplier;
  }
  
  return num;
}

// 组合多个数据源的结果
async function combineResults(): Promise<{ 
  cryptoId: number; 
  name: string; 
  symbol: string; 
  volume7d: number; 
  marketCap: number; 
  ratio: number 
}[]> {
  // 更新看门狗活动时间
  updateActivityTime();
  
  try {
    log('开始从多个数据源收集交易量市值比率数据...', 'volume-ratio');
    
    // 并行从所有来源获取数据
    const [coinMarketCapResults, coinGeckoResults, cryptoComResults] = await Promise.all([
      scrapeCoinMarketCap(),
      scrapeCoinGecko(),
      scrapeCryptocom()
    ]);
    
    log(`从CoinMarketCap获取了${coinMarketCapResults.length}个加密货币数据`, 'volume-ratio');
    log(`从CoinGecko获取了${coinGeckoResults.length}个加密货币数据`, 'volume-ratio');
    log(`从Crypto.com获取了${cryptoComResults.length}个加密货币数据`, 'volume-ratio');
    
    // 合并结果
    let results = [...coinMarketCapResults, ...coinGeckoResults, ...cryptoComResults];
    
    // 去重
    const uniqueResults = removeDuplicates(results);
    log(`去重后剩余${uniqueResults.length}个加密货币数据`, 'volume-ratio');
    
    // 按交易量/市值比率排序（降序）
    uniqueResults.sort((a, b) => b.ratio - a.ratio);
    
    // 查找每种加密货币的ID
    log('查找加密货币ID...', 'volume-ratio');
    for (let i = 0; i < uniqueResults.length; i++) {
      const result = uniqueResults[i];
      if (result.cryptoId === 0) {
        // 使用模式名称或符号查找加密货币ID
        const cryptoId = await findCryptocurrencyId(result.symbol);
        if (cryptoId > 0) {
          result.cryptoId = cryptoId;
          log(`找到${result.name} (${result.symbol})的ID: ${cryptoId}`, 'volume-ratio');
        } else {
          log(`警告: 未能找到${result.name} (${result.symbol})的加密货币ID`, 'volume-ratio');
        }
      }
    }
    
    // 再次排序，优先使用有效的加密货币ID（即我们在数据库中有数据的币种）
    uniqueResults.sort((a, b) => {
      // 首先按ID排序（有ID的排在前面）
      if (a.cryptoId > 0 && b.cryptoId === 0) return -1;
      if (a.cryptoId === 0 && b.cryptoId > 0) return 1;
      // 然后按交易量市值比率排序
      return b.ratio - a.ratio;
    });
    
    // 获取前100个结果
    const topResults = uniqueResults.slice(0, 100);
    log(`成功获取前${topResults.length}个交易量市值比率数据`, 'volume-ratio');
    
    return topResults;
  } catch (error: any) {
    log(`组合数据源结果失败: ${error.message}`, 'volume-ratio');
    return [];
  }
}

// 去除重复项
function removeDuplicates(results: { 
  cryptoId: number; 
  name: string; 
  symbol: string; 
  volume7d: number; 
  marketCap: number; 
  ratio: number 
}[]): typeof results {
  const seen = new Set<string>();
  return results.filter(item => {
    const key = `${item.symbol.toLowerCase()}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

// 查找加密货币ID
async function findCryptocurrencyId(symbol: string): Promise<number> {
  try {
    const matchingCryptos = await storage.autocompleteCryptocurrencies(symbol, 1);
    
    if (matchingCryptos.length > 0) {
      return matchingCryptos[0].id;
    }
    
    // 如果未找到完全匹配，尝试模糊搜索
    const searchResults = await storage.searchCryptocurrencies(symbol);
    
    if (searchResults.length > 0) {
      return searchResults[0].id;
    }
    
    return 0; // 未找到匹配的加密货币
  } catch (error: any) {
    log(`查找加密货币ID失败: ${error.message}`, 'volume-ratio');
    return 0;
  }
}

// 检查当前批次是否与上一个批次有变化
async function checkBatchHasChanges(currentBatch: { 
  cryptoId: number; 
  name: string; 
  symbol: string; 
  volume7d: number; 
  marketCap: number; 
  ratio: number 
}[]): Promise<boolean> {
  try {
    // 获取最近的一个批次
    const lastBatch = await storage.getLatestVolumeToMarketCapBatch();
    
    if (!lastBatch) {
      return true; // 如果没有上一个批次，则认为有变化
    }
    
    // 获取上一个批次的详细数据
    const lastBatchItems = await storage.getVolumeToMarketCapRatiosByBatchId(lastBatch.id);
    
    if (lastBatchItems.length === 0) {
      return true; // 如果上一个批次没有数据，则认为有变化
    }
    
    // 将两个批次转换为符号集合，以便比较
    const currentSymbols = new Set(currentBatch.map(item => item.symbol.toLowerCase()));
    const lastSymbols = new Set(lastBatchItems.map(item => item.symbol?.toLowerCase() || ''));
    
    // 如果两个集合大小不同，则认为有变化
    if (currentSymbols.size !== lastSymbols.size) {
      return true;
    }
    
    // 检查每个符号是否都在上一个批次中
    for (const symbol of currentSymbols) {
      if (!lastSymbols.has(symbol)) {
        return true; // 找到一个新符号，认为有变化
      }
    }
    
    // 比较排名是否变化
    for (let i = 0; i < Math.min(currentBatch.length, 30); i++) {
      const currentItem = currentBatch[i];
      const lastItemIndex = lastBatchItems.findIndex(item => 
        (item.symbol?.toLowerCase() || '') === currentItem.symbol.toLowerCase()
      );
      
      if (lastItemIndex !== i && lastItemIndex < 30) {
        return true; // 排名发生变化
      }
    }
    
    return false; // 没有变化
  } catch (error: any) {
    log(`检查批次变化失败: ${error.message}`, 'volume-ratio');
    return true; // 出错时默认认为有变化
  }
}

// 主函数：执行交易量市值比率分析
export async function analyzeVolumeToMarketCapRatios(): Promise<boolean> {
  log('开始分析交易量市值比率...', 'volume-ratio');
  
  try {
    // 获取数据
    const results = await combineResults();
    
    if (results.length === 0) {
      log('未能获取有效的交易量市值比率数据', 'volume-ratio');
      return false;
    }
    
    // 检查是否与上一个批次有变化
    const hasChanges = await checkBatchHasChanges(results);
    
    // 获取上一个批次ID
    let previousBatchId: number | null = null;
    const lastBatch = await storage.getLatestVolumeToMarketCapBatch();
    if (lastBatch) {
      previousBatchId = lastBatch.id;
    }
    
    // 创建新批次
    const newBatch: InsertVolumeToMarketCapBatch = {
      entriesCount: results.length,
      hasChanges,
      previousBatchId
    };
    
    const batch = await storage.createVolumeToMarketCapBatch(newBatch);
    
    // 创建比率记录
    let rank = 1;
    for (const result of results) {
      const ratio: InsertVolumeToMarketCapRatio = {
        cryptocurrencyId: result.cryptoId,
        name: result.name,
        symbol: result.symbol,
        volume7d: result.volume7d,
        marketCap: result.marketCap,
        volumeToMarketCapRatio: result.ratio,
        includesFutures: true, // 默认值，因为大多数数据源包含期货交易量
        rank,
        batchId: batch.id
      };
      
      await storage.createVolumeToMarketCapRatio(ratio);
      rank++;
    }
    
    log(`成功分析并存储了 ${results.length} 个交易量市值比率项`, 'volume-ratio');
    
    return true;
  } catch (error: any) {
    log(`分析交易量市值比率失败: ${error.message}`, 'volume-ratio');
    return false;
  }
}