/**
 * 简单内存缓存存储
 * 用于存储需要在服务器重启前保留的关键数据
 */
import { TrendAnalysisResult } from './wordTrendAnalyzer';

// 全局缓存对象，保存服务运行期间的重要数据
const globalCache: Record<string, any> = {
  // 词汇趋势分析的最后运行时间
  lastTrendAnalysisTime: null,
  // 最新的词汇趋势分析结果
  lastTrendAnalysisResult: null,
};

/**
 * 获取存储在全局缓存中的值
 * @param key 缓存键名
 * @param defaultValue 默认值（如果键不存在）
 */
export function getCacheValue<T>(key: string, defaultValue: T): T {
  return key in globalCache ? globalCache[key] : defaultValue;
}

/**
 * 设置全局缓存中的值
 * @param key 缓存键名
 * @param value 要存储的值
 */
export function setCacheValue<T>(key: string, value: T): void {
  globalCache[key] = value;
  console.log(`缓存已更新: ${key}, 新值时间戳: ${value instanceof Date ? value.toISOString() : '不是日期对象'}`);
}

/**
 * 获取上次趋势分析运行时间
 * @returns 上次运行时间的Date对象，如果从未运行过则返回null
 */
export function getLastTrendAnalysisTime(): Date | null {
  const result = getCacheValue<Date | null>('lastTrendAnalysisTime', null);
  if (result) {
    console.log(`从缓存获取最后分析时间: ${result.toISOString()}`);
  } else {
    console.log('缓存中没有存储最后分析时间');
  }
  return result;
}

/**
 * 更新上次趋势分析运行时间
 * @param timestamp 运行时间的Date对象
 */
export function updateLastTrendAnalysisTime(timestamp: Date): void {
  console.log(`更新最后分析时间: ${timestamp.toISOString()}`);
  setCacheValue('lastTrendAnalysisTime', timestamp);
}

/**
 * 缓存趋势分析结果
 * @param result 完整趋势分析结果
 */
export function cacheTrendAnalysisResult(result: TrendAnalysisResult): void {
  console.log(`缓存趋势分析结果, 时间戳: ${result.timestamp.toISOString()}, 词汇数: ${result.topWords.length}`);
  setCacheValue('lastTrendAnalysisResult', result);
}

/**
 * 获取缓存的趋势分析结果
 * @returns 缓存的趋势分析结果，如果不存在则返回null
 */
export function getCachedTrendAnalysisResult(): TrendAnalysisResult | null {
  const result = getCacheValue<TrendAnalysisResult | null>('lastTrendAnalysisResult', null);
  if (result) {
    console.log(`从缓存获取趋势分析结果, 时间戳: ${result.timestamp.toISOString()}, 词汇数: ${result.topWords.length}`);
  } else {
    console.log('缓存中没有存储趋势分析结果');
  }
  return result;
}