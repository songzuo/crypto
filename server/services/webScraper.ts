/**
 * Web爬虫辅助工具库
 */

import axios, { AxiosRequestConfig } from 'axios';
import { sleep } from './utils';

// 常用浏览器用户代理列表（模拟不同浏览器）
const USER_AGENTS = [
  // Chrome on Windows
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36',
  // Chrome on macOS
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36',
  // Chrome on Linux
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36',
  // Firefox on Windows
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/114.0',
  // Firefox on macOS
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:109.0) Gecko/20100101 Firefox/114.0',
  // Firefox on Linux
  'Mozilla/5.0 (X11; Linux i686; rv:109.0) Gecko/20100101 Firefox/114.0',
  'Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:109.0) Gecko/20100101 Firefox/114.0',
  // Safari on macOS
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Safari/605.1.15',
  // Microsoft Edge
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36 Edg/114.0.1823.51',
  // Opera
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36 OPR/99.0.0.0',
];

/**
 * 随机生成一个浏览器用户代理字符串
 * @returns 随机用户代理字符串
 */
export function generateRandomUserAgent(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

/**
 * 基础HTTP请求头
 * @returns 请求头对象
 */
export function getBaseHeaders(): Record<string, string> {
  return {
    'User-Agent': generateRandomUserAgent(),
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.5',
    'Accept-Encoding': 'gzip, deflate, br',
    'Connection': 'keep-alive',
    'Upgrade-Insecure-Requests': '1',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Sec-Fetch-User': '?1',
    'Cache-Control': 'max-age=0',
  };
}

/**
 * 带有重试机制的HTTP请求函数
 * @param url 请求的URL
 * @param options Axios请求配置
 * @param maxRetries 最大重试次数
 * @param retryDelay 重试延迟（毫秒）
 * @param retryCallback 重试回调函数
 * @returns Promise<AxiosResponse>
 */
export async function fetchWithRetry(
  url: string,
  options: AxiosRequestConfig = {},
  maxRetries: number = 3,
  retryDelay: number = 1000,
  retryCallback?: (attempt: number, error: any) => void
) {
  // 确保有合理的超时设置
  const config: AxiosRequestConfig = {
    timeout: 15000, // 默认15秒超时
    ...options,
    headers: {
      ...getBaseHeaders(),
      ...(options.headers || {})
    }
  };
  
  let lastError: any;
  
  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    try {
      return await axios(url, config);
    } catch (error) {
      lastError = error;
      
      // 调用回调函数（如果提供）
      if (retryCallback) {
        retryCallback(attempt, error);
      }
      
      // 如果还有重试次数，则等待后重试
      if (attempt <= maxRetries) {
        // 使用指数退避策略增加等待时间
        const delay = retryDelay * Math.pow(1.5, attempt - 1);
        await sleep(delay);
        
        // 更换用户代理以减少被屏蔽的可能性
        if (config.headers) {
          config.headers['User-Agent'] = generateRandomUserAgent();
        }
      } else {
        // 已用完所有重试机会，抛出最后一个错误
        throw lastError;
      }
    }
  }
  
  // 这一行代码实际上不会执行，因为循环中已经处理了所有情况
  throw lastError;
}

/**
 * 绕过Cloudflare保护的请求函数
 * 注意：这只是一种基本方法，可能不适用于所有Cloudflare保护页面
 * @param url 请求的URL
 * @param options Axios请求配置
 * @returns Promise<AxiosResponse>
 */
export async function fetchBypassingCloudflare(url: string, options: AxiosRequestConfig = {}) {
  // 添加更复杂的头部以尝试绕过Cloudflare
  const config: AxiosRequestConfig = {
    ...options,
    headers: {
      ...getBaseHeaders(),
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36',
      'Referer': new URL(url).origin,
      'DNT': '1',
      'Cookie': 'cf_clearance=placeholder; _ga=GA1.2.placeholder',
      ...(options.headers || {})
    }
  };
  
  try {
    // 先访问域名主页
    const domainUrl = new URL(url).origin;
    await axios.get(domainUrl, config);
    
    // 短暂延迟后再访问目标页面
    await sleep(1000);
    
    return await axios(url, config);
  } catch (error) {
    console.error(`绕过Cloudflare保护请求时出错: ${error.message}`);
    throw error;
  }
}

/**
 * 分批请求多个URL
 * @param urls 要请求的URL数组
 * @param batchSize 每批次的大小
 * @param delayBetweenBatches 批次之间的延迟（毫秒）
 * @param requestOptions Axios请求配置
 * @returns Promise<Array<{url: string, data: any, error?: any}>>
 */
export async function fetchBatch(
  urls: string[],
  batchSize: number = 5,
  delayBetweenBatches: number = 2000,
  requestOptions: AxiosRequestConfig = {}
) {
  const results: Array<{url: string, data?: any, error?: any}> = [];
  
  // 将URL分成多个批次
  for (let i = 0; i < urls.length; i += batchSize) {
    const batchUrls = urls.slice(i, i + batchSize);
    const batchPromises = batchUrls.map(url => 
      fetchWithRetry(url, requestOptions)
        .then(response => ({ url, data: response.data }))
        .catch(error => ({ url, error }))
    );
    
    // 并行处理当前批次
    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults);
    
    // 如果不是最后一批，则等待
    if (i + batchSize < urls.length) {
      await sleep(delayBetweenBatches);
    }
  }
  
  return results;
}

/**
 * 检查一个URL是否可访问
 * @param url 要检查的URL
 * @param timeout 超时时间（毫秒）
 * @returns Promise<boolean>
 */
export async function isUrlAccessible(url: string, timeout: number = 10000): Promise<boolean> {
  try {
    await axios.get(url, {
      timeout,
      headers: {
        'User-Agent': generateRandomUserAgent()
      },
      validateStatus: status => status < 400 // 只有状态码小于400才视为成功
    });
    
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * 从HTML中提取所有链接
 * @param html HTML内容
 * @param baseUrl 基础URL（用于解析相对路径）
 * @returns 链接数组
 */
export function extractLinks(html: string, baseUrl: string): string[] {
  const links: string[] = [];
  const linkRegex = /href=["'](.*?)["']/g;
  let match;
  
  while ((match = linkRegex.exec(html)) !== null) {
    try {
      const url = new URL(match[1], baseUrl).href;
      links.push(url);
    } catch (error) {
      // 忽略无效URL
    }
  }
  
  return links;
}

/**
 * 从URL创建一个规范化的主机名（用于去重）
 * @param url URL字符串
 * @returns 规范化的主机名
 */
export function getNormalizedHostname(url: string): string {
  try {
    const { hostname } = new URL(url);
    return hostname.replace(/^www\./, '');
  } catch (error) {
    return '';
  }
}