/**
 * 交易量市值比率爬虫
 * 
 * 每24小时运行一次，从CoinMarketCap和其他来源获取7天交易量数据
 * 计算交易量与市值的比率，并按此比率从高到低排序
 * 存储前30名的数据到数据库中
 */

import axios from 'axios';
import * as cheerio from 'cheerio';
import { storage } from '../storage';
import { InsertVolumeToMarketCapRatio, InsertVolumeToMarketCapBatch } from '@shared/schema';
import { log } from '../vite';
import { updateActivityTime } from './watchdog';

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
    } catch (error) {
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
    // 使用CoinMarketCap的交易量页面
    const url = 'https://coinmarketcap.com/rankings/exchanges/';
    const html = await makeHttpRequest(url);
    const $ = cheerio.load(html);
    
    const results: { 
      cryptoId: number; 
      name: string; 
      symbol: string; 
      volume7d: number; 
      marketCap: number; 
      ratio: number 
    }[] = [];
    
    // 解析页面中的数据行
    // 注意：以下选择器可能需要根据实际页面结构调整
    $('table tbody tr').each((i, element) => {
      try {
        const name = $(element).find('td:nth-child(2) .crypto-name').text().trim();
        const symbol = $(element).find('td:nth-child(2) .crypto-symbol').text().trim();
        const volume7dText = $(element).find('td:nth-child(3)').text().trim();
        const marketCapText = $(element).find('td:nth-child(4)').text().trim();
        
        // 移除货币符号并转换为数字
        const volume7d = parseFloat(volume7dText.replace(/[$,]/g, ''));
        const marketCap = parseFloat(marketCapText.replace(/[$,]/g, ''));
        
        if (name && symbol && !isNaN(volume7d) && !isNaN(marketCap) && marketCap > 0) {
          const ratio = volume7d / marketCap;
          
          // 查找加密货币ID
          const cryptoId = 0; // 将在完善过程中实现查找ID的方法
          
          results.push({
            cryptoId,
            name,
            symbol,
            volume7d,
            marketCap,
            ratio
          });
        }
      } catch (err) {
        log(`解析行数据时出错: ${err.message}`, 'volume-ratio');
      }
    });
    
    return results;
  } catch (error) {
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
    // 使用CoinGecko的交易量页面
    const url = 'https://www.coingecko.com/en/exchanges/volume';
    const html = await makeHttpRequest(url);
    const $ = cheerio.load(html);
    
    const results: { 
      cryptoId: number; 
      name: string; 
      symbol: string; 
      volume7d: number; 
      marketCap: number; 
      ratio: number 
    }[] = [];
    
    // 解析页面中的数据行
    // 注意：以下选择器可能需要根据实际页面结构调整
    $('table tbody tr').each((i, element) => {
      try {
        const name = $(element).find('td:nth-child(2) .coin-name').text().trim();
        const symbol = $(element).find('td:nth-child(2) .coin-symbol').text().trim();
        const volume24hText = $(element).find('td:nth-child(3)').text().trim();
        const marketCapText = $(element).find('td:nth-child(5)').text().trim();
        
        // 移除货币符号并转换为数字
        const volume24h = parseFloat(volume24hText.replace(/[$,]/g, ''));
        const marketCap = parseFloat(marketCapText.replace(/[$,]/g, ''));
        
        // 估算7天交易量（近似值）
        const volume7d = volume24h * 7;
        
        if (name && symbol && !isNaN(volume7d) && !isNaN(marketCap) && marketCap > 0) {
          const ratio = volume7d / marketCap;
          
          // 查找加密货币ID
          const cryptoId = 0; // 将在完善过程中实现查找ID的方法
          
          results.push({
            cryptoId,
            name,
            symbol,
            volume7d,
            marketCap,
            ratio
          });
        }
      } catch (err) {
        log(`解析行数据时出错: ${err.message}`, 'volume-ratio');
      }
    });
    
    return results;
  } catch (error) {
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
    // 使用Crypto.com的交易量页面
    const url = 'https://crypto.com/price';
    const html = await makeHttpRequest(url);
    const $ = cheerio.load(html);
    
    const results: { 
      cryptoId: number; 
      name: string; 
      symbol: string; 
      volume7d: number; 
      marketCap: number; 
      ratio: number 
    }[] = [];
    
    // 解析页面中的数据行
    // 注意：以下选择器可能需要根据实际页面结构调整
    $('table tbody tr').each((i, element) => {
      try {
        const name = $(element).find('td:nth-child(2) .coin-name').text().trim();
        const symbol = $(element).find('td:nth-child(2) .coin-symbol').text().trim();
        const volume24hText = $(element).find('td:nth-child(4)').text().trim();
        const marketCapText = $(element).find('td:nth-child(6)').text().trim();
        
        // 移除货币符号并转换为数字
        const volume24h = parseFloat(volume24hText.replace(/[$,]/g, ''));
        const marketCap = parseFloat(marketCapText.replace(/[$,]/g, ''));
        
        // 估算7天交易量（近似值）
        const volume7d = volume24h * 7;
        
        if (name && symbol && !isNaN(volume7d) && !isNaN(marketCap) && marketCap > 0) {
          const ratio = volume7d / marketCap;
          
          // 查找加密货币ID
          const cryptoId = 0; // 将在完善过程中实现查找ID的方法
          
          results.push({
            cryptoId,
            name,
            symbol,
            volume7d,
            marketCap,
            ratio
          });
        }
      } catch (err) {
        log(`解析行数据时出错: ${err.message}`, 'volume-ratio');
      }
    });
    
    return results;
  } catch (error) {
    log(`从Crypto.com抓取数据失败: ${error.message}`, 'volume-ratio');
    return [];
  }
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
  updateActivityTime('volumeMarketRatioScraper');
  
  try {
    // 首先尝试CoinMarketCap，如果失败再尝试其他来源
    let results = await scrapeCoinMarketCap();
    
    if (results.length < 30) {
      log('CoinMarketCap数据不足，尝试从CoinGecko获取数据', 'volume-ratio');
      const geckoResults = await scrapeCoinGecko();
      results = [...results, ...geckoResults];
    }
    
    if (results.length < 30) {
      log('CoinGecko数据仍不足，尝试从Crypto.com获取数据', 'volume-ratio');
      const cryptoComResults = await scrapeCryptocom();
      results = [...results, ...cryptoComResults];
    }
    
    // 去重
    const uniqueResults = removeDuplicates(results);
    
    // 按交易量/市值比率排序（降序）
    uniqueResults.sort((a, b) => b.ratio - a.ratio);
    
    // 获取前30个结果
    return uniqueResults.slice(0, 30);
  } catch (error) {
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
  } catch (error) {
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
    const lastSymbols = new Set(lastBatchItems.map(item => item.symbol.toLowerCase()));
    
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
    for (let i = 0; i < currentBatch.length; i++) {
      const currentItem = currentBatch[i];
      const lastItemIndex = lastBatchItems.findIndex(item => 
        item.symbol.toLowerCase() === currentItem.symbol.toLowerCase()
      );
      
      if (lastItemIndex !== i) {
        return true; // 排名发生变化
      }
    }
    
    return false; // 没有变化
  } catch (error) {
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
    
    // 对于每个加密货币，查找其ID
    for (const result of results) {
      if (result.cryptoId === 0) {
        result.cryptoId = await findCryptocurrencyId(result.symbol);
      }
    }
    
    // 检查是否与上一个批次有变化
    const hasChanges = await checkBatchHasChanges(results);
    
    // 获取上一个批次ID
    const lastBatch = await storage.getLatestVolumeToMarketCapBatch();
    const previousBatchId = lastBatch?.id || null;
    
    // 创建新批次
    const batchData: InsertVolumeToMarketCapBatch = {
      entriesCount: results.length,
      hasChanges,
      previousBatchId
    };
    
    const newBatch = await storage.createVolumeToMarketCapBatch(batchData);
    
    if (!newBatch) {
      log('创建批次失败', 'volume-ratio');
      return false;
    }
    
    // 如果有变化，则存储新数据
    if (hasChanges) {
      // 为每个结果创建数据库记录
      for (let i = 0; i < results.length; i++) {
        const result = results[i];
        
        const ratioData: InsertVolumeToMarketCapRatio = {
          cryptocurrencyId: result.cryptoId || 0,
          name: result.name,
          symbol: result.symbol,
          volume7d: result.volume7d,
          marketCap: result.marketCap,
          volumeToMarketCapRatio: result.ratio,
          includesFutures: true, // 假设包含期货交易量
          rank: i + 1,
          batchId: newBatch.id
        };
        
        await storage.createVolumeToMarketCapRatio(ratioData);
      }
      
      log(`成功分析并存储了 ${results.length} 个交易量市值比率项`, 'volume-ratio');
    } else {
      log('新批次与上一批次相同，未存储新数据', 'volume-ratio');
    }
    
    return true;
  } catch (error) {
    log(`分析交易量市值比率失败: ${error.message}`, 'volume-ratio');
    return false;
  }
}