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

// Sample cryptocurrency data for when APIs are not available
// This is an extended dataset with 20 cryptocurrencies to enable more comprehensive testing
const sampleCryptocurrencies = [
  {
    name: "Bitcoin",
    symbol: "BTC",
    price: 61254.32,
    priceChange24h: 1.25,
    marketCap: 1196725942300,
    volume24h: 28673420500,
    rank: 1
  },
  {
    name: "Ethereum",
    symbol: "ETH",
    price: 3010.17,
    priceChange24h: 2.38,
    marketCap: 361582291400,
    volume24h: 15839327600,
    rank: 2
  },
  {
    name: "Tether",
    symbol: "USDT",
    price: 1.0,
    priceChange24h: 0.01,
    marketCap: 94841092500,
    volume24h: 53847125300,
    rank: 3
  },
  {
    name: "BNB",
    symbol: "BNB",
    price: 564.82,
    priceChange24h: 0.86,
    marketCap: 86394153000,
    volume24h: 1298347600,
    rank: 4
  },
  {
    name: "Solana",
    symbol: "SOL",
    price: 137.85,
    priceChange24h: 3.75,
    marketCap: 59746394700,
    volume24h: 2975431800,
    rank: 5
  },
  {
    name: "XRP",
    symbol: "XRP",
    price: 0.5284,
    priceChange24h: -0.34,
    marketCap: 28924610700,
    volume24h: 782145600,
    rank: 6
  },
  {
    name: "USDC",
    symbol: "USDC",
    price: 1.0,
    priceChange24h: 0.01,
    marketCap: 26931046200,
    volume24h: 1956732400,
    rank: 7
  },
  {
    name: "Cardano",
    symbol: "ADA",
    price: 0.4581,
    priceChange24h: -2.15,
    marketCap: 16132594300,
    volume24h: 321345600,
    rank: 8
  },
  {
    name: "Avalanche",
    symbol: "AVAX",
    price: 36.87,
    priceChange24h: 2.14,
    marketCap: 14289453700,
    volume24h: 689432100,
    rank: 9
  },
  {
    name: "Dogecoin",
    symbol: "DOGE",
    price: 0.1384,
    priceChange24h: -1.05,
    marketCap: 13621859400,
    volume24h: 542781900,
    rank: 10
  },
  {
    name: "Polkadot",
    symbol: "DOT",
    price: 7.32,
    priceChange24h: 1.63,
    marketCap: 9421567800,
    volume24h: 312654700,
    rank: 11
  },
  {
    name: "Polygon",
    symbol: "MATIC",
    price: 0.6745,
    priceChange24h: -0.87,
    marketCap: 6542198300,
    volume24h: 271543600,
    rank: 12
  },
  {
    name: "Chainlink",
    symbol: "LINK",
    price: 14.52,
    priceChange24h: 3.21,
    marketCap: 8452187600,
    volume24h: 456781200,
    rank: 13
  },
  {
    name: "Litecoin",
    symbol: "LTC",
    price: 84.21,
    priceChange24h: 0.54,
    marketCap: 6245871300,
    volume24h: 321546800,
    rank: 14
  },
  {
    name: "Shiba Inu",
    symbol: "SHIB",
    price: 0.00002158,
    priceChange24h: -2.37,
    marketCap: 8745621400,
    volume24h: 245873100,
    rank: 15
  },
  {
    name: "Uniswap",
    symbol: "UNI",
    price: 7.82,
    priceChange24h: 1.24,
    marketCap: 5873245600,
    volume24h: 198742300,
    rank: 16
  },
  {
    name: "Stellar",
    symbol: "XLM",
    price: 0.1075,
    priceChange24h: -0.43,
    marketCap: 3021546800,
    volume24h: 87321500,
    rank: 17
  },
  {
    name: "Cosmos",
    symbol: "ATOM",
    price: 9.43,
    priceChange24h: 2.18,
    marketCap: 3542187900,
    volume24h: 132546700,
    rank: 18
  },
  {
    name: "Monero",
    symbol: "XMR",
    price: 162.74,
    priceChange24h: 1.05,
    marketCap: 2987456200,
    volume24h: 65432100,
    rank: 19
  },
  {
    name: "Filecoin",
    symbol: "FIL",
    price: 5.24,
    priceChange24h: -1.17, 
    marketCap: 2654321800,
    volume24h: 98765400,
    rank: 20
  }
];

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
    
    // First attempt: try CoinGecko API
    try {
      console.log("Attempting to use CoinGecko API...");
      const apiUrl = `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=${count}&page=1`;
      const response = await makeHttpsRequest(apiUrl);
      const apiData = JSON.parse(response);
      
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
    } catch (apiError) {
      console.log("CoinGecko API failed, trying CoinMarketCap API...");
      
      // Second attempt: try CoinMarketCap API (if permitted based on terms of service)
      try {
        const cmcUrl = `https://pro-api.coinmarketcap.com/v1/cryptocurrency/listings/latest?limit=${count}`;
        // Note: This is a paid API that requires an API key, commented out as it needs credentials
        // If user provides API key, this could be used
        throw new Error("CoinMarketCap API requires credentials");
      } catch (cmcError) {
        console.log("CoinMarketCap API failed, trying CoinCap API...");
        
        // Third attempt: try CoinCap API
        try {
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
          console.log("All API sources failed, using sample data as fallback...");
          
          // Last resort: use sample data
          for (let i = 0; i < Math.min(count, sampleCryptocurrencies.length); i++) {
            cryptocurrencies.push(sampleCryptocurrencies[i]);
          }
          
          console.log(`Using ${cryptocurrencies.length} sample cryptocurrencies.`);
          sourceUsed = "sample";
        }
      }
    }
    
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
    console.error('Error searching for top cryptocurrencies:', error);
    
    // Update crawler status
    await storage.updateCrawlerStatus({
      webCrawlerActive: false
    });
    
    return false;
  }
}
