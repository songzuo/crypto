import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Format a number with commas as thousands separators
 * @param num The number to format
 * @param maximumFractionDigits Maximum number of decimal places (default: 2)
 * @returns Formatted number as string
 */
export function formatNumber(num: number, maximumFractionDigits: number = 2): string {
  if (num === null || num === undefined || isNaN(num)) {
    return '0';
  }
  
  // For very large numbers (billions+), use abbreviated format
  if (num >= 1_000_000_000) {
    return (num / 1_000_000_000).toLocaleString('en-US', { 
      maximumFractionDigits: 2 
    }) + 'B';
  }
  
  // For millions, use abbreviated format
  if (num >= 1_000_000) {
    return (num / 1_000_000).toLocaleString('en-US', { 
      maximumFractionDigits: 2 
    }) + 'M';
  }
  
  // For regular numbers, use comma separators
  return num.toLocaleString('en-US', { 
    maximumFractionDigits: maximumFractionDigits 
  });
}

/**
 * Format a date with options for customization
 * @param date The date to format
 * @param options Formatting options
 * @returns Formatted date string
 */
/**
 * Format a date as a relative time string (e.g., "2 days ago")
 * @param date The date to format
 * @returns Formatted relative time string
 */
export function formatRelativeTime(date: Date | string): string {
  if (!date) return '';
  
  try {
    // Handle string dates
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    const now = new Date();
    
    // Calculate time difference in milliseconds
    const diff = now.getTime() - dateObj.getTime();
    
    // Convert to seconds
    const seconds = Math.floor(diff / 1000);
    
    // Less than a minute
    if (seconds < 60) {
      return 'just now';
    }
    
    // Less than an hour
    if (seconds < 3600) {
      const minutes = Math.floor(seconds / 60);
      return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'} ago`;
    }
    
    // Less than a day
    if (seconds < 86400) {
      const hours = Math.floor(seconds / 3600);
      return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`;
    }
    
    // Less than a week
    if (seconds < 604800) {
      const days = Math.floor(seconds / 86400);
      return `${days} ${days === 1 ? 'day' : 'days'} ago`;
    }
    
    // Less than a month (approximated as 30 days)
    if (seconds < 2592000) {
      const weeks = Math.floor(seconds / 604800);
      return `${weeks} ${weeks === 1 ? 'week' : 'weeks'} ago`;
    }
    
    // Less than a year
    if (seconds < 31536000) {
      const months = Math.floor(seconds / 2592000);
      return `${months} ${months === 1 ? 'month' : 'months'} ago`;
    }
    
    // More than a year
    const years = Math.floor(seconds / 31536000);
    return `${years} ${years === 1 ? 'year' : 'years'} ago`;
  } catch (error) {
    console.error('Error formatting relative time:', error);
    return String(date);
  }
}

export function formatDate(date: Date | string, options?: { 
  includeTime?: boolean,
  includeSeconds?: boolean,
  includeTimezone?: boolean
}): string {
  if (!date) return '';
  
  try {
    // Handle string dates - 确保使用客户端本地时间
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    
    // 使用客户端的本地时间格式化，而不是服务器时间
    const opts = {
      includeTime: options?.includeTime ?? false,
      includeSeconds: options?.includeSeconds ?? false,
      includeTimezone: options?.includeTimezone ?? false
    };
    
    // 使用 Intl.DateTimeFormat 确保使用客户端本地时间
    if (opts.includeTime) {
      const formatOptions: Intl.DateTimeFormatOptions = {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      };
      
      if (opts.includeSeconds) {
        formatOptions.second = '2-digit';
      }
      
      if (opts.includeTimezone) {
        formatOptions.timeZoneName = 'short';
      }
      
      return new Intl.DateTimeFormat('zh-CN', formatOptions).format(dateObj);
    } else {
      // 只显示日期
      return new Intl.DateTimeFormat('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      }).format(dateObj);
    }
  } catch (error) {
    console.error('Error formatting date:', error);
    return String(date);
  }
}
