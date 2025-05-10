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

// Sample cryptocurrency data for initial setup
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
    
    // First attempt: try to fetch data from CoinGecko API
    const cryptocurrencies = [];
    
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
    } catch (apiError) {
      console.log("CoinGecko API failed, using backup data source...");
      
      // If API fails, use sample data as fallback for demonstration
      for (let i = 0; i < Math.min(count, sampleCryptocurrencies.length); i++) {
        cryptocurrencies.push(sampleCryptocurrencies[i]);
      }
      
      console.log(`Using ${cryptocurrencies.length} sample cryptocurrencies.`);
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
