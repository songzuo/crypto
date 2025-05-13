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
  'crypto', 'cryptocurrency', 'says', 'according', 'bitcoin', 'ethereum', 'btc', 'eth',
  
  // 用户定制过滤的常见词汇 - 这些在新闻中很常见但不提供有效趋势信息
  'price', 'million', 'report', 'may', 'major', 'ceo', 'new', 'investors', 'investor', 
  'invest', 'surge', 'data', 'coin', 'inflows', 'inflow', 'since', 'asset', 'past', 
  'recent', 'exploit', 'exploited',
  
  // 第二批用户定制过滤词汇
  'breach', 'digital', 'giant', 'strategy', 'out', 'personal', 'president', 'analyst', 
  'game', 'reserve', 'top', 'first', 'house', 'details', 'detail', 'rally', 'worth',
  
  // 第三批用户定制过滤词汇 - 提高趋势分析的质量
  'amid', 'amid', 'says', 'set', 'launch', 'year', 'years', 'month', 'months', 'day', 'days',
  'week', 'weeks', 'just', 'due', 'due', 'amid', 'makes', 'make', 'made', 'way', 'heres',
  'could', 'would', 'should', 'market', 'markets', 'following', 'before', 'after', 'news',
  'daily', 'weekly', 'monthly', 'today', 'tomorrow', 'yesterday'
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
 * 改进版本：更智能地识别有价值的关键词
 */
function analyzeText(text: string): Map<string, number> {
  const wordFrequency = new Map<string, number>();
  
  if (!text) return wordFrequency;
  
  // 将文本转换为小写并分割成单词
  const words = text.toLowerCase()
    .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, '') // 移除标点符号
    .split(/\s+/);
  
  // 智能分析词组（连续2个词）
  // 这样可以捕获如"proof of stake"这样的有意义短语
  const phrases: string[] = [];
  for (let i = 0; i < words.length - 1; i++) {
    const word1 = words[i];
    const word2 = words[i + 1];
    
    if (isValidWord(word1) && isValidWord(word2)) {
      const phrase = `${word1} ${word2}`;
      if (phrase.length >= 5) { // 短语至少5个字符
        phrases.push(phrase);
      }
    }
  }
  
  // 统计单词频率
  for (const word of words) {
    if (isValidWord(word)) {
      wordFrequency.set(word, (wordFrequency.get(word) || 0) + 1);
    }
  }
  
  // 统计短语频率
  for (const phrase of phrases) {
    wordFrequency.set(phrase, (wordFrequency.get(phrase) || 0) + 1);
  }
  
  return wordFrequency;
}

/**
 * 判断一个词是否有效（不是停用词、太短或包含数字/特殊字符）
 */
function isValidWord(word: string): boolean {
  if (!word) return false;
  if (STOP_WORDS.has(word)) return false;
  if (word.length <= 2) return false;
  if (/^\d+$/.test(word)) return false; // 过滤纯数字
  if (/[^\w\s]/.test(word)) return false; // 过滤包含特殊字符的词
  
  return true;
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
  
  // 获取所有新闻数据（保存最多400条）
  const { data: news } = await storage.getCryptoNews(1, 400);
  
  console.log(`分析 ${news.length} 条新闻的热门词汇趋势`);
  
  // 合并所有标题和摘要文本
  let allText = '';
  for (const newsItem of news) {
    allText += ' ' + (newsItem.title || '');
    allText += ' ' + (newsItem.summary || '');
  }
  
  // 分析词频
  const wordFrequency = analyzeText(allText);
  
  // 转换为数组，更智能地过滤结果
  let sortedWords: WordFrequency[] = Array.from(wordFrequency.entries())
    .map(([word, count]) => ({ word, count }))
    .filter(item => {
      // 基本过滤规则：词频至少为2
      if (item.count < 2) return false;
      
      // 优先保留多词短语（包含空格的条目）
      const isPhrase = item.word.includes(' ');
      
      // 词组要求更高的频率(3次以上)以减少噪音
      if (isPhrase && item.count < 3) return false;
      
      return true;
    })
    .sort((a, b) => {
      // 优先按频率排序
      const countDiff = b.count - a.count;
      if (countDiff !== 0) return countDiff;
      
      // 频率相同时，优先展示短语
      const aIsPhrase = a.word.includes(' ');
      const bIsPhrase = b.word.includes(' ');
      if (aIsPhrase && !bIsPhrase) return -1;
      if (!aIsPhrase && bIsPhrase) return 1;
      
      // 其次按字母顺序排序
      return a.word.localeCompare(b.word);
    })
    .slice(0, limit * 2); // 先获取更多结果
  
  // 确保结果中短语和单词的平衡
  const phrases: WordFrequency[] = sortedWords.filter(item => item.word.includes(' '));
  const singleWords: WordFrequency[] = sortedWords.filter(item => !item.word.includes(' '));
  
  // 根据当前情况动态调整结果
  if (phrases.length >= limit / 2 && singleWords.length >= limit / 2) {
    // 平衡取两种类型
    sortedWords = [
      ...phrases.slice(0, Math.ceil(limit / 2)),
      ...singleWords.slice(0, Math.floor(limit / 2))
    ].sort((a, b) => b.count - a.count);
  } else {
    // 按频率取前limit个
    sortedWords = sortedWords.slice(0, limit);
  }
  
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