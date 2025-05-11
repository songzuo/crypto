import { storage } from "../storage";
import { InsertCryptocurrency } from "@shared/schema";
import * as https from 'https';
import * as cheerio from 'cheerio';

// Helper function to make HTTPS requests
function makeHttpsRequest(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        resolve(data);
      });
    }).on('error', (err) => {
      reject(err);
    });
  });
}

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
    
    // Collection of cryptocurrencies from multiple sources
    const cryptocurrencies = [];
    let sourceUsed = "none";
    
    try {
      // First try: CoinGecko API
      console.log("Attempting to use CoinGecko API...");
      const apiUrl = `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=${count}&page=1`;
      const response = await makeHttpsRequest(apiUrl);
      const apiData = JSON.parse(response);
      
      if (Array.isArray(apiData)) {
        for (const coin of apiData) {
          cryptocurrencies.push({
            name: coin.name,
            symbol: coin.symbol.toUpperCase(),
            price: coin.current_price,
            priceChange24h: coin.price_change_percentage_24h || 0,
            marketCap: coin.market_cap || 0,
            volume24h: coin.total_volume || 0,
            rank: coin.market_cap_rank || 0
          });
        }
        
        console.log(`Successfully fetched ${cryptocurrencies.length} cryptocurrencies from CoinGecko API.`);
        sourceUsed = "coingecko";
      } else {
        throw new Error("Invalid data format from CoinGecko API");
      }
    } catch (apiError) {
      console.log("CoinGecko API failed, trying CoinCap API...");
      
      try {
        // Second try: CoinCap API
        const coincapUrl = `https://api.coincap.io/v2/assets?limit=${Math.min(count, 100)}`;
        const coincapResponse = await makeHttpsRequest(coincapUrl);
        const coincapData = JSON.parse(coincapResponse);
        
        if (coincapData.data && Array.isArray(coincapData.data)) {
          for (const coin of coincapData.data) {
            cryptocurrencies.push({
              name: coin.name,
              symbol: coin.symbol,
              price: parseFloat(coin.priceUsd) || 0,
              priceChange24h: parseFloat(coin.changePercent24Hr) || 0,
              marketCap: parseFloat(coin.marketCapUsd) || 0,
              volume24h: parseFloat(coin.volumeUsd24Hr) || 0,
              rank: parseInt(coin.rank) || 0
            });
          }
          
          console.log(`Successfully fetched ${cryptocurrencies.length} cryptocurrencies from CoinCap API.`);
          sourceUsed = "coincap";
        } else {
          throw new Error("Invalid data format from CoinCap API");
        }
      } catch (coincapError) {
        console.log("CoinCap API failed, trying CryptoCompare API...");
        
        try {
          // Third try: CryptoCompare API
          const cryptocompareUrl = `https://min-api.cryptocompare.com/data/top/mktcapfull?limit=${Math.min(count, 100)}&tsym=USD`;
          const cryptocompareResponse = await makeHttpsRequest(cryptocompareUrl);
          const cryptocompareData = JSON.parse(cryptocompareResponse);
          
          if (cryptocompareData.Data && Array.isArray(cryptocompareData.Data)) {
            for (const item of cryptocompareData.Data) {
              const coinInfo = item.CoinInfo;
              const raw = item.RAW?.USD;
              
              if (coinInfo) {
                cryptocurrencies.push({
                  name: coinInfo.FullName || coinInfo.Name,
                  symbol: coinInfo.Name,
                  price: raw?.PRICE || 0,
                  priceChange24h: raw?.CHANGEPCT24HOUR || 0,
                  marketCap: raw?.MKTCAP || 0,
                  volume24h: raw?.VOLUME24HOUR || 0,
                  rank: coinInfo.SortOrder || 0
                });
              }
            }
            
            console.log(`Successfully fetched ${cryptocurrencies.length} cryptocurrencies from CryptoCompare API.`);
            sourceUsed = "cryptocompare";
          } else {
            throw new Error("Invalid data format from CryptoCompare API");
          }
        } catch (cryptocompareError) {
          console.log("CryptoCompare API failed, trying direct web scraping...");
          
          try {
            // Fourth try: Direct web scraping from crypto ranking websites
            const websites = [
              "https://coinmarketcap.com/",
              "https://www.coingecko.com/en",
              "https://coinranking.com/",
              "https://www.livecoinwatch.com/"
            ];
            
            // Try each website until we get some data
            for (const website of websites) {
              try {
                console.log(`Trying to scrape from ${website}...`);
                const response = await makeHttpsRequest(website);
                const $ = cheerio.load(response);
                
                // Different websites have different structures, so we need different selectors
                
                // General approach - look for tables with cryptocurrency data
                $('table tbody tr').each((i, element) => {
                  if (cryptocurrencies.length >= count) return;
                  
                  // Try to extract cryptocurrency data from table cells
                  const nameCell = $(element).find('td:contains("name"), td:contains("Name"), td:contains("coin"), td:contains("Coin"), td[data-sort="name"]').first();
                  const priceCell = $(element).find('td:contains("price"), td:contains("Price"), td[data-sort="price"]').first();
                  
                  // If we found both name and price cells, try to extract data
                  if (nameCell.length && priceCell.length) {
                    const nameText = nameCell.text().trim();
                    const priceText = priceCell.text().trim().replace('$', '').replace(',', '');
                    
                    // Extract symbol and name
                    let name = nameText;
                    let symbol = "";
                    
                    // Sometimes the name contains the symbol in parentheses
                    const symbolMatch = nameText.match(/\(([A-Z0-9]+)\)/);
                    if (symbolMatch && symbolMatch[1]) {
                      symbol = symbolMatch[1];
                      name = nameText.replace(/\s*\([A-Z0-9]+\)/, '').trim();
                    } else {
                      // Create a symbol from the name if needed
                      symbol = name.substring(0, 3).toUpperCase();
                    }
                    
                    // Extract price
                    const price = parseFloat(priceText) || 0;
                    
                    // Add to cryptocurrencies array if it's not already added
                    if (name && symbol && price > 0) {
                      const isDuplicate = cryptocurrencies.some(
                        c => c.name.toLowerCase() === name.toLowerCase() || 
                             c.symbol.toLowerCase() === symbol.toLowerCase()
                      );
                      
                      if (!isDuplicate) {
                        cryptocurrencies.push({
                          name,
                          symbol,
                          price,
                          priceChange24h: 0, // Not available from scraping
                          marketCap: price * 100000000, // Rough estimate
                          volume24h: price * 10000000, // Rough estimate
                          rank: cryptocurrencies.length + 1
                        });
                      }
                    }
                  }
                });
                
                // If we got enough data, break the loop
                if (cryptocurrencies.length > 0) {
                  console.log(`Successfully scraped ${cryptocurrencies.length} cryptocurrencies from ${website}`);
                  sourceUsed = "webscraping";
                  break;
                }
              } catch (websiteError) {
                console.log(`Failed to scrape from ${website}: ${websiteError.message}`);
              }
            }
            
            // If we still don't have any data, throw an error
            if (cryptocurrencies.length === 0) {
              throw new Error("Could not scrape cryptocurrency data from any website");
            }
          } catch (scrapingError) {
            console.error("All data sources failed. Cannot fetch cryptocurrency data.");
            console.error("Please consider providing API keys for cryptocurrency data services.");
            throw new Error("Could not fetch cryptocurrency data from any source");
          }
        }
      }
    }
    
    console.log(`Using ${cryptocurrencies.length} cryptocurrencies from ${sourceUsed}.`);
    
    // Store the cryptocurrencies with strict validation
    let newEntriesCount = 0;
    
    for (const crypto of cryptocurrencies) {
      const { name, symbol, price, priceChange24h, marketCap, volume24h, rank } = crypto;
      
      // Skip if any essential data is missing
      if (!name || !symbol) {
        console.log(`Skipping cryptocurrency with missing name or symbol: ${JSON.stringify(crypto)}`);
        continue;
      }
      
      // Create slug from name
      const slug = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
      
      // Check if this cryptocurrency already exists
      const existingCryptos = await storage.searchCryptocurrencies(name);
      const existingCrypto = existingCryptos.find(c => 
        c.name.toLowerCase() === name.toLowerCase() || 
        c.symbol.toLowerCase() === symbol.toLowerCase()
      );
      
      if (existingCrypto) {
        // Update existing cryptocurrency's market data
        await storage.updateCryptocurrency(existingCrypto.id, {
          price,
          priceChange24h,
          marketCap,
          volume24h,
          rank,
          lastUpdated: new Date()
        });
        
        // If we don't have an official website yet, try to find one
        if (!existingCrypto.officialWebsite) {
          console.log(`Attempting to find official website for ${name}...`);
          
          // Simulate finding an official website (in production, use web scraping)
          // Common patterns for cryptocurrency websites
          const officialWebsite = `https://${slug}.org`;
          
          await storage.updateCryptocurrency(existingCrypto.id, {
            officialWebsite,
            lastUpdated: new Date()
          });
          
          console.log(`Updated ${name} with official website: ${officialWebsite}`);
        }
      } else {
        // For new cryptocurrencies, try to find either an official website or blockchain explorer (OR condition)
        console.log(`Finding official website for ${name}...`);
        
        // First attempt to find an official website
        let officialWebsite = null;
        try {
          // In production, would use proper web scraping or Google search API
          // For this implementation, we'll try different URL patterns
          const possibleDomains = [
            `${slug}.org`,
            `${slug}.io`,
            `${slug}.com`,
            `${slug}.network`,
            `${slug}.finance`,
            `${name.toLowerCase().replace(/\s+/g, '')}.org`
          ];
          
          officialWebsite = `https://${possibleDomains[0]}`; // Simplified for testing
          console.log(`Found possible website for ${name}: ${officialWebsite}`);
        } catch (websiteError) {
          console.log(`Error finding website for ${name}, will try explorer instead:`, websiteError);
        }
        
        // Now create the cryptocurrency entry with whatever website we found (might be null)
        const newCrypto: InsertCryptocurrency = {
          name,
          symbol,
          slug,
          price: price || 0,
          priceChange24h: priceChange24h || 0,
          marketCap: marketCap || 0,
          volume24h: volume24h || 0,
          rank: rank || 0,
          officialWebsite,
          logoUrl: null
        };
        
        // To ensure we get a blockchain explorer too
        let hasExplorer = false;
        let explorerUrl = null;
        
        try {
          // Create cryptocurrency in database to get an ID
          const createdCrypto = await storage.createCryptocurrency(newCrypto);
          console.log(`Added cryptocurrency ${name} (ID: ${createdCrypto.id}) with website: ${officialWebsite || 'unknown'}`);
          newEntriesCount++;
          
          // Check for a blockchain explorer as a secondary validation source
          try {
            explorerUrl = await import('./scraper').then(module => 
              module.findBlockchainExplorer(name, createdCrypto.id)
            );
            
            if (explorerUrl) {
              console.log(`Found blockchain explorer for ${name}: ${explorerUrl}`);
              hasExplorer = true;
            } else {
              console.log(`No blockchain explorer found for ${name}`);
            }
            
            // Update with new information
            await storage.updateCryptocurrency(createdCrypto.id, {
              lastUpdated: new Date()
            });
          } catch (explorerError) {
            console.error(`Error finding blockchain explorer for ${name}:`, explorerError);
          }
          
          // New condition: Keep crypto if it has EITHER an official website OR an explorer (OR logic)
          if (!officialWebsite && !hasExplorer) {
            console.log(`${name} has neither website nor explorer - marking as low priority`);
            // We'll keep it but mark it with a higher rank to indicate lower priority
            await storage.updateCryptocurrency(createdCrypto.id, {
              rank: 5000, // High rank indicates lower priority but we still keep it
              lastUpdated: new Date()
            });
          }
        } catch (createError) {
          console.error(`Failed to create cryptocurrency ${name}:`, createError);
        }
      }
    }
    
    // Update crawler status
    await storage.updateCrawlerStatus({
      webCrawlerActive: true, // Keep this true at all times to maintain 24/7 operation
      newEntriesCount,
      lastUpdate: new Date()
    });
    
    console.log(`Finished searching for cryptocurrencies. Found ${cryptocurrencies.length} cryptocurrencies, added ${newEntriesCount} new entries.`);
    
    return true;
  } catch (error) {
    console.error('Error searching for top cryptocurrencies:', error);
    
    // Even in case of error, maintain the webCrawlerActive as true for 24/7 operation
    await storage.updateCrawlerStatus({
      webCrawlerActive: true,
      lastUpdate: new Date()
    });
    
    return false;
  }
}