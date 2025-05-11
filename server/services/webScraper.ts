import https from 'https';
import { storage } from '../storage';
import { InsertCryptocurrency } from '@shared/schema';
import * as cheerio from 'cheerio';

// Common function to make HTTPS requests with proper error handling
function makeHttpsRequest(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Cache-Control': 'max-age=0'
      },
      timeout: 10000
    }, (res) => {
      // Check for redirect
      if (res.statusCode && (res.statusCode === 301 || res.statusCode === 302) && res.headers.location) {
        return makeHttpsRequest(res.headers.location).then(resolve).catch(reject);
      }

      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP Error: ${res.statusCode}`));
      }

      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        resolve(data);
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    req.end();
  });
}

/**
 * Function to scrape CoinMarketCap directly (no API required)
 * This gets additional cryptocurrency data
 */
export async function scrapeCoinMarketCap(page: number = 1): Promise<number> {
  console.log(`Scraping CoinMarketCap page ${page}...`);
  try {
    // Build URL - each page has 100 listings
    const url = `https://coinmarketcap.com/?page=${page}`;
    
    const html = await makeHttpsRequest(url);
    const $ = cheerio.load(html);
    
    // Parse the cryptocurrency data from the table
    // The table structure in CoinMarketCap has rows for each cryptocurrency
    const cryptos: Array<Partial<InsertCryptocurrency>> = [];
    
    // This is the main table containing crypto data
    const tableRows = $('table tbody tr');
    
    console.log(`Found ${tableRows.length} cryptocurrencies on CoinMarketCap page ${page}`);
    
    tableRows.each((index: number, element: cheerio.Element) => {
      try {
        // Extract name, symbol, market cap, etc.
        const name = $(element).find('.cmc-link').text().trim();
        const symbol = $(element).find('.coin-item-symbol').text().trim();
        
        if (!name || !symbol) return; // Skip if name or symbol isn't found
        
        // Extract market cap value - look for the specific column
        let marketCapStr = '';
        $(element).find('td').each((i: number, td: cheerio.Element) => {
          // Market cap is typically in the specific column (index may change)
          if ($(td).find('p:contains("$")').length > 0 && !marketCapStr) {
            marketCapStr = $(td).text().trim();
          }
        });
        
        // Parse market cap with proper handling of B, M, K notations
        let marketCap: number | null = null;
        if (marketCapStr) {
          marketCapStr = marketCapStr.replace(/[^0-9.BKM]/g, '');
          if (marketCapStr.includes('B')) {
            marketCap = parseFloat(marketCapStr.replace('B', '')) * 1000000000;
          } else if (marketCapStr.includes('M')) {
            marketCap = parseFloat(marketCapStr.replace('M', '')) * 1000000;
          } else if (marketCapStr.includes('K')) {
            marketCap = parseFloat(marketCapStr.replace('K', '')) * 1000;
          } else {
            marketCap = parseFloat(marketCapStr);
          }
        }
        
        // Convert name to slug for URL purposes
        const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
        
        // Create a cryptocurrency object with the extracted data
        cryptos.push({
          name,
          symbol,
          slug,
          marketCap,
          // Additional fields will be handled by the storage layer
          price: null,
          volume24h: null,
          priceChange24h: null,
          rank: index + 1 + ((page - 1) * 100), // Calculate rank based on page and position
          officialWebsite: `https://${slug}.org`,  // Default website format
          logoUrl: null,
          lastUpdated: new Date()
        });
      } catch (err) {
        console.error(`Error parsing cryptocurrency at index ${index}:`, err);
        // Continue with the next cryptocurrency
      }
    });
    
    console.log(`Successfully extracted ${cryptos.length} cryptocurrencies from CoinMarketCap page ${page}`);
    
    // Process cryptocurrencies (add to storage if they don't exist)
    for (const crypto of cryptos) {
      try {
        // Check if crypto already exists by name or symbol
        const existingByName = await storage.searchCryptocurrencies(crypto.name || '');
        const existingBySymbol = await storage.searchCryptocurrencies(crypto.symbol || '');
        
        const exists = existingByName.some(c => 
          c.name.toLowerCase() === crypto.name?.toLowerCase() || 
          c.symbol.toLowerCase() === crypto.symbol?.toLowerCase()
        ) || existingBySymbol.some(c => 
          c.name.toLowerCase() === crypto.name?.toLowerCase() || 
          c.symbol.toLowerCase() === crypto.symbol?.toLowerCase()
        );
        
        if (!exists) {
          console.log(`Adding new cryptocurrency from CoinMarketCap: ${crypto.name} (${crypto.symbol}), market cap: ${crypto.marketCap})`);
          await storage.createCryptocurrency(crypto as InsertCryptocurrency);
        } else {
          // Update existing cryptocurrency with market cap if needed
          const existing = [...existingByName, ...existingBySymbol].find(
            c => c.name.toLowerCase() === crypto.name?.toLowerCase() || 
                 c.symbol.toLowerCase() === crypto.symbol?.toLowerCase()
          );
          
          if (existing && crypto.marketCap && (!existing.marketCap || existing.marketCap < crypto.marketCap)) {
            console.log(`Updating market cap for ${existing.name} (ID: ${existing.id}) to ${crypto.marketCap}`);
            await storage.updateCryptocurrency(existing.id, { 
              marketCap: crypto.marketCap,
              lastUpdated: new Date()
            });
          } else {
            console.log(`Skipping duplicate cryptocurrency: ${crypto.name} - Already exists.`);
          }
        }
      } catch (err) {
        console.error(`Error processing cryptocurrency ${crypto.name}:`, err);
        // Continue with next cryptocurrency
      }
    }
    
    return cryptos.length;
  } catch (error) {
    console.error(`Error scraping CoinMarketCap page ${page}:`, error);
    return 0;
  }
}

/**
 * Function to scrape CoinGecko website directly (no API required)
 */
export async function scrapeCoinGecko(page: number = 1): Promise<number> {
  console.log(`Scraping CoinGecko page ${page}...`);
  try {
    // Build URL - each page has 100 coins
    const url = `https://www.coingecko.com/?page=${page}`;
    
    const html = await makeHttpsRequest(url);
    const $ = cheerio.load(html);
    
    // Parse the cryptocurrency data from the table
    const cryptos: Array<Partial<InsertCryptocurrency>> = [];
    
    // This is the main table containing crypto data on CoinGecko
    const tableRows = $('table tbody tr');
    
    console.log(`Found ${tableRows.length} cryptocurrencies on CoinGecko page ${page}`);
    
    tableRows.each((index, element) => {
      try {
        // Extract name, symbol, market cap from CoinGecko's structure
        const name = $(element).find('.tw-font-bold').text().trim();
        const symbol = $(element).find('.tw-hidden').text().trim();
        
        if (!name || !symbol) return; // Skip if name or symbol isn't found
        
        // Extract market cap
        let marketCapStr = '';
        $(element).find('td').each((i, td) => {
          // Look for the market cap column
          if ($(td).find('span:contains("$")').length > 0 && !marketCapStr) {
            marketCapStr = $(td).text().trim();
          }
        });
        
        // Parse market cap with proper handling of B, M, K notations
        let marketCap: number | null = null;
        if (marketCapStr) {
          marketCapStr = marketCapStr.replace(/[^0-9.BKM]/g, '');
          if (marketCapStr.includes('B')) {
            marketCap = parseFloat(marketCapStr.replace('B', '')) * 1000000000;
          } else if (marketCapStr.includes('M')) {
            marketCap = parseFloat(marketCapStr.replace('M', '')) * 1000000;
          } else if (marketCapStr.includes('K')) {
            marketCap = parseFloat(marketCapStr.replace('K', '')) * 1000;
          } else {
            marketCap = parseFloat(marketCapStr);
          }
        }
        
        // Create slug for URL purposes
        const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
        
        // Create cryptocurrency object with extracted data
        cryptos.push({
          name,
          symbol,
          slug,
          marketCap,
          price: null,
          volume24h: null,
          priceChange24h: null,
          rank: index + 1 + ((page - 1) * 100), // Calculate rank based on page and position
          officialWebsite: `https://${slug}.org`,  // Default website format
          logoUrl: null,
          lastUpdated: new Date()
        });
      } catch (err) {
        console.error(`Error parsing cryptocurrency at index ${index} on CoinGecko:`, err);
        // Continue with the next cryptocurrency
      }
    });
    
    console.log(`Successfully extracted ${cryptos.length} cryptocurrencies from CoinGecko page ${page}`);
    
    // Process cryptocurrencies (add to storage if they don't exist)
    for (const crypto of cryptos) {
      try {
        // Check if crypto already exists by name or symbol
        const existingByName = await storage.searchCryptocurrencies(crypto.name || '');
        const existingBySymbol = await storage.searchCryptocurrencies(crypto.symbol || '');
        
        const exists = existingByName.some(c => 
          c.name.toLowerCase() === crypto.name?.toLowerCase() || 
          c.symbol.toLowerCase() === crypto.symbol?.toLowerCase()
        ) || existingBySymbol.some(c => 
          c.name.toLowerCase() === crypto.name?.toLowerCase() || 
          c.symbol.toLowerCase() === crypto.symbol?.toLowerCase()
        );
        
        if (!exists) {
          console.log(`Adding new cryptocurrency from CoinGecko: ${crypto.name} (${crypto.symbol}), market cap: ${crypto.marketCap})`);
          await storage.createCryptocurrency(crypto as InsertCryptocurrency);
        } else {
          // Update existing cryptocurrency with market cap if needed
          const existing = [...existingByName, ...existingBySymbol].find(
            c => c.name.toLowerCase() === crypto.name?.toLowerCase() || 
                 c.symbol.toLowerCase() === crypto.symbol?.toLowerCase()
          );
          
          if (existing && crypto.marketCap && (!existing.marketCap || existing.marketCap < crypto.marketCap)) {
            console.log(`Updating market cap for ${existing.name} (ID: ${existing.id}) to ${crypto.marketCap}`);
            await storage.updateCryptocurrency(existing.id, { 
              marketCap: crypto.marketCap,
              lastUpdated: new Date()
            });
          } else {
            console.log(`Skipping duplicate cryptocurrency: ${crypto.name} - Already exists.`);
          }
        }
      } catch (err) {
        console.error(`Error processing cryptocurrency ${crypto.name}:`, err);
        // Continue with next cryptocurrency
      }
    }
    
    return cryptos.length;
  } catch (error) {
    console.error(`Error scraping CoinGecko page ${page}:`, error);
    return 0;
  }
}

// Run multiple scraping sources in parallel to maximize data collection
export async function scrapeMultipleSources(): Promise<void> {
  console.log("Starting parallel scraping from multiple cryptocurrency data sources...");
  
  try {
    // Run multiple scraping tasks in parallel to speed up data collection
    const tasks = [
      // CoinMarketCap pages 1-3 (top 300 cryptocurrencies)
      scrapeCoinMarketCap(1),
      scrapeCoinMarketCap(2),
      scrapeCoinMarketCap(3),
      
      // CoinGecko pages 1-3 (top 300 cryptocurrencies)
      scrapeCoinGecko(1),
      scrapeCoinGecko(2),
      scrapeCoinGecko(3)
    ];
    
    // Execute all scraping tasks in parallel
    const results = await Promise.allSettled(tasks);
    
    // Count successful scrapes
    let totalCryptosFound = 0;
    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        totalCryptosFound += result.value;
        console.log(`Scraping task ${index + 1} completed successfully with ${result.value} cryptocurrencies.`);
      } else {
        console.error(`Scraping task ${index + 1} failed:`, result.reason);
      }
    });
    
    console.log(`Multi-source scraping completed. Found a total of ${totalCryptosFound} cryptocurrencies.`);
  } catch (error) {
    console.error("Error in multi-source scraping:", error);
  }
}