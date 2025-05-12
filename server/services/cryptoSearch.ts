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

// Helper function to check if a cryptocurrency is a duplicate of existing entries
async function isDuplicate(crypto: { name: string, symbol: string }): Promise<boolean> {
  // Check for name match
  const existingByName = await storage.searchCryptocurrencies(crypto.name);
  if (existingByName && existingByName.length > 0) {
    for (const existing of existingByName) {
      if (existing.name.toLowerCase() === crypto.name.toLowerCase()) {
        console.log(`Duplicate found by name: ${crypto.name} matches existing cryptocurrency ${existing.name}`);
        return true;
      }
    }
  }
  
  // Check for symbol match
  const existingBySymbol = await storage.searchCryptocurrencies(crypto.symbol);
  if (existingBySymbol && existingBySymbol.length > 0) {
    for (const existing of existingBySymbol) {
      if (existing.symbol.toLowerCase() === crypto.symbol.toLowerCase()) {
        console.log(`Duplicate found by symbol: ${crypto.symbol} matches existing cryptocurrency ${existing.symbol}`);
        return true;
      }
    }
  }
  
  return false;
}

// Function to search cryptocurrencies in a specific ranking range
export async function searchRankedCryptocurrencies(startRank: number = 1, endRank: number = 100): Promise<number> {
  try {
    console.log(`Searching for cryptocurrencies in rank range ${startRank}-${endRank}...`);
    let cryptocurrencies: any[] = [];
    let sourceUsed = "unknown";
    
    // Use CryptoCompare API to get a broader range
    try {
      console.log('Attempting to use CryptoCompare API for ranked search...');
      const url = `https://min-api.cryptocompare.com/data/top/mktcapfull?limit=${endRank - startRank + 1}&tsym=USD&page=${Math.floor(startRank/100)}`;
      const response = await makeHttpsRequest(url);
      const data = JSON.parse(response);
      
      if (data.Data && data.Data.length > 0) {
        cryptocurrencies = data.Data.map((item: any, index: number) => {
          const coinInfo = item.CoinInfo || {};
          const rawData = item.RAW?.USD || {};
          
          return {
            name: coinInfo.FullName || `Unknown ${index}`,
            symbol: coinInfo.Name || 'UNK',
            slug: (coinInfo.FullName || `unknown-${index}`).toLowerCase().replace(/[^a-z0-9]+/g, '-'),
            price: rawData.PRICE || 0,
            priceChange24h: rawData.CHANGEPCT24HOUR || 0,
            marketCap: rawData.MKTCAP || 0,
            volume24h: rawData.VOLUME24HOUR || 0,
            rank: startRank + index
          };
        }).filter((c: any) => c.marketCap > 0); // Filter out coins with no market cap
        
        sourceUsed = "cryptocompare";
      }
    } catch (cryptoCompareError) {
      console.error('CryptoCompare API failed:', cryptoCompareError);
    }
    
    // Process the cryptocurrencies and add them to our database
    let newEntriesCount = 0;
    
    // First, get all existing cryptocurrencies to check for duplicates
    const allExistingCryptos = await storage.getCryptocurrencies(1, 1000, "marketCap", "desc");
    
    // Create sets for faster duplicate checking
    const existingNames = new Set(allExistingCryptos.data.map(c => c.name.toLowerCase()));
    const existingSymbols = new Set(allExistingCryptos.data.map(c => c.symbol.toLowerCase()));
    const existingWebsites = new Set(
      allExistingCryptos.data
        .map(c => c.officialWebsite?.toLowerCase())
        .filter(Boolean)
    );
    
    // Process each cryptocurrency
    for (const crypto of cryptocurrencies) {
      const { name, symbol, slug, price, priceChange24h, marketCap, volume24h, rank } = crypto;
      
      // Skip if name or symbol already exists
      if (existingNames.has(name.toLowerCase()) || existingSymbols.has(symbol.toLowerCase())) {
        continue;
      }
      
      console.log(`Adding new cryptocurrency: ${name} (${symbol}), market cap: ${marketCap})`);
      
      // Generate a standard website format
      const officialWebsite = `https://${slug}.org`;
      
      // Skip if website already exists
      if (existingWebsites.has(officialWebsite.toLowerCase())) {
        continue;
      }
      
      console.log(`Using website for ${name}: ${officialWebsite}`);
      
      // Create the cryptocurrency entry
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
      
      let hasExplorer = false;
      
      try {
        // Create cryptocurrency to get an ID
        const createdCrypto = await storage.createCryptocurrency(newCrypto);
        console.log(`Added cryptocurrency ${name} (ID: ${createdCrypto.id}) with website: ${officialWebsite}`);
        newEntriesCount++;
        
        // Find a blockchain explorer
        try {
          const explorerUrl = await import('./scraper').then(module => 
            module.findBlockchainExplorer(name, createdCrypto.id)
          );
          
          if (explorerUrl) {
            console.log(`Found blockchain explorer for ${name}: ${explorerUrl}`);
            hasExplorer = true;
          }
          
          // No need to update lastUpdated as it has a defaultNow() in the schema
          await storage.updateCryptocurrency(createdCrypto.id, {});
        } catch (explorerError) {
          console.error(`Error finding blockchain explorer for ${name}:`, explorerError);
        }
        
        // Accept cryptocurrency if it has EITHER website OR explorer
        if (!officialWebsite && !hasExplorer) {
          console.log(`${name} has neither website nor explorer - marking as low priority`);
          await storage.updateCryptocurrency(createdCrypto.id, {
            rank: 5000 // Lower priority
            // No need to update lastUpdated as it has a defaultNow() in the schema
          });
        }
      } catch (createError) {
        console.error(`Failed to create cryptocurrency ${name}:`, createError);
      }
    }
    
    return newEntriesCount;
  } catch (error) {
    console.error('Error in ranked cryptocurrency search:', error);
    return 0;
  }
}

// Function to search for the top cryptocurrencies by market cap
export async function searchTopCryptocurrencies(count: number = 500): Promise<boolean> {
  try {
    // Get current count to avoid unnecessary API calls
    const currentCryptos = await storage.getCryptocurrencies(1, 1, "marketCap", "desc");
    const totalCount = currentCryptos.total || 0;
    
    // If we're below our target, expand the search to include more lower-ranked coins
    if (totalCount > 0 && totalCount < 500) {
      const lowerBound = Math.max(1, Math.floor(totalCount / 2));
      const upperBound = lowerBound + 250; // Increase range to ensure we get more data
      console.log(`Expanding search to rank range ${lowerBound}-${upperBound} to find more data`);
      
      // This will find coins that might not be in the top rankings but still have data
      try {
        const extraCount = await searchRankedCryptocurrencies(lowerBound, upperBound);
        console.log(`Found ${extraCount} cryptocurrencies in expanded rank range`);
      } catch (error) {
        console.error("Error in expanded search:", error);
      }
    }
    
    // Calculate how many more we need to fetch (aim for count, but fetch at least 100 more)
    const fetchBatchSize = Math.max(100, count - totalCount);
    console.log(`Current crypto count: ${totalCount}, fetching batch of ${fetchBatchSize}`);
    
    console.log(`Starting to search for top ${fetchBatchSize} cryptocurrencies...`);
    
    // Update crawler status
    await storage.updateCrawlerStatus({
      webCrawlerActive: true,
      aiProcessorActive: false,
      blockchainSyncActive: false
    });
    
    // Collection of cryptocurrencies from multiple sources
    type CryptoData = {
      name: string;
      symbol: string;
      marketCap: number;
      rank?: number;
      slug?: string;
      price?: number;
      priceChange24h?: number;
      volume24h?: number;
      officialWebsite?: string;
      source?: string;
      logoUrl?: string;
      _explorers?: string[];
    };
    
    const cryptocurrencies: CryptoData[] = [];
    let apiSuccesses = 0; // Track successful API calls
    
    // Always try all APIs and combine results to get the most comprehensive data
    // Define all of our API calls
    const tryAllApis = async () => {
      // === CoinGecko API ===
      try {
        console.log("Attempting to use CoinGecko API...");
        // Try with larger page size to get more data
        const apiUrl = `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=250&page=1`;
        const response = await makeHttpsRequest(apiUrl);
        const apiData = JSON.parse(response);
        
        if (Array.isArray(apiData)) {
          apiSuccesses++;
          for (const coin of apiData) {
            // Store actual website URL from API if available
            let website = null;
            if (coin.links?.homepage && coin.links.homepage.length > 0) {
              website = coin.links.homepage[0];
            }
            
            const nameWithoutWhitespace = coin.name.replace(/\s+/g, '');
            const nameSanitized = nameWithoutWhitespace || coin.id || coin.symbol;
            
            cryptocurrencies.push({
              name: coin.name || nameSanitized,
              symbol: coin.symbol ? coin.symbol.toUpperCase() : '',
              price: coin.current_price,
              priceChange24h: coin.price_change_percentage_24h || 0,
              marketCap: coin.market_cap || 0,
              volume24h: coin.total_volume || 0,
              rank: coin.market_cap_rank || 0,
              officialWebsite: website,
              slug: coin.id,
              source: 'coingecko'
            });
          }
          
          console.log(`Successfully fetched ${apiData.length} cryptocurrencies from CoinGecko API.`);
          
          // Try to get additional details for the top 10 coins
          try {
            for (let i = 0; i < 10 && i < apiData.length; i++) {
              const coin = apiData[i];
              if (coin && coin.id) {
                const detailUrl = `https://api.coingecko.com/api/v3/coins/${coin.id}?localization=false&tickers=false&market_data=true&community_data=false&developer_data=false`;
                const detailResponse = await makeHttpsRequest(detailUrl);
                const detailData = JSON.parse(detailResponse);
                
                if (detailData) {
                  // Find the existing entry
                  const existingIndex = cryptocurrencies.findIndex(c => 
                    c.name.toLowerCase() === (detailData.name || '').toLowerCase() && 
                    c.source === 'coingecko'
                  );
                  
                  if (existingIndex !== -1) {
                    // Update with more detailed data
                    if (detailData.links?.homepage && detailData.links.homepage.length > 0) {
                      cryptocurrencies[existingIndex].officialWebsite = detailData.links.homepage[0];
                    }
                    
                    if (detailData.links?.blockchain_site) {
                      // Store blockchain explorers for later use
                      const explorers = detailData.links.blockchain_site.filter(Boolean);
                      if (explorers.length > 0) {
                        cryptocurrencies[existingIndex]._explorers = explorers;
                      }
                    }
                  }
                }
              }
              // Small pause to avoid rate limits
              await new Promise(resolve => setTimeout(resolve, 200));
            }
          } catch (detailError) {
            console.log("Error fetching detailed CoinGecko data:", detailError.message);
          }
        }
      } catch (error) {
        console.log("CoinGecko API failed:", error.message);
      }
      
      // === CoinCap API ===
      try {
        console.log("Trying CoinCap API...");
        const coincapUrl = `https://api.coincap.io/v2/assets?limit=200`;
        const coincapResponse = await makeHttpsRequest(coincapUrl);
        const coincapData = JSON.parse(coincapResponse);
        
        if (coincapData.data && Array.isArray(coincapData.data)) {
          apiSuccesses++;
          for (const coin of coincapData.data) {
            // Generate a website based on explorer or actual data
            let website = null;
            if (coin.explorer) {
              const urlParts = coin.explorer.split('/');
              if (urlParts.length >= 3) {
                const hostname = urlParts[2];
                website = `https://${hostname}`;
              }
            }
            
            cryptocurrencies.push({
              name: coin.name,
              symbol: coin.symbol,
              price: parseFloat(coin.priceUsd) || 0,
              priceChange24h: parseFloat(coin.changePercent24Hr) || 0,
              marketCap: parseFloat(coin.marketCapUsd) || 0,
              volume24h: parseFloat(coin.volumeUsd24Hr) || 0,
              rank: parseInt(coin.rank) || 0,
              officialWebsite: website,
              slug: coin.id,
              source: 'coincap'
            });
          }
          
          console.log(`Successfully fetched ${coincapData.data.length} cryptocurrencies from CoinCap API.`);
        }
      } catch (error) {
        console.log("CoinCap API failed:", error.message);
      }
      
      // === CryptoCompare API ===
      try {
        console.log("Trying CryptoCompare API...");
        // Increased limit to get more data
        const cryptocompareUrl = `https://min-api.cryptocompare.com/data/top/mktcapfull?limit=200&tsym=USD`;
        const cryptocompareResponse = await makeHttpsRequest(cryptocompareUrl);
        const cryptocompareData = JSON.parse(cryptocompareResponse);
        
        if (cryptocompareData.Data && Array.isArray(cryptocompareData.Data)) {
          apiSuccesses++;
          for (const item of cryptocompareData.Data) {
            const coinInfo = item.CoinInfo;
            const raw = item.RAW?.USD;
            const display = item.DISPLAY?.USD;
            
            if (coinInfo) {
              // Generate a cleaner slug
              const slug = (coinInfo.Name || "").toLowerCase();
              
              // Try to get website URL if available, otherwise create a reasonable guess
              let website = null;
              if (coinInfo.Url && coinInfo.Url !== "N/A") {
                website = coinInfo.Url.startsWith('http') ? coinInfo.Url : `https://${coinInfo.Url}`;
              } else {
                website = `https://${slug}.org`;
              }
              
              cryptocurrencies.push({
                name: coinInfo.FullName || coinInfo.Name,
                symbol: coinInfo.Name,
                price: raw?.PRICE || 0,
                priceChange24h: raw?.CHANGEPCT24HOUR || 0,
                marketCap: raw?.MKTCAP || 0,
                volume24h: raw?.VOLUME24HOUR || 0,
                rank: parseInt(coinInfo.SortOrder) || 0,
                officialWebsite: website,
                slug,
                source: 'cryptocompare'
              });
            }
          }
          
          console.log(`Successfully fetched ${cryptocompareData.Data.length} cryptocurrencies from CryptoCompare API.`);
          
          // Get additional info for top coins via individual API calls
          try {
            // Get the top 10 coins from our results
            const topCoins = cryptocurrencies
              .filter(c => c.source === 'cryptocompare' && c.symbol)
              .sort((a, b) => (a.rank || 999) - (b.rank || 999))
              .slice(0, 10)
              .map(c => c.symbol);
            
            if (topCoins.length > 0) {
              const symbols = topCoins.join(',');
              const detailUrl = `https://min-api.cryptocompare.com/data/coin/generalinfo?fsyms=${symbols}&tsym=USD`;
              const detailResponse = await makeHttpsRequest(detailUrl);
              const detailData = JSON.parse(detailResponse);
              
              if (detailData.Data && Array.isArray(detailData.Data)) {
                for (const coinDetail of detailData.Data) {
                  const coinInfo = coinDetail.CoinInfo;
                  if (coinInfo) {
                    // Find the matching cryptocurrency
                    const existingIndex = cryptocurrencies.findIndex(c => 
                      c.symbol.toLowerCase() === coinInfo.Name.toLowerCase() && 
                      c.source === 'cryptocompare'
                    );
                    
                    if (existingIndex !== -1) {
                      // Update with better website and logo if available
                      if (coinInfo.Url && coinInfo.Url !== "N/A") {
                        const website = coinInfo.Url.startsWith('http') ? coinInfo.Url : `https://${coinInfo.Url}`;
                        cryptocurrencies[existingIndex].officialWebsite = website;
                      }
                      
                      if (coinInfo.ImageUrl) {
                        cryptocurrencies[existingIndex].logoUrl = `https://www.cryptocompare.com${coinInfo.ImageUrl}`;
                      }
                    }
                  }
                }
              }
            }
          } catch (detailError) {
            console.log("Error fetching detailed CryptoCompare data:", detailError.message);
          }
        }
      } catch (error) {
        console.log("CryptoCompare API failed:", error.message);
      }
      
      // If none of the API calls succeeded, try web scraping
      if (apiSuccesses === 0) {
        console.log("All API attempts failed. Trying direct web scraping...");
        
        try {
          // Try the direct CoinMarketCap scraper
          const numCrypto = await import('./webScraper').then(module => 
            module.scrapeCoinMarketCap(1)
          );
          console.log(`Found ${numCrypto} cryptocurrencies on CoinMarketCap page 1`);
          
          // Try CoinGecko scraper as a backup
          try {
            const geckoResult = await import('./webScraper').then(module => 
              module.scrapeCoinGecko(1)
            );
            console.log(`Found ${geckoResult} cryptocurrencies on CoinGecko page 1`);
          } catch (geckoError) {
            console.error("Error using direct CoinGecko scraper:", geckoError);
          }
          
          return numCrypto > 0;
        } catch (cmcError) {
          console.error("Error using direct CoinMarketCap scraper:", cmcError);
          return false;
        }
      }
      
      return cryptocurrencies.length > 0;
    };
    
    // Try all APIs and combine results
    const success = await tryAllApis();
    if (!success) {
      console.error("All data source attempts failed. Unable to fetch cryptocurrency data.");
      return false;
    }
    
    console.log(`Collected raw data for ${cryptocurrencies.length} cryptocurrencies from all sources.`);
    
    // Remove duplicates by creating a map with name_symbol as the key
    const uniqueCryptos = new Map<string, CryptoData>();
    
    // Process each cryptocurrency, prioritizing entries with more complete data
    for (const crypto of cryptocurrencies) {
      // Skip entries without name or symbol
      if (!crypto.name || !crypto.symbol) continue;
      
      const key = `${crypto.name.toLowerCase()}_${crypto.symbol.toLowerCase()}`;
      
      // Prefer entries with rank information
      if (!uniqueCryptos.has(key)) {
        uniqueCryptos.set(key, crypto);
      } else {
        const existing = uniqueCryptos.get(key)!;
        
        // Prioritize entries with more information
        // First, check if the new entry has rank information while the existing one doesn't
        if ((crypto.rank && !existing.rank) || 
            (crypto.rank && existing.rank && crypto.rank < existing.rank)) {
          uniqueCryptos.set(key, crypto);
        }
        // Otherwise, prefer the one with a higher market cap (if both have it)
        else if (crypto.marketCap && existing.marketCap && crypto.marketCap > existing.marketCap) {
          uniqueCryptos.set(key, crypto);
        }
        // If new entry has a real website and old has a generated one
        else if (crypto.officialWebsite && existing.officialWebsite && 
                 (!existing.officialWebsite.endsWith('.org') && crypto.officialWebsite.endsWith('.org'))) {
          // Keep existing entry but update the website
          existing.officialWebsite = crypto.officialWebsite;
        }
        
        // Merge information in case one source has some fields that the other doesn't
        if (!existing.price && crypto.price) existing.price = crypto.price;
        if (!existing.marketCap && crypto.marketCap) existing.marketCap = crypto.marketCap;
        if (!existing.volume24h && crypto.volume24h) existing.volume24h = crypto.volume24h;
        if (!existing.priceChange24h && crypto.priceChange24h) existing.priceChange24h = crypto.priceChange24h;
        if (!existing.officialWebsite && crypto.officialWebsite) existing.officialWebsite = crypto.officialWebsite;
      }
    }
    
    // Convert map to array and sort by market cap
    const mergedCryptos = Array.from(uniqueCryptos.values())
      .sort((a, b) => ((b.marketCap || 0) - (a.marketCap || 0)));
    
    console.log(`After deduplication, found ${mergedCryptos.length} unique cryptocurrencies.`);
    
    // Get existing cryptocurrencies
    const existingCryptos = await storage.getCryptocurrencies(1, 1000, "marketCap", "desc");
    
    // Create maps for faster lookup 
    const existingCryptosByName = new Map();
    const existingCryptosBySymbol = new Map();
    
    // Create maps for both name and symbol lookups
    for (const crypto of existingCryptos.data) {
      if (crypto.name) {
        existingCryptosByName.set(crypto.name.toLowerCase(), crypto);
      }
      if (crypto.symbol) {
        existingCryptosBySymbol.set(crypto.symbol.toLowerCase(), crypto);
      }
    }
    
    // Create set of existing websites
    const existingWebsites = new Set(
      existingCryptos.data
        .map(c => c.officialWebsite?.toLowerCase())
        .filter(Boolean)
    );
    
    let newEntriesCount = 0;
    let updatedEntriesCount = 0;
    
    // Track which cryptocurrencies have missing rank/market cap data
    const cryptosNeedingUpdate = [];
    
    // Process each cryptocurrency
    for (const crypto of mergedCryptos.slice(0, count)) {
      // Skip entries without crucial data
      if (!crypto.name || !crypto.symbol) {
        continue;
      }
      
      // Lookup by name or symbol
      const existingByName = existingCryptosByName.get(crypto.name.toLowerCase());
      const existingBySymbol = existingCryptosBySymbol.get(crypto.symbol.toLowerCase());
      const existing = existingByName || existingBySymbol;
      
      if (existing) {
        // Update existing cryptocurrency with new data
        try {
          const updateData: Partial<InsertCryptocurrency> = {};
          
          // Set update flags if specific fields need updating
          let rankNeedsUpdate = false;
          let marketCapNeedsUpdate = false;
          
          // Check if existing data needs updating
          if (existing.rank === null || existing.rank === 0) {
            rankNeedsUpdate = true;
          }
          
          if (existing.marketCap === null || existing.marketCap === 0) {
            marketCapNeedsUpdate = true;
          }
          
          // Only update fields if they have valid data and are better than what we have
          if (crypto.price !== undefined && crypto.price > 0) {
            updateData.price = crypto.price;
          }
          
          if (crypto.priceChange24h !== undefined) {
            updateData.priceChange24h = crypto.priceChange24h;
          }
          
          if (crypto.marketCap !== undefined && crypto.marketCap > 0 && 
             (marketCapNeedsUpdate || crypto.marketCap > existing.marketCap)) {
            updateData.marketCap = crypto.marketCap;
            console.log(`Updating market cap for ${crypto.name} (ID: ${existing.id}) to ${crypto.marketCap}`);
          }
          
          if (crypto.volume24h !== undefined && crypto.volume24h > 0) {
            updateData.volume24h = crypto.volume24h;
          }
          
          if (crypto.rank !== undefined && crypto.rank > 0 && 
             (rankNeedsUpdate || (existing.rank && crypto.rank < existing.rank))) {
            updateData.rank = crypto.rank;
            console.log(`Updating rank for ${crypto.name} (ID: ${existing.id}) to ${crypto.rank}`);
          }
          
          // Update official website if we have a better one (not a placeholder)
          if (crypto.officialWebsite && 
              (!existing.officialWebsite || 
               existing.officialWebsite.endsWith('.org') && !crypto.officialWebsite.endsWith('.org'))) {
            updateData.officialWebsite = crypto.officialWebsite;
            console.log(`Updating website for ${crypto.name} (ID: ${existing.id}) to ${crypto.officialWebsite}`);
          }
          
          // Only update if we have meaningful data
          if (Object.keys(updateData).length > 0) {
            const updated = await storage.updateCryptocurrency(existing.id, updateData);
            if (updated) {
              updatedEntriesCount++;
              console.log(`Updated existing cryptocurrency: ${crypto.name} (ID: ${existing.id})`);
            }
          }
          
          // Track this crypto as needing further updates if missing important data
          if ((existing.rank === null || existing.rank === 0 || existing.marketCap === null || existing.marketCap === 0) && 
              !updateData.rank && !updateData.marketCap) {
            cryptosNeedingUpdate.push({
              id: existing.id,
              name: existing.name,
              symbol: existing.symbol
            });
          }
          
          // If we have blockchain explorers from API data, add them
          if (crypto._explorers && Array.isArray(crypto._explorers)) {
            for (const explorerUrl of crypto._explorers) {
              if (explorerUrl) {
                try {
                  await import('./scraper').then(module => 
                    module.findBlockchainExplorer(crypto.name, existing.id, explorerUrl)
                  );
                } catch (explorerError) {
                  // Just continue if one fails
                }
              }
            }
          }
        } catch (updateError) {
          console.error(`Error updating cryptocurrency ${crypto.name}:`, updateError);
        }
      } else {
        // Add new cryptocurrency
        try {
          // Generate a standard slug if none provided
          const slug = crypto.slug || crypto.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
          
          // Use provided website or generate a reasonable one
          const officialWebsite = crypto.officialWebsite || `https://${slug}.org`;
          
          // Create the new cryptocurrency
          const newCrypto: InsertCryptocurrency = {
            name: crypto.name,
            symbol: crypto.symbol,
            slug,
            price: crypto.price || 0,
            priceChange24h: crypto.priceChange24h || 0,
            marketCap: crypto.marketCap || 0,
            volume24h: crypto.volume24h || 0,
            rank: crypto.rank || 0,
            officialWebsite,
            logoUrl: crypto.logoUrl || null
          };
          
          // Check if this website already exists to avoid duplicates
          if (officialWebsite && existingWebsites.has(officialWebsite.toLowerCase())) {
            console.log(`Skipping duplicate cryptocurrency: ${crypto.name} - Website ${officialWebsite} already exists.`);
            continue;
          }
          
          const createdCrypto = await storage.createCryptocurrency(newCrypto);
          console.log(`Added cryptocurrency ${crypto.name} (ID: ${createdCrypto.id}) with rank ${crypto.rank || 'unknown'}`);
          newEntriesCount++;
          
          // Immediately try to find a blockchain explorer for this cryptocurrency
          try {
            // If the API provided explorers, use them
            if (crypto._explorers && Array.isArray(crypto._explorers) && crypto._explorers.length > 0) {
              for (const explorerUrl of crypto._explorers) {
                if (explorerUrl) {
                  await import('./scraper').then(module => 
                    module.findBlockchainExplorer(crypto.name, createdCrypto.id, explorerUrl)
                  );
                }
              }
            } else {
              // Try the standard explorer finder
              const explorerUrl = await import('./scraper').then(module => 
                module.findBlockchainExplorer(crypto.name, createdCrypto.id)
              );
              
              if (explorerUrl) {
                console.log(`Found explorer for ${crypto.name}: ${explorerUrl}`);
              }
            }
          } catch (explorerError) {
            console.error(`Error finding explorer for ${crypto.name}:`, explorerError);
          }
        } catch (createError) {
          console.error(`Failed to create cryptocurrency ${crypto.name}:`, createError);
        }
      }
    }
    
    // Try to update cryptocurrencies with missing data
    if (cryptosNeedingUpdate.length > 0) {
      console.log(`Found ${cryptosNeedingUpdate.length} cryptocurrencies with missing ranking or market cap data. Attempting to update...`);
      
      // Process in smaller batches to avoid rate limits
      const batchSize = 10;
      for (let i = 0; i < Math.min(cryptosNeedingUpdate.length, 50); i += batchSize) {
        const batch = cryptosNeedingUpdate.slice(i, i + batchSize);
        
        // Try to get additional data for each cryptocurrency
        for (const crypto of batch) {
          try {
            console.log(`Attempting to get data for ${crypto.name} (${crypto.symbol})`);
            
            // Try multiple data sources
            let updated = false;
            
            // Try CoinGecko individual lookup by name or symbol
            try {
              const searchUrl = `https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(crypto.name)}`;
              const searchResponse = await makeHttpsRequest(searchUrl);
              const searchData = JSON.parse(searchResponse);
              
              if (searchData && searchData.coins && searchData.coins.length > 0) {
                // Find the most likely match
                const matches = searchData.coins.filter((coin: any) => 
                  coin.symbol.toLowerCase() === crypto.symbol.toLowerCase() || 
                  coin.name.toLowerCase() === crypto.name.toLowerCase()
                );
                
                if (matches.length > 0) {
                  const match = matches[0];
                  
                  // Get detailed data
                  const detailUrl = `https://api.coingecko.com/api/v3/coins/${match.id}?localization=false&tickers=false&market_data=true&community_data=false&developer_data=false`;
                  const detailResponse = await makeHttpsRequest(detailUrl);
                  const detailData = JSON.parse(detailResponse);
                  
                  if (detailData && detailData.market_data) {
                    const updateData: Partial<InsertCryptocurrency> = {};
                    
                    if (detailData.market_cap_rank) {
                      updateData.rank = detailData.market_cap_rank;
                    }
                    
                    if (detailData.market_data.market_cap?.usd) {
                      updateData.marketCap = detailData.market_data.market_cap.usd;
                    }
                    
                    if (detailData.market_data.current_price?.usd) {
                      updateData.price = detailData.market_data.current_price.usd;
                    }
                    
                    if (detailData.market_data.total_volume?.usd) {
                      updateData.volume24h = detailData.market_data.total_volume.usd;
                    }
                    
                    if (detailData.links?.homepage && detailData.links.homepage.length > 0) {
                      const website = detailData.links.homepage[0];
                      if (website && website !== "" && website !== "N/A") {
                        updateData.officialWebsite = website;
                      }
                    }
                    
                    if (Object.keys(updateData).length > 0) {
                      await storage.updateCryptocurrency(crypto.id, updateData);
                      console.log(`Updated data for ${crypto.name} (ID: ${crypto.id}) with CoinGecko data`);
                      updated = true;
                      
                      // Add explorers if available
                      if (detailData.links?.blockchain_site) {
                        const explorers = detailData.links.blockchain_site.filter(Boolean);
                        for (const explorer of explorers.slice(0, 2)) { // Limit to first 2 explorers
                          try {
                            await import('./scraper').then(module => 
                              module.findBlockchainExplorer(crypto.name, crypto.id, explorer)
                            );
                          } catch (explorerError) {
                            // Just continue
                          }
                        }
                      }
                    }
                  }
                }
              }
            } catch (error) {
              console.log(`Failed to get CoinGecko data for ${crypto.name}:`, error.message);
            }
            
            // If not updated by CoinGecko, try CryptoCompare
            if (!updated) {
              try {
                const coinInfoUrl = `https://min-api.cryptocompare.com/data/pricemultifull?fsyms=${crypto.symbol}&tsyms=USD`;
                const response = await makeHttpsRequest(coinInfoUrl);
                const data = JSON.parse(response);
                
                if (data.RAW && data.RAW[crypto.symbol] && data.RAW[crypto.symbol].USD) {
                  const rawData = data.RAW[crypto.symbol].USD;
                  
                  const updateData: Partial<InsertCryptocurrency> = {};
                  
                  if (rawData.MKTCAP) {
                    updateData.marketCap = rawData.MKTCAP;
                  }
                  
                  if (rawData.PRICE) {
                    updateData.price = rawData.PRICE;
                  }
                  
                  if (rawData.VOLUME24HOUR) {
                    updateData.volume24h = rawData.VOLUME24HOUR;
                  }
                  
                  if (rawData.CHANGEPCT24HOUR) {
                    updateData.priceChange24h = rawData.CHANGEPCT24HOUR;
                  }
                  
                  if (Object.keys(updateData).length > 0) {
                    await storage.updateCryptocurrency(crypto.id, updateData);
                    console.log(`Updated market data for ${crypto.name} (ID: ${crypto.id}) with CryptoCompare data`);
                    updated = true;
                  }
                }
              } catch (error) {
                console.log(`Failed to get CryptoCompare data for ${crypto.name}:`, error.message);
              }
            }
            
            // Small delay to avoid rate limits
            await new Promise(resolve => setTimeout(resolve, 500));
          } catch (error) {
            console.error(`Failed to update data for ${crypto.name}:`, error.message);
          }
        }
      }
    }
    
    console.log(`Finished cryptocurrency search. Found ${mergedCryptos.length} cryptocurrencies, added ${newEntriesCount} new entries and updated ${updatedEntriesCount} existing entries.`);
    
    // Run blockchain explorer finder for top coins if needed
    const existingWithoutExplorers = await storage.getCryptocurrencies(1, 25, "marketCap", "desc");
    if (existingWithoutExplorers.data.length > 0) {
      console.log("Finding explorers for top-ranked cryptocurrencies...");
      for (const crypto of existingWithoutExplorers.data.slice(0, 25)) {
        try {
          await import('./scraper').then(module => 
            module.findBlockchainExplorer(crypto.name, crypto.id)
          );
        } catch (error) {
          // Just continue to the next one
        }
      }
    }
    
    return true;
  } catch (error) {
    console.error(`Error in top cryptocurrency search:`, error);
    return false;
  }
}

// Function to search for cryptocurrencies (to be called by the web scraper)
export async function searchCryptocurrenciesByData(
  cryptocurrencyData: Array<{
    name: string;
    symbol: string;
    price?: number;
    priceChange24h?: number;
    marketCap?: number;
    volume24h?: number;
    rank?: number;
    officialWebsite?: string;
  }>
): Promise<number> {
  try {
    console.log(`Processing ${cryptocurrencyData.length} cryptocurrencies from direct scraping...`);
    
    // Get existing cryptocurrencies for comparison
    const existingCryptos = await storage.getCryptocurrencies(1, 1000, "marketCap", "desc");
    
    // Create maps for faster lookups
    const existingByName = new Map(existingCryptos.data.map(c => [c.name.toLowerCase(), c]));
    const existingBySymbol = new Map(existingCryptos.data.map(c => [c.symbol.toLowerCase(), c]));
    
    let createdCount = 0;
    let updatedCount = 0;
    
    // Process each cryptocurrency
    for (const crypto of cryptocurrencyData) {
      const { name, symbol, price, priceChange24h, marketCap, volume24h, rank, officialWebsite } = crypto;
      
      // Skip invalid entries
      if (!name || !symbol) continue;
      
      // Look for existing cryptocurrency
      const existingCrypto = existingByName.get(name.toLowerCase()) || existingBySymbol.get(symbol.toLowerCase());
      
      if (existingCrypto) {
        // Update existing cryptocurrency
        const updateData: Partial<InsertCryptocurrency> = {};
        
        if (price !== undefined && price > 0) updateData.price = price;
        if (priceChange24h !== undefined) updateData.priceChange24h = priceChange24h;
        if (marketCap !== undefined && marketCap > 0) {
          updateData.marketCap = marketCap;
          console.log(`Updating market cap for ${name} (ID: ${existingCrypto.id}) to ${marketCap}`);
        }
        if (volume24h !== undefined && volume24h > 0) updateData.volume24h = volume24h;
        if (rank !== undefined && rank > 0) {
          updateData.rank = rank;
          console.log(`Updating rank for ${name} (ID: ${existingCrypto.id}) to ${rank}`);
        }
        if (officialWebsite) updateData.officialWebsite = officialWebsite;
        
        // Only update if we have meaningful data
        if (Object.keys(updateData).length > 0) {
          const updated = await storage.updateCryptocurrency(existingCrypto.id, updateData);
          if (updated) {
            updatedCount++;
            console.log(`Updated existing cryptocurrency: ${name} (ID: ${existingCrypto.id})`);
          }
        }
      } else {
        // Create new cryptocurrency
        try {
          // Generate slug from name
          const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
          
          // Generate website if none provided
          const website = officialWebsite || `https://${slug}.org`;
          
          // Create new cryptocurrency entry
          const newCrypto: InsertCryptocurrency = {
            name,
            symbol,
            slug,
            price: price || 0,
            priceChange24h: priceChange24h || 0,
            marketCap: marketCap || 0,
            volume24h: volume24h || 0,
            rank: rank || 0,
            officialWebsite: website,
            logoUrl: null
          };
          
          const createdCrypto = await storage.createCryptocurrency(newCrypto);
          console.log(`Created new cryptocurrency: ${name} (ID: ${createdCrypto.id})`);
          createdCount++;
          
          // Try to find blockchain explorer
          try {
            await import('./scraper').then(module => 
              module.findBlockchainExplorer(name, createdCrypto.id)
            );
          } catch (error) {
            // Just continue
          }
        } catch (error) {
          console.error(`Error creating cryptocurrency ${name}:`, error);
        }
      }
    }
    
    console.log(`Successfully extracted ${createdCount} new cryptocurrencies from direct scraping`);
    return createdCount;
  } catch (error) {
    console.error("Error processing scraped cryptocurrency data:", error);
    return 0;
  }
}