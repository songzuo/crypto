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
  // 已知的加密货币新闻网站 (扩展到20个主要来源)
  CRYPTO_NEWS_SITES: [
    { 
      url: "https://cointelegraph.com/", 
      articleSelector: "article", 
      titleSelector: "h2, .header",
      linkSelector: "a", 
      summarySelector: ".description, .post-card-inline-description"
    },
    { 
      url: "https://www.coindesk.com/", 
      articleSelector: "article", 
      titleSelector: "h2.heading, h4",
      linkSelector: "a", 
      summarySelector: ".description"
    },
    { 
      url: "https://decrypt.co/", 
      articleSelector: ".card, article", 
      titleSelector: "h2, h3",
      linkSelector: "a", 
      summarySelector: ".description, p"
    },
    { 
      url: "https://www.theblockcrypto.com/", 
      articleSelector: "article, .post", 
      titleSelector: "h2, h3",
      linkSelector: "a", 
      summarySelector: ".summary, .excerpt"
    },
    { 
      url: "https://bitcoinist.com/", 
      articleSelector: "article, .post", 
      titleSelector: "h2, h3",
      linkSelector: "a", 
      summarySelector: ".excerpt, p"
    },
    { 
      url: "https://www.bitcoin.com/news/", 
      articleSelector: "article, .article-card", 
      titleSelector: "h3, .article-card-title",
      linkSelector: "a", 
      summarySelector: ".article-card-excerpt, p"
    },
    { 
      url: "https://news.bitcoin.com/", 
      articleSelector: ".story, article", 
      titleSelector: "h3, h2, .entry-title",
      linkSelector: "a", 
      summarySelector: ".entry-excerpt, p"
    },
    { 
      url: "https://www.cryptonews.com/", 
      articleSelector: ".article, .cn-tile", 
      titleSelector: ".cn-tile-header, h4, h2",
      linkSelector: "a", 
      summarySelector: ".cn-tile-excerpt, p"
    },
    { 
      url: "https://cryptoslate.com/news/", 
      articleSelector: "article, .post-card", 
      titleSelector: "h2, .title",
      linkSelector: "a", 
      summarySelector: ".excerpt, p"
    },
    { 
      url: "https://dailyhodl.com/", 
      articleSelector: "article, .post", 
      titleSelector: "h3, .entry-title",
      linkSelector: "a", 
      summarySelector: ".entry-content p, .excerpt"
    },
    { 
      url: "https://www.newsbtc.com/", 
      articleSelector: "article, .jeg_post", 
      titleSelector: "h2, .jeg_post_title",
      linkSelector: "a", 
      summarySelector: ".jeg_post_excerpt, p"
    },
    { 
      url: "https://cryptopotato.com/", 
      articleSelector: "article, .post", 
      titleSelector: "h2, .title, h3",
      linkSelector: "a", 
      summarySelector: ".excerpt, p"
    },
    { 
      url: "https://ambcrypto.com/", 
      articleSelector: "article, .post", 
      titleSelector: "h2, .entry-title",
      linkSelector: "a", 
      summarySelector: ".entry-content p"
    },
    { 
      url: "https://u.today/", 
      articleSelector: "article, .article-card", 
      titleSelector: "h2, .article-card__title",
      linkSelector: "a", 
      summarySelector: ".article-card__lead, p"
    },
    { 
      url: "https://cryptobriefing.com/", 
      articleSelector: "article, .article-card", 
      titleSelector: "h2, h3, .title",
      linkSelector: "a", 
      summarySelector: ".excerpt, p"
    },
    { 
      url: "https://beincrypto.com/", 
      articleSelector: "article, .bic-article", 
      titleSelector: "h2, .title",
      linkSelector: "a", 
      summarySelector: ".subtitle, p"
    },
    { 
      url: "https://zycrypto.com/", 
      articleSelector: "article, .post", 
      titleSelector: "h3, .entry-title",
      linkSelector: "a", 
      summarySelector: ".entry-excerpt, p"
    },
    { 
      url: "https://www.crypto-news-flash.com/", 
      articleSelector: "article, .article", 
      titleSelector: "h3, .article-title",
      linkSelector: "a", 
      summarySelector: ".article-excerpt, p"
    },
    { 
      url: "https://coinpedia.org/", 
      articleSelector: "article, .post", 
      titleSelector: "h2, .entry-title",
      linkSelector: "a", 
      summarySelector: ".entry-content p"
    },
    { 
      url: "https://bitcoinmagazine.com/", 
      articleSelector: "article, .article", 
      titleSelector: "h2, .title",
      linkSelector: "a", 
      summarySelector: ".description, p"
    }
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
 * 从指定的加密货币新闻网站抓取最新新闻
 */
async function scrapeNewsSite(site: typeof CONFIG.CRYPTO_NEWS_SITES[0]): Promise<InsertCryptoNews[]> {
  console.log(`从 ${site.url} 抓取新闻...`);
  const articles: InsertCryptoNews[] = [];
  
  try {
    const html = await fetchWebPage(site.url);
    const $ = cheerio.load(html);
    
    // 查找所有文章元素
    $(site.articleSelector).each((_, element) => {
      try {
        // 提取标题
        const titleElement = $(element).find(site.titleSelector).first();
        const title = titleElement.text().trim();
        
        // 提取链接
        const linkElement = titleElement.parent().is('a') ? titleElement.parent() : $(element).find(site.linkSelector).first();
        let href = linkElement.attr('href');
        
        // 处理相对URL
        if (href && !href.startsWith('http')) {
          if (href.startsWith('/')) {
            const baseUrl = new URL(site.url);
            href = `${baseUrl.protocol}//${baseUrl.host}${href}`;
          } else {
            href = new URL(href, site.url).toString();
          }
        }
        
        // 提取摘要
        let summary = $(element).find(site.summarySelector).first().text().trim();
        if (!summary) {
          // 尝试获取第一段文本作为摘要
          summary = $(element).find('p').first().text().trim();
        }
        
        // 限制摘要长度
        if (summary && summary.length > 300) {
          summary = summary.substring(0, 297) + '...';
        }
        
        if (title && href && summary && title.length > 10 && summary.length > 15) {
          const source = new URL(site.url).hostname.replace('www.', '');
          
          // 检查该文章是否已经存在（避免重复）
          if (!articles.some(a => a.title === title || a.url === href)) {
            articles.push({
              title,
              url: href,
              summary,
              source,
              publishedAt: new Date()
            });
          }
        }
      } catch (e) {
        console.log(`解析文章时出错: ${e}`);
      }
    });
    
    console.log(`从 ${site.url} 找到 ${articles.length} 条新闻`);
    return articles;
  } catch (error) {
    console.error(`从 ${site.url} 抓取新闻时出错:`, error);
    return [];
  }
}

/**
 * 通过Google搜索发现更多加密货币新闻网站
 */
async function discoverNewsWebsites(): Promise<string[]> {
  console.log("搜索加密货币新闻网站...");
  const newsUrls: string[] = [];
  
  try {
    // 构建搜索查询
    const query = encodeURIComponent("top cryptocurrency news sites");
    const searchUrl = `${CONFIG.GOOGLE_SEARCH_URL}${query}`;
    
    const html = await fetchWebPage(searchUrl);
    const $ = cheerio.load(html);
    
    // 查找所有包含"news"的链接
    $('a[href*="http"]').each((_, element) => {
      const href = $(element).attr('href');
      
      if (href) {
        try {
          let url = href;
          if (url.startsWith('/url?q=')) {
            url = url.substring(7);
            const endIndex = url.indexOf('&');
            if (endIndex !== -1) {
              url = url.substring(0, endIndex);
            }
            url = decodeURIComponent(url);
          }
          
          // 只保留看起来像新闻网站的URL
          if (url.includes('crypto') && 
              (url.includes('news') || url.includes('blog')) && 
              !url.includes('google') && 
              !url.includes('youtube') && 
              !url.includes('facebook') && 
              !url.includes('twitter')) {
            
            // 提取主域名
            const urlObj = new URL(url);
            const domain = `${urlObj.protocol}//${urlObj.hostname}/`;
            
            if (!newsUrls.includes(domain) && !CONFIG.CRYPTO_NEWS_SITES.some(s => s.url === domain)) {
              newsUrls.push(domain);
            }
          }
        } catch (e) {
          // 忽略解析错误
        }
      }
    });
    
    console.log(`发现 ${newsUrls.length} 个新闻网站`);
    return newsUrls;
  } catch (error) {
    console.error("搜索新闻网站时出错:", error);
    return [];
  }
}

/**
 * 从发现的网站抓取新闻
 */
async function scrapeDiscoveredSite(url: string): Promise<InsertCryptoNews[]> {
  console.log(`尝试从 ${url} 抓取新闻...`);
  const articles: InsertCryptoNews[] = [];
  
  try {
    const html = await fetchWebPage(url);
    const $ = cheerio.load(html);
    
    // 寻找潜在的文章元素
    const articleSelectors = ['article', '.article', '.post', '.news-item', '.card'];
    const titleSelectors = ['h1', 'h2', 'h3', '.title', '.heading'];
    
    // 尝试所有可能的文章选择器
    for (const articleSelector of articleSelectors) {
      $(articleSelector).each((_, element) => {
        try {
          // 寻找标题
          let title = '';
          let titleElement = null;
          
          for (const titleSelector of titleSelectors) {
            const el = $(element).find(titleSelector).first();
            if (el.length && el.text().trim()) {
              title = el.text().trim();
              titleElement = el;
              break;
            }
          }
          
          if (!title || title.length < 10) {
            // Skip this article if no good title
            return;
          }
          
          // 寻找链接
          let href = '';
          const linkElement = titleElement && titleElement.parent().is('a') 
            ? titleElement.parent() 
            : $(element).find('a').first();
            
          href = linkElement.attr('href') || '';
          
          // 处理相对URL
          if (href && !href.startsWith('http')) {
            if (href.startsWith('/')) {
              const baseUrl = new URL(url);
              href = `${baseUrl.protocol}//${baseUrl.host}${href}`;
            } else {
              href = new URL(href, url).toString();
            }
          }
          
          if (!href) {
            // Skip if no href
            return;
          }
          
          // 寻找摘要
          let summary = $(element).find('p').first().text().trim();
          if (!summary || summary.length < 15) {
            // 尝试其他可能包含摘要的元素
            const summarySelectors = ['.summary', '.excerpt', '.description', '.content p', '.text'];
            for (const summarySelector of summarySelectors) {
              const summ = $(element).find(summarySelector).first().text().trim();
              if (summ && summ.length > 15) {
                summary = summ;
                break;
              }
            }
          }
          
          // 如果还没找到摘要，使用第一段内容
          if (!summary || summary.length < 15) {
            summary = $(element).text().trim().substring(0, 300);
          }
          
          // 限制摘要长度
          if (summary && summary.length > 300) {
            summary = summary.substring(0, 297) + '...';
          }
          
          if (title && href && summary) {
            const source = new URL(url).hostname.replace('www.', '');
            
            // 检查该文章是否已经存在（避免重复）
            if (!articles.some(a => a.title === title || a.url === href)) {
              articles.push({
                title,
                url: href,
                summary,
                source,
                publishedAt: new Date()
              });
            }
          }
        } catch (e) {
          // 忽略解析错误
        }
      });
      
      // 如果已经找到了足够的文章，就停止尝试其他选择器
      if (articles.length >= 5) break;
    }
    
    console.log(`从 ${url} 找到 ${articles.length} 条新闻`);
    return articles;
  } catch (error) {
    console.error(`从 ${url} 抓取新闻时出错:`, error);
    return [];
  }
}

/**
 * 主函数：抓取加密货币新闻并存储
 */
export async function scrapeCryptoNews(): Promise<number> {
  console.log("开始抓取加密货币新闻...");
  let totalNewsAdded = 0;
  let allArticles: InsertCryptoNews[] = [];
  
  // 1. 首先从已知的加密货币新闻网站抓取
  for (const site of CONFIG.CRYPTO_NEWS_SITES) {
    try {
      const articles = await scrapeNewsSite(site);
      allArticles = [...allArticles, ...articles];
      
      // 添加随机延迟以防止被检测
      await delay(1000 + Math.random() * 2000);
    } catch (error) {
      console.error(`抓取 ${site.url} 时出错:`, error);
    }
  }
  
  // 2. 如果从已知网站没有获取到足够的新闻，尝试发现更多新闻源
  if (allArticles.length < 10) {
    console.log("已知网站新闻不足，尝试发现更多新闻源...");
    
    // 发现新的新闻网站
    const discoveredSites = await discoverNewsWebsites();
    
    // 从随机选择的3个发现的网站抓取新闻
    const sitesToScrape = discoveredSites
      .sort(() => 0.5 - Math.random())
      .slice(0, 3);
    
    for (const site of sitesToScrape) {
      try {
        const articles = await scrapeDiscoveredSite(site);
        allArticles = [...allArticles, ...articles];
        
        // 添加随机延迟以防止被检测
        await delay(1000 + Math.random() * 2000);
      } catch (error) {
        console.error(`抓取发现的网站 ${site} 时出错:`, error);
      }
    }
  }
  
  // 3. 如果还是没有足够的新闻，回退到Google搜索
  if (allArticles.length < 5) {
    console.log("从网站直接抓取新闻不足，回退到Google搜索...");
    
    // 随机选择几个搜索查询以减少被屏蔽的可能性
    const selectedQueries = [...CONFIG.SEARCH_QUERIES]
      .sort(() => 0.5 - Math.random())
      .slice(0, CONFIG.BATCH_SIZE);
    
    for (const query of selectedQueries) {
      try {
        const newsArticles = await searchGoogleForNews(query);
        console.log(`从Google搜索"${query}"找到 ${newsArticles.length} 条新闻`);
        
        allArticles = [...allArticles, ...newsArticles];
        
        // 添加随机延迟以防止被检测
        await delay(1000 + Math.random() * 2000);
      } catch (error) {
        console.error(`Google搜索"${query}"时出错:`, error);
      }
    }
  }
  
  // 去除重复文章（基于URL和标题）
  const uniqueArticles = allArticles.filter((article, index, self) => 
    index === self.findIndex(a => a.url === article.url || a.title === article.title)
  );
  
  console.log(`找到 ${allArticles.length} 条新闻，去重后 ${uniqueArticles.length} 条`);
  
  // 存储所有收集到的新闻
  for (const article of uniqueArticles) {
    await storage.createCryptoNews(article);
    totalNewsAdded++;
  }
  
  // 清理旧新闻，保持在最大限制之内
  const removedCount = await storage.cleanupOldNews(CONFIG.MAX_NEWS_COUNT);
  if (removedCount > 0) {
    console.log(`已清理 ${removedCount} 条旧新闻，保持在 ${CONFIG.MAX_NEWS_COUNT} 条限制之内`);
  }
  
  console.log(`加密货币新闻抓取完成，共添加 ${totalNewsAdded} 条新闻`);
  return totalNewsAdded;
}