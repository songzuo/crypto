/**
 * 加密货币新闻爬虫
 * 
 * 专注于从谷歌搜索中获取最新的加密货币新闻
 * 存储最多100条最新新闻，包括标题、URL和简短摘要
 */

import { InsertCryptoNews } from "@shared/schema";
import { storage } from "../storage";
import * as cheerio from "cheerio";
import https from "https";
import { URL } from "url";

// 配置参数
const CONFIG = {
  MAX_NEWS_COUNT: 100,
  USER_AGENTS: [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1.1 Safari/605.1.15",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/92.0.4515.107 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:90.0) Gecko/20100101 Firefox/90.0",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 14_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1"
  ],
  GOOGLE_SEARCH_URL: "https://www.google.com/search?q=",
  SEARCH_QUERIES: [
    "latest crypto news",
    "cryptocurrency market news",
    "bitcoin news today",
    "ethereum news today",
    "blockchain technology news",
    "defi news"
  ],
  RETRY_ATTEMPTS: 3,
  RETRY_DELAY_MS: 2000,
  FETCH_TIMEOUT_MS: 10000,
  BATCH_SIZE: 5
};

/**
 * 获取随机用户代理
 */
function getRandomUserAgent(): string {
  const index = Math.floor(Math.random() * CONFIG.USER_AGENTS.length);
  return CONFIG.USER_AGENTS[index];
}

/**
 * 延迟指定的毫秒数
 */
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 安全地获取网页内容
 */
function fetchWebPage(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const options = {
      headers: {
        'User-Agent': getRandomUserAgent(),
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Cache-Control': 'max-age=0'
      },
      timeout: CONFIG.FETCH_TIMEOUT_MS
    };

    const req = https.get(url, options, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP Error: ${res.statusCode}`));
        return;
      }

      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        resolve(data);
      });
    });

    req.on('error', (e) => {
      reject(e);
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timed out'));
    });
  });
}

/**
 * 从网页内容中提取新闻文章
 */
function extractNewsArticles(html: string): InsertCryptoNews[] {
  const $ = cheerio.load(html);
  const articles: InsertCryptoNews[] = [];
  
  // 谷歌搜索结果通常在 <div class="g"> 元素中
  $('div.g').each((_, element) => {
    const titleElement = $(element).find('h3');
    const title = titleElement.text().trim();
    
    const linkElement = $(element).find('a');
    const href = linkElement.attr('href');
    
    let url = '';
    if (href && href.startsWith('/url?q=')) {
      url = href.substring(7); // 移除 '/url?q='
      const endIndex = url.indexOf('&');
      if (endIndex !== -1) {
        url = url.substring(0, endIndex);
      }
      url = decodeURIComponent(url);
    } else if (href && href.startsWith('http')) {
      url = href;
    }
    
    const snippetElement = $(element).find('.VwiC3b, .st');
    const summary = snippetElement.text().trim();
    
    if (title && url && summary) {
      const source = new URL(url).hostname.replace('www.', '');
      
      articles.push({
        title,
        url,
        summary,
        source,
        publishedAt: new Date()
      });
    }
  });
  
  return articles;
}

/**
 * 执行谷歌搜索以获取加密货币新闻
 */
async function searchGoogleForNews(query: string, retryCount = 0): Promise<InsertCryptoNews[]> {
  try {
    const encodedQuery = encodeURIComponent(query);
    const searchUrl = `${CONFIG.GOOGLE_SEARCH_URL}${encodedQuery}`;
    
    console.log(`搜索加密货币新闻: "${query}"`);
    const html = await fetchWebPage(searchUrl);
    return extractNewsArticles(html);
  } catch (error) {
    if (retryCount < CONFIG.RETRY_ATTEMPTS) {
      console.log(`搜索"${query}"失败，${retryCount + 1}/${CONFIG.RETRY_ATTEMPTS}次重试...`);
      await delay(CONFIG.RETRY_DELAY_MS);
      return searchGoogleForNews(query, retryCount + 1);
    } else {
      console.error(`无法获取"${query}"的搜索结果:`, error);
      return [];
    }
  }
}

/**
 * 主函数：抓取加密货币新闻并存储
 */
export async function scrapeCryptoNews(): Promise<number> {
  console.log("开始抓取加密货币新闻...");
  let totalNewsAdded = 0;
  
  // 随机选择几个搜索查询以减少被屏蔽的可能性
  const selectedQueries = [...CONFIG.SEARCH_QUERIES]
    .sort(() => 0.5 - Math.random())
    .slice(0, CONFIG.BATCH_SIZE);
  
  for (const query of selectedQueries) {
    try {
      const newsArticles = await searchGoogleForNews(query);
      console.log(`从"${query}"找到 ${newsArticles.length} 条新闻`);
      
      for (const article of newsArticles) {
        await storage.createCryptoNews(article);
        totalNewsAdded++;
      }
      
      // 添加随机延迟以防止被检测
      await delay(1000 + Math.random() * 2000);
    } catch (error) {
      console.error(`抓取"${query}"的新闻时出错:`, error);
    }
  }
  
  // 清理旧新闻，保持在最大限制之内
  const removedCount = await storage.cleanupOldNews(CONFIG.MAX_NEWS_COUNT);
  if (removedCount > 0) {
    console.log(`已清理 ${removedCount} 条旧新闻，保持在 ${CONFIG.MAX_NEWS_COUNT} 条限制之内`);
  }
  
  console.log(`加密货币新闻抓取完成，共添加 ${totalNewsAdded} 条新闻`);
  return totalNewsAdded;
}