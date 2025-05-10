import puppeteer from "puppeteer";
import { storage } from "../storage";
import { InsertCryptocurrency } from "@shared/schema";

// Function to search for the top cryptocurrencies by market cap
export async function searchTopCryptocurrencies(count: number = 500): Promise<boolean> {
  try {
    console.log(`Starting to search for top ${count} cryptocurrencies...`);
    
    // Update crawler status
    await storage.updateCrawlerStatus({
      webCrawlerActive: true,
      aiProcessorActive: false,
      blockchainSyncActive: false
    });
    
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
      
      // Go to CoinMarketCap or similar site
      await page.goto('https://coinmarketcap.com/', { waitUntil: 'networkidle2', timeout: 60000 });
      
      // Parse the cryptocurrency list
      const cryptocurrencies = await page.evaluate((targetCount) => {
        const cryptos: any[] = [];
        const rows = document.querySelectorAll('table tbody tr');
        
        rows.forEach((row, index) => {
          if (index >= targetCount) return;
          
          try {
            const nameElement = row.querySelector('td:nth-child(3) div a p');
            const symbolElement = row.querySelector('td:nth-child(3) div a div:nth-child(2) p');
            const priceElement = row.querySelector('td:nth-child(4) div a');
            const percentElement = row.querySelector('td:nth-child(5) span');
            const marketCapElement = row.querySelector('td:nth-child(8) p span:nth-child(2)');
            const volumeElement = row.querySelector('td:nth-child(9) div p span:nth-child(2)');
            
            if (nameElement && symbolElement) {
              const name = nameElement.textContent || '';
              const symbol = symbolElement.textContent || '';
              const price = priceElement ? parseFloat((priceElement.textContent || '').replace(/[^0-9.-]+/g, '')) : null;
              const priceChange24h = percentElement ? parseFloat((percentElement.textContent || '').replace(/[^0-9.-]+/g, '')) : null;
              const marketCap = marketCapElement ? parseFloat((marketCapElement.textContent || '').replace(/[^0-9.-]+/g, '')) : null;
              const volume24h = volumeElement ? parseFloat((volumeElement.textContent || '').replace(/[^0-9.-]+/g, '')) : null;
              
              cryptos.push({
                name,
                symbol,
                price,
                priceChange24h,
                marketCap,
                volume24h,
                rank: index + 1
              });
            }
          } catch (error) {
            console.error(`Error parsing row ${index}:`, error);
          }
        });
        
        return cryptos;
      }, count);
      
      await browser.close();
      
      // Store the cryptocurrencies
      let newEntriesCount = 0;
      
      for (const crypto of cryptocurrencies) {
        const { name, symbol, price, priceChange24h, marketCap, volume24h, rank } = crypto;
        
        // Create slug from name
        const slug = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
        
        // Check if this cryptocurrency already exists
        const existingCryptos = await storage.searchCryptocurrencies(name);
        const existingCrypto = existingCryptos.find(c => 
          c.name.toLowerCase() === name.toLowerCase() || 
          c.symbol.toLowerCase() === symbol.toLowerCase()
        );
        
        if (existingCrypto) {
          // Update existing cryptocurrency
          await storage.updateCryptocurrency(existingCrypto.id, {
            price,
            priceChange24h,
            marketCap,
            volume24h,
            rank
          });
        } else {
          // Create new cryptocurrency
          const newCrypto: InsertCryptocurrency = {
            name,
            symbol,
            slug,
            price: price || 0,
            priceChange24h: priceChange24h || 0,
            marketCap: marketCap || 0,
            volume24h: volume24h || 0,
            rank: rank || 0,
            officialWebsite: null,
            logoUrl: null
          };
          
          await storage.createCryptocurrency(newCrypto);
          newEntriesCount++;
        }
      }
      
      // Update crawler status
      await storage.updateCrawlerStatus({
        webCrawlerActive: false,
        newEntriesCount
      });
      
      console.log(`Finished searching for cryptocurrencies. Found ${cryptocurrencies.length} cryptocurrencies, added ${newEntriesCount} new entries.`);
      
      return true;
    } catch (error) {
      await browser.close();
      
      // Update crawler status
      await storage.updateCrawlerStatus({
        webCrawlerActive: false
      });
      
      throw error;
    }
  } catch (error) {
    console.error('Error searching for top cryptocurrencies:', error);
    
    // Update crawler status
    await storage.updateCrawlerStatus({
      webCrawlerActive: false
    });
    
    return false;
  }
}
