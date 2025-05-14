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
export function formatDate(date: Date, options?: { 
  includeTime?: boolean,
  includeSeconds?: boolean,
  includeTimezone?: boolean
}): string {
  if (!date) return '';
  
  try {
    // Handle string dates
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    
    // Default options
    const opts = {
      includeTime: options?.includeTime ?? false,
      includeSeconds: options?.includeSeconds ?? false,
      includeTimezone: options?.includeTimezone ?? false
    };
    
    // Format date part: YYYY-MM-DD
    const year = dateObj.getFullYear();
    const month = String(dateObj.getMonth() + 1).padStart(2, '0');
    const day = String(dateObj.getDate()).padStart(2, '0');
    
    let result = `${year}-${month}-${day}`;
    
    // Add time if requested
    if (opts.includeTime) {
      const hours = String(dateObj.getHours()).padStart(2, '0');
      const minutes = String(dateObj.getMinutes()).padStart(2, '0');
      
      result += ` ${hours}:${minutes}`;
      
      // Add seconds if requested
      if (opts.includeSeconds) {
        const seconds = String(dateObj.getSeconds()).padStart(2, '0');
        result += `:${seconds}`;
      }
      
      // Add timezone if requested
      if (opts.includeTimezone) {
        const timezoneOffset = dateObj.getTimezoneOffset();
        const hours = Math.abs(Math.floor(timezoneOffset / 60));
        const minutes = Math.abs(timezoneOffset % 60);
        const sign = timezoneOffset <= 0 ? '+' : '-';
        
        result += ` GMT${sign}${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
      }
    }
    
    return result;
  } catch (error) {
    console.error('Error formatting date:', error);
    return String(date);
  }
}
