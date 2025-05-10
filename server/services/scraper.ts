import puppeteer from "puppeteer";
import * as cheerio from "cheerio";
import { storage } from "../storage";
import { InsertBlockchainExplorer, InsertMetric } from "@shared/schema";

// Function to find blockchain explorer for a cryptocurrency
export async function findBlockchainExplorer(cryptocurrencyName: string, cryptocurrencyId: number): Promise<string | null> {
  try {
    const browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu'
      ]
    });
    
    try {
      const page = await browser.newPage();
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
      
      // Search for blockchain explorer
      const searchQuery = `scan ${cryptocurrencyName} blockchain explorer`;
      await page.goto(`https://www.google.com/search?q=${encodeURIComponent(searchQuery)}`);
      
      // Wait for search results to load
      await page.waitForSelector('div.g', { timeout: 5000 });
      
      // Extract search results
      const searchResults = await page.evaluate(() => {
        const results: { title: string; url: string }[] = [];
        const elements = document.querySelectorAll('div.g');
        
        elements.forEach((element) => {
          const titleElement = element.querySelector('h3');
          const linkElement = element.querySelector('a');
          
          if (titleElement && linkElement) {
            const title = titleElement.textContent || '';
            const url = linkElement.getAttribute('href') || '';
            
            if (url.startsWith('http') && 
                (url.includes('scan') || 
                 url.includes('explorer') || 
                 url.includes('blockchain'))) {
              results.push({ title, url });
            }
          }
        });
        
        return results;
      });
      
      await browser.close();
      
      if (searchResults.length === 0) {
        console.log(`No blockchain explorer found for ${cryptocurrencyName}`);
        return null;
      }
      
      // Store the found explorer in the database
      const explorer: InsertBlockchainExplorer = {
        cryptocurrencyId,
        url: searchResults[0].url,
        name: searchResults[0].title
      };
      
      await storage.createBlockchainExplorer(explorer);
      
      return searchResults[0].url;
    } catch (error) {
      await browser.close();
      throw error;
    }
  } catch (error) {
    console.error(`Error finding blockchain explorer for ${cryptocurrencyName}:`, error);
    return null;
  }
}

// Function to scrape blockchain data from an explorer
export async function scrapeBlockchainData(explorerUrl: string, cryptocurrencyId: number): Promise<boolean> {
  try {
    const browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu'
      ]
    });
    
    try {
      const page = await browser.newPage();
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
      
      await page.goto(explorerUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      
      // Extract HTML content
      const content = await page.content();
      const $ = cheerio.load(content);
      
      // Initialize metrics object
      const metrics: any = {};
      const metricsData: InsertMetric = {
        cryptocurrencyId,
        metrics
      };
      
      // Common metric patterns to look for
      const metricPatterns = [
        { selector: 'body', pattern: /active address(?:es)?[:\s]+([0-9,]+)/i, field: 'activeAddresses' },
        { selector: 'body', pattern: /total transactions[:\s]+([0-9,]+)/i, field: 'totalTransactions' },
        { selector: 'body', pattern: /transactions per second[:\s]+([\d,.]+)/i, field: 'transactionsPerSecond' },
        { selector: 'body', pattern: /hash ?rate[:\s]+([\d,.]+ ?[KMGTPE]?H\/s)/i, field: 'hashrate' },
        { selector: 'body', pattern: /average transaction value[:\s]+([\d,.]+)/i, field: 'averageTransactionValue' }
      ];
      
      // Try to extract metrics using patterns
      metricPatterns.forEach(({ selector, pattern, field }) => {
        const bodyText = $(selector).text();
        const match = bodyText.match(pattern);
        
        if (match && match[1]) {
          // Convert to appropriate type
          if (field === 'activeAddresses' || field === 'totalTransactions') {
            metricsData[field] = parseInt(match[1].replace(/,/g, ''), 10);
          } else if (field === 'transactionsPerSecond' || field === 'averageTransactionValue') {
            metricsData[field] = parseFloat(match[1].replace(/,/g, ''));
          } else {
            metricsData[field] = match[1];
          }
          
          // Also store in the metrics JSON object
          metrics[field] = match[1];
        }
      });
      
      // Look for tables with metrics
      $('table').each(function() {
        $(this).find('tr').each(function() {
          const cells = $(this).find('td, th');
          if (cells.length >= 2) {
            const label = $(cells[0]).text().trim().toLowerCase();
            const value = $(cells[1]).text().trim();
            
            // Store any additional metrics found in tables
            if (label && value && !["", "n/a"].includes(value.toLowerCase())) {
              metrics[label.replace(/\s+/g, '_')] = value;
            }
          }
        });
      });
      
      await browser.close();
      
      // Check if we found any metrics at all
      if (Object.keys(metrics).length === 0) {
        console.log(`No metrics found for cryptocurrency ${cryptocurrencyId} at ${explorerUrl}`);
        return false;
      }
      
      // Store the metrics in the database
      const existingMetrics = await storage.getMetrics(cryptocurrencyId);
      
      if (existingMetrics) {
        await storage.updateMetrics(existingMetrics.id, metricsData);
      } else {
        await storage.createMetrics(metricsData);
      }
      
      return true;
    } catch (error) {
      await browser.close();
      throw error;
    }
  } catch (error) {
    console.error(`Error scraping blockchain data from ${explorerUrl}:`, error);
    return false;
  }
}
