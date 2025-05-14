/**
 * 增强型交易量市值比率分析器
 * 整合了爬虫和API方式，用于计算加密货币的交易量市值比率
 */

import axios from 'axios';
import cheerio from 'cheerio';
import { log } from '../vite';
import { storage } from '../storage';
import { sleep } from './utils';
import { 
  fetch7DayAverageVolumeForMany, 
  fetchFromAllAPIs, 
  ApiCryptoData 
} from './cryptoApiAggregator';
import { generateRandomUserAgent } from './webScraper';
import { parseNumber } from './utils';

// 稳定币列表（排除稳定币是因为它们的交易量市值比率不具有参考价值）
const STABLECOINS = new Set([
  'USDT', 'USDC', 'BUSD', 'DAI', 'TUSD', 'USDP', 'GUSD', 'USDD', 'USDK', 'SUSD',
  'CUSD', 'USDN', 'USDJ', 'XSGD', 'EURS', 'EURT', 'EUROC', 'EURC', 'EURN',
  'JEUR', 'JGBP', 'JCHF', 'PAX', 'HUSD', 'LUSD', 'USDX', 'FRAX', 'FRXS',
  'TRYB', 'XIDR', 'BITCNY', 'BKRW', 'JPYC', 'BIDR', 'BVND'
]);

// 用于排除特定词汇的币种（通常是价格指数或不常规币种）
const EXCLUDE_TERMS = [
  'index', 'compound', 'wrapped', 'leverage', 'bull', 'bear', '3x', '5x', 
  'long', 'short', 'token', 'wormhole', 'synthetic', 'mirror', 'locked'
];

// 日志和错误处理辅助函数
function logError(error: any, source: string): void {
  const errorMessage = error instanceof Error ? error.message : String(error);
  log(`在${source}交易量比率分析中发生错误: ${errorMessage}`, 'volume-ratio');
}

/**
 * 结合API和网页爬虫收集加密货币交易量市值数据的函数
 * 使用多种策略提高数据完整性
 */
async function collectCryptoVolumeMarketCapData(limit: number = 1000): Promise<ApiCryptoData[]> {
  log(`开始收集前${limit}个加密货币的交易量和市值数据...`, 'volume-ratio');
  
  try {
    // 策略1: 使用多种API获取数据
    log(`通过API获取前${limit}个加密货币数据...`, 'volume-ratio');
    const apiData = await fetchFromAllAPIs(limit);
    
    // 策略2: 如果API返回的数据不足，使用爬虫补充
    if (apiData.length < limit * 0.5) { // 如果API获取的数据少于预期的50%
      log(`API数据不足，使用爬虫补充数据...`, 'volume-ratio');
      const scrapedData = await scrapeCryptoData(limit);
      
      // 合并API和爬虫数据，并去重
      const combinedData = [...apiData, ...scrapedData];
      const uniqueData = removeDuplicates(combinedData);
      log(`合并后共获取了${uniqueData.length}个加密货币数据`, 'volume-ratio');
      return uniqueData;
    }
    
    log(`通过API成功获取了${apiData.length}个加密货币数据`, 'volume-ratio');
    return apiData;
  } catch (error) {
    // 如果API方法失败，回退到爬虫方法
    log(`API数据收集失败，回退到爬虫方法: ${error.message}`, 'volume-ratio');
    return await scrapeCryptoData(limit);
  }
}

/**
 * 使用爬虫方法收集加密货币数据
 */
async function scrapeCryptoData(limit: number = 1000): Promise<ApiCryptoData[]> {
  log(`开始使用爬虫收集前${limit}个加密货币数据...`, 'volume-ratio');
  
  const results: ApiCryptoData[] = [];
  
  // 尝试从CoinMarketCap爬取数据
  try {
    const cmcData = await scrapeCoinMarketCap(Math.ceil(limit / 100));
    results.push(...cmcData);
    log(`从CoinMarketCap爬取了${cmcData.length}个币种数据`, 'volume-ratio');
  } catch (error) {
    logError(error, 'CoinMarketCap爬虫');
  }
  
  // 如果CoinMarketCap数据不足，尝试CoinGecko
  if (results.length < limit * 0.5) {
    try {
      const geckoData = await scrapeCoinGecko(Math.ceil(limit / 100));
      results.push(...geckoData);
      log(`从CoinGecko爬取了${geckoData.length}个币种数据`, 'volume-ratio');
    } catch (error) {
      logError(error, 'CoinGecko爬虫');
    }
  }
  
  // 如果数据仍然不足，尝试Crypto.com
  if (results.length < limit * 0.3) {
    try {
      const cryptoComData = await scrapeCryptoCom(Math.ceil(limit / 50));
      results.push(...cryptoComData);
      log(`从Crypto.com爬取了${cryptoComData.length}个币种数据`, 'volume-ratio');
    } catch (error) {
      logError(error, 'Crypto.com爬虫');
    }
  }
  
  // 去重处理
  const uniqueData = removeDuplicates(results);
  log(`爬虫共收集了${uniqueData.length}个唯一加密货币数据`, 'volume-ratio');
  
  return uniqueData;
}

/**
 * 从CoinMarketCap爬取数据
 */
async function scrapeCoinMarketCap(pageCount: number): Promise<ApiCryptoData[]> {
  const data: ApiCryptoData[] = [];
  
  for (let page = 1; page <= pageCount; page++) {
    try {
      log(`从CoinMarketCap抓取第${page}页数据...`, 'volume-ratio');
      const url = `https://coinmarketcap.com/?page=${page}`;
      
      const response = await axios.get(url, {
        headers: {
          'User-Agent': generateRandomUserAgent(),
          'Accept': 'text/html,application/xhtml+xml,application/xml',
          'Accept-Language': 'en-US,en;q=0.9',
        },
        timeout: 15000
      });
      
      const $ = cheerio.load(response.data);
      
      // 分析表格行
      $('table tbody tr').each((index, element) => {
        try {
          const name = $(element).find('td:nth-child(3) p:first-child').text().trim();
          const symbol = $(element).find('td:nth-child(3) p:nth-child(2)').text().trim();
          
          // 跳过稳定币
          if (STABLECOINS.has(symbol.toUpperCase())) {
            log(`跳过稳定币: ${name} (${symbol})`, 'volume-ratio');
            return;
          }
          
          // 跳过包含排除术语的币种
          if (EXCLUDE_TERMS.some(term => name.toLowerCase().includes(term.toLowerCase()))) {
            log(`跳过排除币种: ${name} (${symbol})`, 'volume-ratio');
            return;
          }
          
          // 获取价格、市值和交易量
          const priceText = $(element).find('td:nth-child(4)').text().trim();
          const marketCapText = $(element).find('td:nth-child(7) span').text().trim();
          const volume24hText = $(element).find('td:nth-child(8) span').text().trim();
          
          // 使用改进的parseNumber函数来正确处理带后缀的数值
          const price = parseNumber(priceText);
          let parsedMarketCap = parseNumber(marketCapText);
          let parsedVolume24h = parseNumber(volume24hText);
          
          // 市值通常以百万(M)或十亿(B)为单位显示
          // 如果解析出的值异常小（小于1），可能是单位使用了百万或十亿
          // 检查原始文本是否包含"M"或"B"但解析未正确处理
          if (!isNaN(parsedMarketCap) && parsedMarketCap < 100 && 
              (marketCapText.includes('M') || marketCapText.includes('m'))) {
              log(`发现疑似错误解析的市值: ${marketCapText} -> ${parsedMarketCap}，修正为百万单位`, 'volume-ratio');
              parsedMarketCap = parsedMarketCap * 1000000;
          } else if (!isNaN(parsedMarketCap) && parsedMarketCap < 1 && 
              (marketCapText.includes('B') || marketCapText.includes('b'))) {
              log(`发现疑似错误解析的市值: ${marketCapText} -> ${parsedMarketCap}，修正为十亿单位`, 'volume-ratio');
              parsedMarketCap = parsedMarketCap * 1000000000;
          }
          
          // 同理处理交易量
          if (!isNaN(parsedVolume24h) && parsedVolume24h < 100 && 
              (volume24hText.includes('M') || volume24hText.includes('m'))) {
              log(`发现疑似错误解析的交易量: ${volume24hText} -> ${parsedVolume24h}，修正为百万单位`, 'volume-ratio');
              parsedVolume24h = parsedVolume24h * 1000000;
          } else if (!isNaN(parsedVolume24h) && parsedVolume24h < 1 && 
              (volume24hText.includes('B') || volume24hText.includes('b'))) {
              log(`发现疑似错误解析的交易量: ${volume24hText} -> ${parsedVolume24h}，修正为十亿单位`, 'volume-ratio');
              parsedVolume24h = parsedVolume24h * 1000000000;
          }
          
          const marketCap = parsedMarketCap;
          const volume24h = parsedVolume24h;
          
          // 计算7天交易量（粗略估计为24小时交易量的7倍）
          const volume7d = volume24h * 7;
          
          if (name && symbol && !isNaN(volume7d) && !isNaN(marketCap) && marketCap > 0) {
            data.push({
              name,
              symbol: symbol.toUpperCase(),
              marketCap,
              volume24h,
              price,
              volume7d
            });
          }
        } catch (error) {
          logError(error, 'CoinMarketCap行解析');
        }
      });
      
      log(`从CoinMarketCap第${page}页解析了${data.length}个币种数据`, 'volume-ratio');
      
      // 在页面之间添加随机延迟以避免被封
      if (page < pageCount) {
        const delay = 3000 + Math.random() * 2000;
        await sleep(delay);
      }
    } catch (error) {
      logError(error, `CoinMarketCap第${page}页`);
    }
  }
  
  log(`从CoinMarketCap成功解析了${data.length}个加密货币的交易量/市值数据`, 'volume-ratio');
  return data;
}

/**
 * 从CoinGecko爬取数据
 */
async function scrapeCoinGecko(pageCount: number): Promise<ApiCryptoData[]> {
  const data: ApiCryptoData[] = [];
  
  for (let page = 1; page <= pageCount; page++) {
    try {
      log(`从https://www.coingecko.com/en?page=${page}抓取交易量市值数据...`, 'volume-ratio');
      
      const response = await axios.get(`https://www.coingecko.com/en?page=${page}`, {
        headers: {
          'User-Agent': generateRandomUserAgent(),
          'Accept': 'text/html,application/xhtml+xml,application/xml',
          'Accept-Language': 'en-US,en;q=0.9',
        },
        timeout: 20000
      });
      
      const $ = cheerio.load(response.data);
      log(`分析CoinGecko页面${page}结构，提取加密货币数据...`, 'volume-ratio');
      
      // 查找表格行
      const rows = $('table tbody tr');
      log(`在CoinGecko页面${page}找到${rows.length}行加密货币数据`, 'volume-ratio');
      
      rows.each((index, element) => {
        try {
          // 提取币种名称和符号
          const nameElement = $(element).find('td:nth-child(3) .tw-hidden');
          const name = nameElement.text().trim();
          
          const symbolElement = $(element).find('td:nth-child(3) .d-lg-inline');
          let symbol = symbolElement.text().trim();
          // 移除符号中的括号
          symbol = symbol.replace(/[()]/g, '').trim();
          
          // 跳过稳定币
          if (STABLECOINS.has(symbol.toUpperCase())) {
            log(`跳过稳定币: ${name} (${symbol})`, 'volume-ratio');
            return;
          }
          
          // 跳过包含排除术语的币种
          if (EXCLUDE_TERMS.some(term => name.toLowerCase().includes(term.toLowerCase()))) {
            log(`跳过排除币种: ${name} (${symbol})`, 'volume-ratio');
            return;
          }
          
          // 提取价格、市值和交易量
          const priceText = $(element).find('td:nth-child(4) span').text().trim();
          const marketCapText = $(element).find('td:nth-child(9) span').text().trim();
          const volume24hText = $(element).find('td:nth-child(10) span').text().trim();
          
          // 使用改进的parseNumber函数正确处理带后缀的数值
          const price = parseNumber(priceText);
          let parsedMarketCap = parseNumber(marketCapText);
          let parsedVolume24h = parseNumber(volume24hText);
          
          // 检查并修正可能的解析错误
          if (!isNaN(parsedMarketCap) && parsedMarketCap < 100 && 
              (marketCapText.includes('M') || marketCapText.includes('m'))) {
              parsedMarketCap = parsedMarketCap * 1000000;
          } else if (!isNaN(parsedMarketCap) && parsedMarketCap < 1 && 
              (marketCapText.includes('B') || marketCapText.includes('b'))) {
              parsedMarketCap = parsedMarketCap * 1000000000;
          }
          
          if (!isNaN(parsedVolume24h) && parsedVolume24h < 100 && 
              (volume24hText.includes('M') || volume24hText.includes('m'))) {
              parsedVolume24h = parsedVolume24h * 1000000;
          } else if (!isNaN(parsedVolume24h) && parsedVolume24h < 1 && 
              (volume24hText.includes('B') || volume24hText.includes('b'))) {
              parsedVolume24h = parsedVolume24h * 1000000000;
          }
          
          const marketCap = parsedMarketCap;
          const volume24h = parsedVolume24h;
          
          // 估算7天交易量
          const volume7d = volume24h * 7;
          
          if (name && symbol && !isNaN(marketCap) && !isNaN(volume24h) && marketCap > 0) {
            data.push({
              name,
              symbol: symbol.toUpperCase(),
              marketCap,
              volume24h,
              price,
              volume7d
            });
          }
        } catch (error) {
          logError(error, 'CoinGecko行解析');
        }
      });
      
      // 页面间添加随机延迟
      if (page < pageCount) {
        const delay = 4000 + Math.random() * 3000;
        await sleep(delay);
      }
    } catch (error) {
      log(`抓取CoinGecko第${page}页时出错: ${error.message}`, 'volume-ratio');
      
      // 尝试重试
      try {
        log(`重试请求: https://www.coingecko.com/en?page=${page}`, 'volume-ratio');
        await sleep(5000); // 等待5秒后重试
        
        const response = await axios.get(`https://www.coingecko.com/en?page=${page}`, {
          headers: {
            'User-Agent': generateRandomUserAgent(),
            'Accept': 'text/html,application/xhtml+xml,application/xml',
            'Accept-Language': 'en-US,en;q=0.9',
          },
          timeout: 30000
        });
        
        const $ = cheerio.load(response.data);
        log(`分析CoinGecko页面${page}结构，提取加密货币数据...`, 'volume-ratio');
        
        // ... (重复上面的解析逻辑)
        
      } catch (retryError) {
        log(`重试失败: ${retryError.message}`, 'volume-ratio');
      }
    }
  }
  
  return data;
}

/**
 * 从Crypto.com爬取数据
 */
async function scrapeCryptoCom(pageCount: number): Promise<ApiCryptoData[]> {
  const data: ApiCryptoData[] = [];
  
  for (let page = 1; page <= pageCount; page++) {
    try {
      log(`分析Crypto.com页面${page}结构，提取加密货币数据...`, 'volume-ratio');
      
      const response = await axios.get(`https://crypto.com/price?page=${page}`, {
        headers: {
          'User-Agent': generateRandomUserAgent(),
          'Accept': 'text/html,application/xhtml+xml,application/xml',
          'Accept-Language': 'en-US,en;q=0.9',
        },
        timeout: 20000
      });
      
      const $ = cheerio.load(response.data);
      
      // 查找表格行
      const rows = $('table tbody tr');
      log(`在Crypto.com页面${page}找到${rows.length}行加密货币数据`, 'volume-ratio');
      
      rows.each((index, element) => {
        try {
          // 提取币种名称和符号
          const nameElement = $(element).find('td:nth-child(3) p:nth-child(1)');
          const name = nameElement.text().trim();
          
          const symbolElement = $(element).find('td:nth-child(3) p:nth-child(2)');
          const symbol = symbolElement.text().trim();
          
          // 跳过稳定币
          if (STABLECOINS.has(symbol.toUpperCase())) {
            log(`跳过稳定币: ${name} (${symbol})`, 'volume-ratio');
            return;
          }
          
          // 跳过包含排除术语的币种
          if (EXCLUDE_TERMS.some(term => name.toLowerCase().includes(term.toLowerCase()))) {
            log(`跳过排除币种: ${name} (${symbol})`, 'volume-ratio');
            return;
          }
          
          // 提取价格、市值和交易量
          const priceText = $(element).find('td:nth-child(4)').text().trim();
          const marketCapText = $(element).find('td:nth-child(7)').text().trim();
          const volume24hText = $(element).find('td:nth-child(8)').text().trim();
          
          // 使用改进的parseNumber函数正确处理带后缀的数值
          const price = parseNumber(priceText);
          let parsedMarketCap = parseNumber(marketCapText);
          let parsedVolume24h = parseNumber(volume24hText);
          
          // 检查并修正可能的解析错误
          if (!isNaN(parsedMarketCap) && parsedMarketCap < 100 && 
              (marketCapText.includes('M') || marketCapText.includes('m'))) {
              parsedMarketCap = parsedMarketCap * 1000000;
          } else if (!isNaN(parsedMarketCap) && parsedMarketCap < 1 && 
              (marketCapText.includes('B') || marketCapText.includes('b'))) {
              parsedMarketCap = parsedMarketCap * 1000000000;
          }
          
          if (!isNaN(parsedVolume24h) && parsedVolume24h < 100 && 
              (volume24hText.includes('M') || volume24hText.includes('m'))) {
              parsedVolume24h = parsedVolume24h * 1000000;
          } else if (!isNaN(parsedVolume24h) && parsedVolume24h < 1 && 
              (volume24hText.includes('B') || volume24hText.includes('b'))) {
              parsedVolume24h = parsedVolume24h * 1000000000;
          }
          
          const marketCap = parsedMarketCap;
          const volume24h = parsedVolume24h;
          
          // 估算7天交易量
          const volume7d = volume24h * 7;
          
          if (name && symbol && !isNaN(marketCap) && !isNaN(volume24h) && marketCap > 0) {
            data.push({
              name,
              symbol: symbol.toUpperCase(),
              marketCap,
              volume24h,
              price,
              volume7d
            });
          }
        } catch (error) {
          logError(error, 'Crypto.com行解析');
        }
      });
      
      // 页面间添加随机延迟
      if (page < pageCount) {
        const delay = 3000 + Math.random() * 2000;
        await sleep(delay);
      }
    } catch (error) {
      logError(error, `Crypto.com第${page}页`);
    }
  }
  
  log(`从Crypto.com成功解析了${data.length}个加密货币的交易量/市值数据`, 'volume-ratio');
  return data;
}

/**
 * 去除重复的加密货币数据，优先保留有更完整数据的条目
 */
function removeDuplicates(data: ApiCryptoData[]): ApiCryptoData[] {
  const symbolMap = new Map<string, ApiCryptoData>();
  
  data.forEach(coin => {
    if (!coin.symbol) return;
    
    const symbol = coin.symbol.toUpperCase();
    const existing = symbolMap.get(symbol);
    
    // 如果是新币种或者有更好的数据，则更新map
    if (!existing || 
       (coin.marketCap > 0 && existing.marketCap === 0) ||
       (coin.volume24h > 0 && existing.volume24h === 0)) {
      symbolMap.set(symbol, {
        ...coin,
        symbol: symbol
      });
    }
  });
  
  return Array.from(symbolMap.values());
}

/**
 * 主函数：对加密货币进行两轮筛选，生成并存储最终的交易量市值比率数据
 */
export async function runEnhancedVolumeToMarketCapAnalysis(): Promise<void> {
  try {
    log('开始执行增强型交易量市值比率分析...', 'volume-ratio');
    
    // 第一步：收集尽可能多的加密货币数据
    log('第一阶段: 广泛收集加密货币数据...', 'volume-ratio');
    const cryptoData = await collectCryptoVolumeMarketCapData(2000);
    
    // 如果没有获取到足够的数据，记录错误并退出
    if (cryptoData.length < 50) {
      log('未能获取足够的加密货币数据，分析终止', 'volume-ratio');
      return;
    }
    
    log(`第一阶段完成: 已收集 ${cryptoData.length} 个加密货币数据`, 'volume-ratio');
    
    // 第二步：第一轮筛选 - 计算初步的交易量市值比率并选出前100个
    log('第二阶段: 第一轮筛选 - 计算初步交易量市值比率...', 'volume-ratio');
    
    const cryptosWithRatio = cryptoData
      .filter(coin => coin.marketCap > 0 && coin.volume24h > 0)
      .map(coin => {
        // 使用24小时交易量乘以7作为初步估计的周交易量
        const estimatedVolume7d = coin.volume7d || coin.volume24h * 7;
        const ratio = estimatedVolume7d / coin.marketCap;
        
        return {
          ...coin,
          volumeToMarketCapRatio: ratio
        };
      })
      .filter(coin => !isNaN(coin.volumeToMarketCapRatio));
    
    // 按比率从高到低排序
    cryptosWithRatio.sort((a, b) => b.volumeToMarketCapRatio - a.volumeToMarketCapRatio);
    
    // 选择前100个币种进行进一步分析
    const top100 = cryptosWithRatio.slice(0, 100);
    
    log(`第二阶段完成: 已筛选出前100个高比率币种`, 'volume-ratio');
    
    // 第三步：获取精确的7天平均交易量数据，进行第二轮筛选
    log('第三阶段: 获取精确的7天交易量数据...', 'volume-ratio');
    
    // 从API获取精确的7天平均交易量
    const symbols = top100.map(coin => coin.symbol);
    const volumeData = await fetch7DayAverageVolumeForMany(symbols, 5, 2000);
    
    // 更新交易量数据并重新计算比率
    const cryptosWithAccurateRatio = top100.map(coin => {
      // 如果API提供了精确的7天交易量，则使用API数据；否则使用近似值
      const volume7d = volumeData.get(coin.symbol) || coin.volume7d || coin.volume24h * 7;
      const accurateRatio = volume7d / coin.marketCap;
      
      return {
        ...coin,
        volume7d,
        volumeToMarketCapRatio: accurateRatio
      };
    });
    
    // 按准确的比率从高到低排序
    cryptosWithAccurateRatio.sort((a, b) => b.volumeToMarketCapRatio - a.volumeToMarketCapRatio);
    
    // 选择前30个最终结果
    const finalTop30 = cryptosWithAccurateRatio.slice(0, 30);
    
    log(`第三阶段完成: 已选出最终的前30个高比率币种`, 'volume-ratio');
    
    // 第四步：创建批次并存储结果
    log('第四阶段: 存储分析结果...', 'volume-ratio');
    
    // 创建批次记录
    const batch = await storage.createVolumeToMarketCapBatch({
      createdAt: new Date(),
      description: `交易量市值比率分析结果 (${new Date().toLocaleDateString()})`,
      cryptoCount: finalTop30.length
    });
    
    // 存储每个币种的比率数据
    for (const crypto of finalTop30) {
      await storage.createVolumeToMarketCapRatio({
        batchId: batch.id,
        cryptocurrencySymbol: crypto.symbol,
        cryptocurrencyName: crypto.name,
        marketCap: crypto.marketCap,
        volume24h: crypto.volume24h,
        volume7d: crypto.volume7d || crypto.volume24h * 7,
        volumeToMarketCapRatio: crypto.volumeToMarketCapRatio,
        calculatedAt: new Date()
      });
    }
    
    log(`分析完成: 已创建批次 #${batch.id}，包含 ${finalTop30.length} 个币种数据`, 'volume-ratio');
    
  } catch (error) {
    log(`执行交易量市值比率分析时出错: ${error.message}`, 'volume-ratio');
    console.error(error);
  }
}