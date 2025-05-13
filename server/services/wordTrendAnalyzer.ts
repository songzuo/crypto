/**
 * 词汇趋势分析器
 * 
 * 从加密货币新闻中分析热门词汇趋势
 * 每5分钟更新一次统计数据
 */

import { storage } from '../storage';

// 需要过滤掉的常见虚词
const STOP_WORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'in', 'on', 'at', 'to', 'for', 'with', 'by', 'about', 'against', 'between', 'into', 'through',
  'during', 'before', 'after', 'above', 'below', 'from', 'up', 'down', 'of', 'off', 'over', 'under',
  'again', 'further', 'then', 'once', 'here', 'there', 'when', 'where', 'why', 'how', 'all', 'any',
  'both', 'each', 'few', 'more', 'most', 'other', 'some', 'such', 'no', 'nor', 'not', 'only', 'own',
  'same', 'so', 'than', 'too', 'very', 's', 't', 'can', 'will', 'just', 'don', 'should', 'now',
  'i', 'me', 'my', 'myself', 'we', 'our', 'ours', 'ourselves', 'you', 'your', 'yours', 'yourself',
  'yourselves', 'he', 'him', 'his', 'himself', 'she', 'her', 'hers', 'herself', 'it', 'its', 'itself',
  'they', 'them', 'their', 'theirs', 'themselves', 'what', 'which', 'who', 'whom', 'this', 'that',
  'these', 'those', 'am', 'have', 'has', 'had', 'do', 'does', 'did', 'doing', 'would', 'could', 'should',
  'ought', 'i\'m', 'you\'re', 'he\'s', 'she\'s', 'it\'s', 'we\'re', 'they\'re', 'i\'ve', 'you\'ve',
  'we\'ve', 'they\'ve', 'i\'d', 'you\'d', 'he\'d', 'she\'d', 'we\'d', 'they\'d', 'i\'ll', 'you\'ll',
  'he\'ll', 'she\'ll', 'we\'ll', 'they\'ll', 'isn\'t', 'aren\'t', 'wasn\'t', 'weren\'t', 'hasn\'t',
  'haven\'t', 'hadn\'t', 'doesn\'t', 'don\'t', 'didn\'t', 'won\'t', 'wouldn\'t', 'shan\'t', 'shouldn\'t',
  'can\'t', 'cannot', 'couldn\'t', 'mustn\'t', 'let\'s', 'that\'s', 'who\'s', 'what\'s', 'here\'s',
  'there\'s', 'when\'s', 'where\'s', 'why\'s', 'how\'s', 'as', 'us', 'among', 'whilst', 'while',
  
  // 加密货币领域特定的常用词汇也可以考虑过滤
  'crypto', 'cryptocurrency', 'says', 'according',
  
  // 用户定制过滤的常见词汇 - 这些在新闻中很常见但不提供有效趋势信息
  'price', 'million', 'report', 'may', 'major', 'ceo', 'new', 'investors', 'investor', 
  'invest', 'surge', 'data', 'coin', 'inflows', 'inflow', 'since', 'asset', 'past', 
  'recent', 'exploit', 'exploited'
]);

// 单词频率对象类型
export interface WordFrequency {
  word: string;
  count: number;
}

// 趋势分析结果类型
export interface TrendAnalysisResult {
  timestamp: Date;
  topWords: WordFrequency[];
}

let lastAnalysisResult: TrendAnalysisResult | null = null;
let lastAnalysisTime: Date = new Date(0); // 1970-01-01

/**
 * 对文本进行词频分析
 */
function analyzeText(text: string): Map<string, number> {
  const wordFrequency = new Map<string, number>();
  
  if (!text) return wordFrequency;
  
  // 将文本转换为小写并分割成单词
  const words = text.toLowerCase()
    .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, '') // 移除标点符号
    .split(/\s+/);
  
  // 统计每个单词的出现频率
  for (const word of words) {
    // 过滤条件:
    // 1. 空字符串
    // 2. 停用词列表中的词
    // 3. 长度小于等于2的词
    // 4. 纯数字
    // 5. 包含特殊字符的词
    if (!word || 
        STOP_WORDS.has(word) || 
        word.length <= 2 || 
        /^\d+$/.test(word) ||  // 过滤纯数字
        /[^\w\s]/.test(word)   // 过滤包含特殊字符的词
       ) {
      continue;
    }
    
    // 记录词频
    wordFrequency.set(word, (wordFrequency.get(word) || 0) + 1);
  }
  
  return wordFrequency;
}

/**
 * 从新闻数据中分析热门词汇
 */
export async function analyzeNewsWordTrends(limit: number = 30): Promise<TrendAnalysisResult> {
  // 检查是否需要重新分析（每5分钟分析一次）
  const now = new Date();
  const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);
  
  if (lastAnalysisResult && lastAnalysisTime > fiveMinutesAgo) {
    console.log('使用缓存的词汇趋势分析结果');
    return lastAnalysisResult;
  }
  
  console.log('开始分析新闻词汇趋势...');
  
  // 获取所有新闻数据
  const { data: news } = await storage.getCryptoNews(1, 100);
  
  // 合并所有标题和摘要文本
  let allText = '';
  for (const newsItem of news) {
    allText += ' ' + (newsItem.title || '');
    allText += ' ' + (newsItem.summary || '');
  }
  
  // 分析词频
  const wordFrequency = analyzeText(allText);
  
  // 转换为数组，过滤掉出现次数小于2的词汇，并按频率排序
  const sortedWords: WordFrequency[] = Array.from(wordFrequency.entries())
    .map(([word, count]) => ({ word, count }))
    .filter(item => item.count >= 2) // 只保留出现2次以上的词汇
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
  
  // 创建并缓存结果
  const result: TrendAnalysisResult = {
    timestamp: now,
    topWords: sortedWords
  };
  
  lastAnalysisResult = result;
  lastAnalysisTime = now;
  
  console.log(`词汇趋势分析完成，找到 ${sortedWords.length} 个热门词汇`);
  return result;
}