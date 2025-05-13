/**
 * 简单内存缓存存储
 * 用于存储需要在服务器重启前保留的关键数据
 */

// 全局缓存对象，保存服务运行期间的重要数据
const globalCache: Record<string, any> = {
  // 词汇趋势分析的最后运行时间
  lastTrendAnalysisTime: null,
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
}

/**
 * 获取上次趋势分析运行时间
 * @returns 上次运行时间的Date对象，如果从未运行过则返回null
 */
export function getLastTrendAnalysisTime(): Date | null {
  return getCacheValue<Date | null>('lastTrendAnalysisTime', null);
}

/**
 * 更新上次趋势分析运行时间
 * @param timestamp 运行时间的Date对象
 */
export function updateLastTrendAnalysisTime(timestamp: Date): void {
  setCacheValue('lastTrendAnalysisTime', timestamp);
}