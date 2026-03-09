
import axios from 'axios';
import * as cheerio from 'cheerio';
import { log } from '../vite';
import { ApiCryptoData } from './cryptoApiAggregator';

// 接口定义
export interface ChinaCryptoData extends ApiCryptoData {
  source: string;
  timestamp: number;
}

// 模拟浏览器Headers
const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
  'Connection': 'keep-alive',
  'Cache-Control': 'max-age=0'
};

// ------------------------------------------------------------------
// 方法一：国内可用聚合API
// ------------------------------------------------------------------

/**
 * 从沧海数据获取历史/实时数据
 * 文档: https://tsanghi.com/api/fin
 */
export async function fetchFromTsanghi(symbol: string = 'BTC'): Promise<ChinaCryptoData | null> {
  try {
    const apiToken = process.env.TSANGHI_API_TOKEN;
    if (!apiToken) {
      log('未配置 TSANGHI_API_TOKEN，跳过沧海数据获取', 'china-data');
      return null;
    }

    log(`正在从沧海数据获取 ${symbol} ...`, 'china-data');

    // 注意：沧海数据通常需要具体的 ticker 和 currency
    // 这里假设 symbol 是 BTC 这样的格式
    
    // 示例URL，实际需根据官方文档调整
    const url = `https://tsanghi.com/api/fin/crypto/daily`; 
    const params = {
      token: apiToken,
      ticker: symbol,
      currency: 'USDT', // 默认对USDT
      limit: 1 
    };

    const response = await axios.get(url, { 
      params,
      timeout: 10000 
    });

    if (response.status === 200 && response.data) {
      // 解析响应数据 - 需根据实际API响应结构调整
      // 假设返回结构包含 price, volume 等
      const data = response.data;
      return {
        name: symbol,
        symbol: symbol,
        price: Number(data.price) || 0,
        marketCap: Number(data.market_cap) || 0,
        volume24h: Number(data.volume) || 0,
        source: 'Tsanghi',
        timestamp: Date.now()
      };
    }
  } catch (error) {
    log(`沧海数据获取失败: ${error instanceof Error ? error.message : String(error)}`, 'china-data');
  }
  return null;
}

/**
 * 从沧海数据获取历史数据
 * @param symbol 交易对
 * @param days 获取天数
 */
export async function fetchHistoryFromTsanghi(symbol: string, days: number = 7): Promise<any[]> {
  try {
    const apiToken = process.env.TSANGHI_API_TOKEN;
    if (!apiToken) {
        return [];
    }

    const endDate = new Date().toISOString().split('T')[0];
    const startDateObj = new Date();
    startDateObj.setDate(startDateObj.getDate() - days);
    const startDate = startDateObj.toISOString().split('T')[0];

    const url = "https://tsanghi.com/api/fin/crypto/daily";
    const params = {
        token: apiToken,
        ticker: symbol,
        currency: 'USDT',
        start_date: startDate,
        end_date: endDate
    };

    const response = await axios.get(url, { params, timeout: 15000 });
    
    if (response.status === 200 && response.data && Array.isArray(response.data)) {
        return response.data;
    }
    
    // 如果返回格式不同，需适配
    return [];

  } catch (error) {
      log(`沧海历史数据获取失败: ${error instanceof Error ? error.message : String(error)}`, 'china-data');
      return [];
  }
}

/**
 * 从iTick获取数据
 * 文档: https://api.itick.com
 */
export async function fetchFromITick(symbol: string = 'BTC'): Promise<ChinaCryptoData | null> {
  try {
    // 仅作为示例，实际需参考 iTick 文档
    // const response = await axios.get(...)
    // return parsedData;
    return null; 
  } catch (error) {
    return null;
  }
}

// ------------------------------------------------------------------
// 方法二：网页抓取 (Web Scraping)
// ------------------------------------------------------------------

/**
 * 从文本中提取美元价格
 * 使用多种正则模式匹配
 */
function extractUsdPrice(text: string): number {
  const patterns = [
    /"price"\s*:\s*([0-9]+(?:\.[0-9]+)?)/i,
    /(?:\$|USD)[^0-9]*([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]+)?)/i,
    /data-last\s*=\s*"([0-9]+(?:\.[0-9]+)?)"/i,
    /¥\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]+)?)/ // 匹配人民币，粗略转换
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      let price = parseFloat(match[1].replace(/,/g, ''));
      // 简单的CNY检测与转换 (假设汇率 7.2)
      if (pattern.source.includes('¥')) {
        price = price / 7.2;
      }
      return price;
    }
  }
  return 0;
}

/**
 * 抓取金色财经 (Jinse)
 */
export async function scrapeJinse(symbol: string): Promise<ChinaCryptoData | null> {
  try {
    // 映射 symbol 到 slug，简单处理：转小写，特定币种可能需要映射表
    const slug = symbol.toLowerCase();
    // const url = `https://m.jinse.cn/coin/search?coin=${slug}`;
    // 金色财经的搜索页可能不是直接的数据页，尝试直接访问币种详情页或搜索API
    // 这里使用说明文档中的URL
    const url = `https://m.jinse.cn/coin/${slug}`; 

    const response = await axios.get(url, {
      headers: BROWSER_HEADERS,
      timeout: 8000
    });

    if (response.status === 200) {
      const price = extractUsdPrice(response.data);
      if (price > 0) {
         return {
          name: symbol,
          symbol: symbol,
          price: price,
          marketCap: 0, // 抓取通常较难获取准确的市值和交易量
          volume24h: 0,
          source: 'Jinse',
          timestamp: Date.now()
        };
      }
    }
  } catch (error) {
    // log(`Jinse scraping failed for ${symbol}`, 'china-data');
  }
  return null;
}

/**
 * 抓取非小号 (Feixiaohao) 单个币种
 */
export async function scrapeFeixiaohao(symbol: string): Promise<ChinaCryptoData | null> {
  try {
    const slug = symbol.toLowerCase();
    // 非小号的URL结构通常是 currencies/slug
    // 常见的 slug 映射: btc -> bitcoin, eth -> ethereum
    let targetSlug = slug;
    if (slug === 'btc') targetSlug = 'bitcoin';
    if (slug === 'eth') targetSlug = 'ethereum';
    
    const url = `https://www.feixiaohao.com/currencies/${targetSlug}/`;

    const response = await axios.get(url, {
      headers: BROWSER_HEADERS,
      timeout: 8000
    });

    if (response.status === 200) {
      const $ = cheerio.load(response.data);
      
      // 尝试通过选择器提取
      // 非小号的页面结构可能会变，这里尝试一些常见的类名
      let priceText = $('.price').first().text() || $('.mainPrice').text() || '';
      
      let price = 0;
      if (priceText) {
        // 移除 ¥, $, , 等字符
        priceText = priceText.replace(/[¥$,\s]/g, '');
        price = parseFloat(priceText);
        
        // 非小号通常显示CNY，需要转换
        if (response.data.includes('CNY') || response.data.includes('人民币')) {
           price = price / 7.2; // 估算汇率
        }
      } else {
        // 回退到正则提取
        price = extractUsdPrice(response.data);
      }

      if (price > 0) {
        return {
          name: symbol,
          symbol: symbol,
          price: price,
          marketCap: 0,
          volume24h: 0,
          source: 'Feixiaohao',
          timestamp: Date.now()
        };
      }
    }
  } catch (error) {
    log(`非小号单个抓取失败: ${error instanceof Error ? error.message : String(error)}`, 'china-data');
  }
  return null;
}

/**
 * 解析中文数字字符串 (e.g. "1.2亿", "3000万")
 */
function parseChineseNumber(text: string): number {
    if (!text) return 0;
    
    // 移除 ¥, $, , 等
    let cleanText = text.replace(/[¥$,\s]/g, '');
    
    let multiplier = 1;
    if (cleanText.includes('亿')) {
        multiplier = 100000000;
        cleanText = cleanText.replace('亿', '');
    } else if (cleanText.includes('万')) {
        multiplier = 10000;
        cleanText = cleanText.replace('万', '');
    }

    const val = parseFloat(cleanText);
    if (isNaN(val)) return 0;
    return val * multiplier;
}

/**
 * 抓取非小号 (Feixiaohao) 市值排行榜前N名
 */
export async function scrapeFeixiaohaoTopList(limit: number = 100): Promise<ChinaCryptoData[]> {
  try {
    const url = 'https://www.feixiaohao.com/';
    log(`正在抓取非小号排行榜: ${url}`, 'china-data');

    const response = await axios.get(url, {
      headers: BROWSER_HEADERS,
      timeout: 10000
    });

    if (response.status !== 200) {
      return [];
    }

    const $ = cheerio.load(response.data);
    const results: ChinaCryptoData[] = [];

    // 非小号首页表格选择器，需根据实际页面结构调整
    // 假设表格在 table.main-table tbody tr
    $('table tbody tr').each((i, el) => {
      if (i >= limit) return false;

      try {
        const row = $(el);
        const tds = row.find('td');
        
        // 粗略提取：
        // 名字通常在第2列
        const nameText = $(tds[1]).text().trim();
        // 拆分 NameSymbol，例如 "Bitcoin\nBTC"
        const nameParts = nameText.split(/\s+/);
        let name = nameParts[0];
        let symbol = nameParts.length > 1 ? nameParts[1] : nameParts[0];
        
        // 简单的过滤掉中文名称如果存在
        if (/[\u4e00-\u9fa5]/.test(name)) {
            // 如果名字包含中文，尝试找英文部分
             const symbolMatch = nameText.match(/[A-Z]{2,}/);
             if (symbolMatch) symbol = symbolMatch[0];
        }

        // 价格在第3列
        const priceText = $(tds[2]).text().trim();
        const price = extractUsdPrice(priceText);

        // 市值在第5列 or 6列
        const marketCapText = $(tds[5]).text().trim(); 
        const marketCap = parseChineseNumber(marketCapText);

        // 24h成交量
        const volumeText = $(tds[6]).text().trim(); 
        const volume24h = parseChineseNumber(volumeText);

        if (price > 0 && symbol) {
             let finalPrice = price;
             let finalMarketCap = marketCap;
             let finalVolume = volume24h;

             if (response.data.includes('CNY') || response.data.includes('人民币')) {
                 finalMarketCap = finalMarketCap / 7.2;
                 finalVolume = finalVolume / 7.2;
             }

             results.push({
                name: name || symbol,
                symbol: symbol,
                price: finalPrice,
                marketCap: finalMarketCap,
                volume24h: finalVolume,
                source: 'Feixiaohao',
                timestamp: Date.now()
             });
        }

      } catch (err) {
        // 忽略单行错误
      }
    });

    log(`非小号抓取成功，获取到 ${results.length} 条数据`, 'china-data');
    return results;

  } catch (error) {
    log(`非小号排行榜抓取失败: ${error instanceof Error ? error.message : String(error)}`, 'china-data');
    return [];
  }
}

/**
 * 抓取 528btc
 */
export async function scrape528btc(symbol: string): Promise<ChinaCryptoData | null> {
    try {
        const slug = symbol.toLowerCase();
        let targetSlug = slug;
        if (slug === 'btc') targetSlug = 'bitcoin';
        if (slug === 'eth') targetSlug = 'ethereum';

        const url = `https://www.528btc.com/coin/${targetSlug}/`;
         const response = await axios.get(url, {
            headers: BROWSER_HEADERS,
            timeout: 8000
        });

        if(response.status === 200) {
             const price = extractUsdPrice(response.data);
             if (price > 0) {
                 return {
                    name: symbol,
                    symbol: symbol,
                    price: price,
                    marketCap: 0,
                    volume24h: 0,
                    source: '528btc',
                    timestamp: Date.now()
                 }
             }
        }

    } catch(error) {

    }
    return null;
}

// ------------------------------------------------------------------
// 数据共识机制
// ------------------------------------------------------------------

export function calculateConsensusPrice(prices: number[]): number {
  if (!prices || prices.length === 0) return 0;
  if (prices.length === 1) return prices[0];

  // 排序
  const sortedPrices = [...prices].sort((a, b) => a - b);
  
  // 计算中位数
  const mid = Math.floor(sortedPrices.length / 2);
  const median = sortedPrices.length % 2 !== 0 
    ? sortedPrices[mid] 
    : (sortedPrices[mid - 1] + sortedPrices[mid]) / 2;

  // 过滤异常值 (偏离中位数 > 15%)
  const validPrices = sortedPrices.filter(p => Math.abs(p - median) / median <= 0.15);

  if (validPrices.length === 0) return median;

  // 计算平均值
  const sum = validPrices.reduce((a, b) => a + b, 0);
  return sum / validPrices.length;
}

/**
 * 综合获取中国大陆可用的加密货币数据
 */
export async function fetchChinaCryptoData(symbol: string): Promise<ChinaCryptoData | null> {
  const tasks = [
    fetchFromTsanghi(symbol),
    scrapeJinse(symbol),
    scrapeFeixiaohao(symbol),
    scrape528btc(symbol)
  ];

  const results = await Promise.all(tasks);
  const validResults = results.filter((r): r is ChinaCryptoData => r !== null && r.price > 0);

  if (validResults.length === 0) {
    return null;
  }

  // 计算共识价格
  const prices = validResults.map(r => r.price);
  const consensusPrice = calculateConsensusPrice(prices);

  // 优先返回API获取的数据（如果有），并更新价格为共识价格
  const apiResult = validResults.find(r => r.source === 'Tsanghi' || r.source === 'iTick');
  if (apiResult) {
    return { ...apiResult, price: consensusPrice, source: `Consensus(${validResults.map(r=>r.source).join(',')})` };
  }

  // 否则构建一个新的结果对象
  return {
    name: symbol,
    symbol: symbol,
    price: consensusPrice,
    marketCap: 0,
    volume24h: 0,
    source: `Consensus(${validResults.map(r=>r.source).join(',')})`,
    timestamp: Date.now()
  };
}

export default {
    fetchChinaCryptoData,
    fetchFromTsanghi,
    scrapeJinse,
    scrapeFeixiaohao,
    scrapeFeixiaohaoTopList
};
