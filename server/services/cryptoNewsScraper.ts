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
  
  // 尝试多种选择器以适应Google搜索结果的各种变化
  // 现代Google搜索结果选择器
  $('div.g, div.rso > div, div[data-hveid], div.MjjYud, div.yuRUbf').each((_, element) => {
    // 尝试多种标题选择器
    const titleElement = $(element).find('h3, .LC20lb');
    const title = titleElement.text().trim();
    
    // 尝试多种链接选择器
    const linkElement = $(element).find('a[href]').first();
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
    
    // 尝试多种摘要选择器
    const snippetElement = $(element).find('.VwiC3b, .st, .IsZvec, div[data-content-feature="1"]');
    let summary = snippetElement.text().trim();
    
    // 确保摘要不为空
    if (!summary) {
      // 备用：尝试获取父元素中的文本
      summary = $(element).find('div:contains("."):not(h3)').text().trim();
    }
    
    if (title && url && summary) {
      try {
        const source = new URL(url).hostname.replace('www.', '');
        const fetchedAt = new Date();
        
        // 只添加独特的文章（基于URL）
        if (!articles.some(a => a.url === url)) {
          articles.push({
            title,
            url,
            summary,
            source,
            publishedAt: new Date()
          });
        }
      } catch (e) {
        console.log(`无法解析URL: ${url}`, e);
      }
    }
  });
  
  // 如果上面的选择器没有匹配到任何内容，尝试更通用的方法
  if (articles.length === 0) {
    $('a').each((_, element) => {
      const $a = $(element);
      const href = $a.attr('href');
      
      // 只处理看起来像新闻文章的链接
      if (href && href.includes('http') && 
          (href.includes('news') || href.includes('article') || href.includes('blog'))) {
        
        let url = href;
        if (href.startsWith('/url?q=')) {
          url = href.substring(7);
          const endIndex = url.indexOf('&');
          if (endIndex !== -1) {
            url = url.substring(0, endIndex);
          }
          url = decodeURIComponent(url);
        }
        
        // 获取周围的文本作为标题和摘要
        const parent = $a.parent().parent();
        const title = $a.text().trim() || parent.find('h3, h2, strong').text().trim();
        let summary = '';
        
        // 尝试获取周围的文本作为摘要
        parent.contents().each((_, node) => {
          if (node.type === 'text' && $(node).text().trim().length > 20) {
            summary = $(node).text().trim();
          }
        });
        
        if (!summary) {
          summary = parent.text().replace(title, '').trim();
        }
        
        if (title && url && summary && 
            title.length > 10 && summary.length > 20 && 
            !articles.some(a => a.url === url)) {
          try {
            const source = new URL(url).hostname.replace('www.', '');
            articles.push({
              title,
              url,
              summary: summary.substring(0, 300), // 限制摘要长度
              source,
              publishedAt: new Date()
            });
          } catch (e) {
            console.log(`无法解析URL: ${url}`, e);
          }
        }
      }
    });
  }
  
  return articles;
}

/**
 * 执行谷歌搜索以获取加密货币新闻
 */
async function searchGoogleForNews(query: string, retryCount = 0): Promise<InsertCryptoNews[]> {
  try {
    // 增强查询 - 添加"news"和日期限制以获取最新结果
    let enhancedQuery = `${query} news`;
    
    // 添加近期限制，偶尔随机添加当前年份
    if (Math.random() > 0.5) {
      const currentYear = new Date().getFullYear();
      enhancedQuery += ` ${currentYear}`;
    }
    
    // 随机添加源站限制来尝试获取权威来源的内容
    const newsSources = [
      'coindesk.com', 
      'cointelegraph.com', 
      'crypto.com/news', 
      'decrypt.co',
      'coinmarketcap.com/alexandria'
    ];
    
    // 30%的概率添加特定来源限制
    if (Math.random() > 0.7) {
      const randomSourceIndex = Math.floor(Math.random() * newsSources.length);
      enhancedQuery += ` site:${newsSources[randomSourceIndex]}`;
    }
    
    const encodedQuery = encodeURIComponent(enhancedQuery);
    const searchUrl = `${CONFIG.GOOGLE_SEARCH_URL}${encodedQuery}&tbm=nws`;
    
    console.log(`搜索加密货币新闻: "${enhancedQuery}"`);
    const html = await fetchWebPage(searchUrl);
    let articles = extractNewsArticles(html);
    
    // 如果没有找到文章，尝试备用查询
    if (articles.length === 0 && retryCount < 1) {
      // 尝试不带新闻标签的普通搜索
      const fallbackUrl = `${CONFIG.GOOGLE_SEARCH_URL}${encodeURIComponent(query)}`;
      console.log(`尝试备用搜索: "${query}"`);
      const fallbackHtml = await fetchWebPage(fallbackUrl);
      articles = extractNewsArticles(fallbackHtml);
    }
    
    return articles;
  } catch (error) {
    if (retryCount < CONFIG.RETRY_ATTEMPTS) {
      console.log(`搜索"${query}"失败，${retryCount + 1}/${CONFIG.RETRY_ATTEMPTS}次重试...`);
      await delay(CONFIG.RETRY_DELAY_MS + Math.random() * 2000); // 增加随机延迟
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