/**
 * 通用工具函数
 */

/**
 * 等待指定毫秒数
 * @param ms 毫秒数
 * @returns Promise
 */
export async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 解析带有单位后缀(K, M, B, T)的数字字符串
 * 例如: $1.5K => 1500, 2.3M => 2300000
 * @param text 包含数字和可能后缀的字符串
 * @returns 解析后的数字，如果无法解析则返回NaN
 */
export function parseNumber(text: string): number {
  if (!text) return NaN;
  
  // 1. 移除所有非数字内容（保留小数点和单位符号 K, M, B, T）
  const sanitized = text.replace(/[^0-9KMBTkmbt.]/g, '');
  
  // 2. 检查是否是百分比格式
  const isPercentage = text.includes('%');
  
  // 3. 提取数字部分和单位部分
  const match = sanitized.match(/^([0-9.]+)([KMBTkmbt])?$/);
  
  if (!match) return NaN;
  
  const [, numberPart, unit] = match;
  let value = parseFloat(numberPart);
  
  if (isNaN(value)) return NaN;
  
  // 4. 根据单位调整数值
  if (unit) {
    const unitUpper = unit.toUpperCase();
    switch (unitUpper) {
      case 'K': 
        value *= 1000; 
        break;
      case 'M': 
        value *= 1000000; 
        break;
      case 'B': 
        value *= 1000000000; 
        break;
      case 'T': 
        value *= 1000000000000; 
        break;
    }
  }
  
  // 5. 如果是百分比，转换为小数
  if (isPercentage) {
    value = value / 100;
  }
  
  return value;
}

/**
 * 生成随机整数，包含最小值和最大值
 * @param min 最小值
 * @param max 最大值
 * @returns 随机整数
 */
export function getRandomInt(min: number, max: number): number {
  min = Math.ceil(min);
  max = Math.floor(max);
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * 从数组中随机选择一个元素
 * @param array 数组
 * @returns 随机选择的元素
 */
export function getRandomElement<T>(array: T[]): T {
  return array[Math.floor(Math.random() * array.length)];
}

/**
 * 批量处理数组元素
 * 将一个数组分成多个批次处理，每个批次间可以添加延迟
 * @param items 需要处理的数组
 * @param batchSize 每批次的大小
 * @param processFn 处理每个元素的函数
 * @param delayMs 每批次之间的延迟毫秒数
 */
export async function processBatches<T, R>(
  items: T[],
  batchSize: number,
  processFn: (item: T) => Promise<R>,
  delayMs: number = 0
): Promise<R[]> {
  const results: R[] = [];
  
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    
    // 并行处理一个批次
    const batchResults = await Promise.all(
      batch.map(item => processFn(item))
    );
    
    results.push(...batchResults);
    
    // 如果不是最后一批，等待指定的延迟
    if (i + batchSize < items.length && delayMs > 0) {
      await sleep(delayMs);
    }
  }
  
  return results;
}

/**
 * 带重试机制的异步函数
 * @param fn 要执行的异步函数
 * @param retries 重试次数
 * @param delay 每次重试前的延迟毫秒数
 * @param onError 错误处理函数
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  retries: number = 3,
  delay: number = 1000,
  onError?: (error: any, attempt: number) => void
): Promise<T> {
  let lastError: any;
  
  for (let attempt = 1; attempt <= retries + 1; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      
      if (onError) {
        onError(error, attempt);
      }
      
      if (attempt <= retries) {
        await sleep(delay * attempt); // 增加延迟时间
      }
    }
  }
  
  throw lastError;
}

/**
 * 检查URL是否有效
 * @param url 要检查的URL
 * @returns 如果URL有效则返回true，否则返回false
 */
export function isValidUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * 将对象数组按特定属性分组
 * @param array 对象数组
 * @param key 分组依据的属性名
 * @returns 分组后的对象，键为属性值，值为对象数组
 */
export function groupBy<T>(array: T[], key: keyof T): Record<string, T[]> {
  return array.reduce((result, item) => {
    const groupKey = String(item[key]);
    if (!result[groupKey]) {
      result[groupKey] = [];
    }
    result[groupKey].push(item);
    return result;
  }, {} as Record<string, T[]>);
}

/**
 * 生成唯一ID
 * @returns 唯一字符串ID
 */
export function generateUniqueId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substring(2);
}

/**
 * 深度合并两个对象
 * @param target 目标对象
 * @param source 源对象
 * @returns 合并后的对象
 */
export function deepMerge<T extends object>(target: T, source: Partial<T>): T {
  const output = { ...target };
  
  if (isObject(target) && isObject(source)) {
    Object.keys(source).forEach(key => {
      if (isObject(source[key as keyof typeof source])) {
        if (!(key in target)) {
          Object.assign(output, { [key]: source[key as keyof typeof source] });
        } else {
          (output as any)[key] = deepMerge(
            (target as any)[key],
            (source as any)[key]
          );
        }
      } else {
        Object.assign(output, { [key]: source[key as keyof typeof source] });
      }
    });
  }
  
  return output;
}

/**
 * 检查值是否为对象
 * @param item 要检查的值
 * @returns 如果是对象则返回true，否则返回false
 */
function isObject(item: any): boolean {
  return item && typeof item === 'object' && !Array.isArray(item);
}

/**
 * 移除对象中的空值属性（null, undefined, 空字符串）
 * @param obj 源对象
 * @returns 移除空值后的新对象
 */
export function removeEmptyValues<T extends object>(obj: T): Partial<T> {
  const result: Partial<T> = {};
  
  Object.entries(obj).forEach(([key, value]) => {
    if (value !== null && value !== undefined && value !== '') {
      (result as any)[key] = value;
    }
  });
  
  return result;
}

/**
 * 截断文本到指定长度
 * @param text 要截断的文本
 * @param maxLength 最大长度
 * @param suffix 当文本被截断时要添加的后缀
 * @returns 截断后的文本
 */
export function truncateText(text: string, maxLength: number, suffix: string = '...'): string {
  if (!text || text.length <= maxLength) {
    return text;
  }
  
  return text.substring(0, maxLength - suffix.length) + suffix;
}

/**
 * 防抖函数
 * @param fn 要防抖的函数
 * @param waitMs 等待时间（毫秒）
 * @returns 防抖后的函数
 */
export function debounce<T extends (...args: any[]) => any>(
  fn: T,
  waitMs: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null;
  
  return function(...args: Parameters<T>): void {
    if (timeout) {
      clearTimeout(timeout);
    }
    
    timeout = setTimeout(() => {
      fn(...args);
    }, waitMs);
  };
}

/**
 * 节流函数
 * @param fn 要节流的函数
 * @param limitMs 限制间隔（毫秒）
 * @returns 节流后的函数
 */
export function throttle<T extends (...args: any[]) => any>(
  fn: T,
  limitMs: number
): (...args: Parameters<T>) => void {
  let lastCall = 0;
  
  return function(...args: Parameters<T>): void {
    const now = Date.now();
    
    if (now - lastCall >= limitMs) {
      fn(...args);
      lastCall = now;
    }
  };
}

/**
 * 格式化日期为YYYY-MM-DD格式
 * @param date 日期对象
 * @returns 格式化后的日期字符串
 */
export function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  
  return `${year}-${month}-${day}`;
}

/**
 * 格式化数字为货币格式
 * @param value 数值
 * @param currency 货币符号
 * @param decimals 小数位数
 * @returns 格式化后的货币字符串
 */
export function formatCurrency(
  value: number,
  currency: string = '$',
  decimals: number = 2
): string {
  return `${currency}${value.toFixed(decimals).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
}

/**
 * 格式化大数字，使用K, M, B, T作为后缀
 * 例如: 1500 => 1.5K, 2300000 => 2.3M
 * @param value 数值
 * @param decimals 小数位数
 * @returns 格式化后的字符串
 */
export function formatLargeNumber(value: number, decimals: number = 1): string {
  if (value === null || value === undefined || isNaN(value)) {
    return 'N/A';
  }
  
  if (value === 0) return '0';
  
  const units = ['', 'K', 'M', 'B', 'T'];
  const order = Math.floor(Math.log10(Math.abs(value)) / 3);
  const unitValue = value / Math.pow(10, order * 3);
  
  return unitValue.toFixed(decimals).replace(/\.0+$/, '') + units[order];
}