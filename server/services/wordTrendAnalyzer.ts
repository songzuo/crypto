/**
 * 词汇趋势分析器
 * 
 * 从加密货币新闻中分析热门词汇趋势
 * 每次被调用时都进行新的分析
 */

import { storage } from '../storage';

// 需要过滤掉的常见虚词
const STOP_WORDS = new Set([
  // 基本英语停用词
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
  
  // 可能干扰趋势分析的词汇（常见但无明显趋势意义）
  'crypto', 'cryptocurrency', 'says', 'according', 'may', 'one', 'two', 'three',
  'get', 'got', 'getting', 'goes', 'going', 'come', 'comes', 'coming',
  'around', 'without', 'within', 'look', 'looks', 'looking', 'looked',
  'said', 'took', 'say', 'saying', 'another', 'across',
  'good', 'bad', 'well', 'better', 'best', 'back', 'even', 'ever',
  'every', 'never', 'start', 'end', 'starts', 'ends', 'starting', 'ending',
  
  // 时间相关词汇
  'time', 'times', 'year', 'years', 'month', 'months', 'day', 'days',
  'week', 'weeks', 'hour', 'hours', 'minute', 'minutes', 'second', 'seconds',
  'today', 'tomorrow', 'yesterday', 'daily', 'weekly', 'monthly', 'annually',
  'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
  'january', 'february', 'march', 'april', 'may', 'june', 
  'july', 'august', 'september', 'october', 'november', 'december',
  
  // 金融新闻常用词但无明显趋势意义
  'price', 'prices', 'million', 'billion', 'trillion', 'report', 'reports', 'reported',
  'major', 'minor', 'ceo', 'cfo', 'cto', 'new', 'old', 'latest', 'investors', 'investor', 
  'invest', 'investing', 'investment', 'investments', 'surge', 'surged', 'surging',
  'data', 'analysis', 'analyst', 'analysts', 'coin', 'coins', 'token', 'tokens',
  'inflows', 'inflow', 'outflow', 'outflows', 'since', 'asset', 'assets',
  'past', 'present', 'future', 'recent', 'recently', 'soon', 'later',
  'market', 'markets', 'marketing', 'latest', 'update', 'updates', 'updated',
  'amid', 'set', 'launch', 'launches', 'launched', 'launching',
  'news', 'story', 'stories', 'article', 'articles', 'post', 'posts',
  
  // 加密货币领域常见动作词（无明显趋势意义）
  'sell', 'sold', 'selling', 'buy', 'bought', 'buying', 'trade', 'trades', 'trading', 'traded',
  'hold', 'holds', 'holding', 'held', 'stake', 'staked', 'staking', 'mine', 'mines', 'mining', 'mined',
  
  // 数量和度量相关词
  'high', 'higher', 'highest', 'low', 'lower', 'lowest', 'increase', 'increased',
  'decrease', 'decreased', 'up', 'down', 'top', 'bottom', 'large', 'small',
  'many', 'much', 'few', 'little', 'lot', 'lots'
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

/**
 * 对文本进行词频分析
 * 增强版：更智能地识别有价值的关键词和关键短语
 */
function analyzeText(text: string): Map<string, number> {
  const wordFrequency = new Map<string, number>();
  
  if (!text) return wordFrequency;
  
  // 将文本转换为小写并清理
  const cleanText = text.toLowerCase()
    .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, ' ') // 将标点符号替换为空格
    .replace(/\s+/g, ' ')                         // 标准化空格
    .trim();
  
  // 分割成单词
  const words = cleanText.split(/\s+/);
  
  // 处理2-词短语（bigrams）
  const bigrams: string[] = [];
  for (let i = 0; i < words.length - 1; i++) {
    const word1 = words[i];
    const word2 = words[i + 1];
    
    if (isValidWord(word1) && isValidWord(word2)) {
      const phrase = `${word1} ${word2}`;
      if (phrase.length >= 5) { // 短语至少5个字符
        bigrams.push(phrase);
      }
    }
  }
  
  // 处理3-词短语（trigrams）- 对重要概念很有帮助
  const trigrams: string[] = [];
  for (let i = 0; i < words.length - 2; i++) {
    const word1 = words[i];
    const word2 = words[i + 1];
    const word3 = words[i + 2];
    
    if (isValidWord(word1) && isValidWord(word2) && isValidWord(word3)) {
      const phrase = `${word1} ${word2} ${word3}`;
      if (phrase.length >= 8) { // 三词短语至少8个字符
        trigrams.push(phrase);
      }
    }
  }
  
  // 特殊加密货币重要术语（强制加入词汇列表）
  const importantTerms = [
    "bitcoin", "ethereum", "blockchain", "defi", "nft", "dao", 
    "stablecoin", "altcoin", "ico", "airdrop", "amm", "defi", 
    "dapp", "dex", "kyc", "layer", "metaverse", "memecoin",
    "proof of stake", "proof of work", "smart contract", "web3", 
    "zero knowledge", "layer 2", "ethereum 2.0", "sharding", 
    "consensus mechanism", "yield farming", "liquidity mining"
  ];
  
  // 识别常见加密货币名称和简写
  const cryptoNames = [
    "bitcoin", "btc", "ethereum", "eth", "tether", "usdt", 
    "binance", "bnb", "ripple", "xrp", "cardano", "ada", 
    "solana", "sol", "dogecoin", "doge", "polkadot", "dot", 
    "polygon", "matic", "shiba", "shib", "avalanche", "avax",
    "litecoin", "ltc", "chainlink", "link", "tron", "trx"
  ];
  
  // 统计单词频率
  for (const word of words) {
    if (isValidWord(word)) {
      // 如果是加密货币名称或简写，赋予额外权重
      const isCryptoName = cryptoNames.includes(word);
      const weight = isCryptoName ? 1.2 : 1; // 给加密货币名称20%的权重提升
      
      wordFrequency.set(word, (wordFrequency.get(word) || 0) + weight);
    }
  }
  
  // 统计2-词短语频率，给予更高权重
  for (const phrase of bigrams) {
    const currentCount = wordFrequency.get(phrase) || 0;
    // 重要术语获得额外权重
    const isImportant = importantTerms.includes(phrase);
    const weight = isImportant ? 2 : 1.5; // 重要术语获得2倍权重，普通短语1.5倍
    
    wordFrequency.set(phrase, currentCount + weight);
  }
  
  // 统计3-词短语频率，给予最高权重
  for (const phrase of trigrams) {
    const currentCount = wordFrequency.get(phrase) || 0;
    const weight = 2.5; // 三词短语获得2.5倍权重
    wordFrequency.set(phrase, currentCount + weight);
  }
  
  // 后处理：移除频率过低的条目
  const entries = [...wordFrequency.entries()];
  for (const [word, count] of entries) {
    if (count < 1.5) { // 频率太低的移除
      wordFrequency.delete(word);
    }
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
 * 从新闻数据中分析热门词汇 - 强制分析所有400条新闻
 * 
 * 增强版：使用更智能的词汇分析和权重算法，识别真正重要的加密货币趋势词汇
 */
export async function analyzeNewsWordTrends(limit: number = 30): Promise<TrendAnalysisResult> {
  // 每次都进行全新分析
  const now = new Date();
  
  console.log('开始全新分析所有新闻词汇趋势...');
  
  // 获取所有新闻数据（强制读取全部400条）
  const { data: news, total } = await storage.getCryptoNews(1, 400);
  
  console.log(`实际分析 ${news.length} 条新闻的热门词汇趋势 (数据库总量: ${total})`);
  
  if (news.length === 0) {
    console.log('警告: 没有找到任何新闻数据！');
    return { timestamp: now, topWords: [] };
  }
  
  // 分别分析标题和摘要，标题权重更高
  let titleText = '';
  let summaryText = '';
  
  for (const newsItem of news) {
    if (newsItem.title) titleText += ' ' + newsItem.title;
    if (newsItem.summary) summaryText += ' ' + newsItem.summary;
  }
  
  // 分别分析标题和摘要
  const titleWordFrequency = analyzeText(titleText);
  const summaryWordFrequency = analyzeText(summaryText);
  
  // 合并结果，标题中的词汇权重更高
  const combinedWordFrequency = new Map<string, number>();
  
  // 先添加摘要中的词汇
  const summaryEntries = [...summaryWordFrequency.entries()];
  for (const [word, count] of summaryEntries) {
    combinedWordFrequency.set(word, count);
  }
  
  // 再添加标题中的词汇，权重更高
  const titleEntries = [...titleWordFrequency.entries()];
  for (const [word, count] of titleEntries) {
    const currentCount = combinedWordFrequency.get(word) || 0;
    // 标题词汇权重为1.5倍
    combinedWordFrequency.set(word, currentCount + (count * 1.5));
  }
  
  console.log(`词汇分析完成: 标题分析 ${titleWordFrequency.size} 个词汇，摘要分析 ${summaryWordFrequency.size} 个词汇`);
  
  // 转换为数组，并应用额外过滤器
  let sortedWords: WordFrequency[] = [...combinedWordFrequency.entries()]
    .map(([word, count]) => ({ 
      word, 
      // 四舍五入到小数点后1位
      count: Math.round(count * 10) / 10 
    }))
    .filter(item => {
      // 短语（多词）的过滤标准
      const isPhrase = item.word.includes(' ');
      
      // 词频过滤：短语至少3次，单词至少4次
      if (isPhrase && item.count < 3) return false;
      if (!isPhrase && item.count < 4) return false;

      // 单词长度过滤：单词至少3个字符
      if (!isPhrase && item.word.length < 3) return false;
      
      return true;
    })
    .sort((a, b) => {
      // 首先按频率排序
      const countDiff = b.count - a.count;
      if (Math.abs(countDiff) > 0.5) return countDiff;
      
      // 近似相同频率时，优先考虑短语
      const aIsPhrase = a.word.includes(' ');
      const bIsPhrase = b.word.includes(' ');
      if (aIsPhrase && !bIsPhrase) return -1;
      if (!aIsPhrase && bIsPhrase) return 1;
      
      // 最后按字母顺序排序
      return a.word.localeCompare(b.word);
    });
  
  console.log(`过滤后剩余 ${sortedWords.length} 个有效词汇`);
  
  // 如果有足够多的词汇，进行智能分类
  if (sortedWords.length > limit) {
    // 分为短语和单词两类
    const phrases = sortedWords.filter(item => item.word.includes(' '));
    const singleWords = sortedWords.filter(item => !item.word.includes(' '));
    
    // 确定每类应保留的数量，优先保证多样性
    const phraseCount = Math.min(Math.ceil(limit * 0.6), phrases.length);
    const singleWordCount = Math.min(limit - phraseCount, singleWords.length);
    
    // 组合结果，保持原有排序
    sortedWords = [
      ...phrases.slice(0, phraseCount),
      ...singleWords.slice(0, singleWordCount)
    ];
    
    // 确保总数不超过 limit
    sortedWords = sortedWords.slice(0, limit);
    
    // 重新按频率排序
    sortedWords.sort((a, b) => b.count - a.count);
  } else if (sortedWords.length > 0) {
    // 如果词汇不足，只取实际可用的
    sortedWords = sortedWords.slice(0, Math.min(sortedWords.length, limit));
  }
  
  // 创建结果
  const result: TrendAnalysisResult = {
    timestamp: now,
    topWords: sortedWords
  };
  
  console.log(`词汇趋势分析完成，找到 ${sortedWords.length} 个热门词汇`);
  return result;
}