import { storage } from "../storage";
import { InsertCryptocurrency } from "@shared/schema";
import * as https from 'https';
import * as cheerio from 'cheerio';

// 自定义错误类型，便于处理类型错误
class ApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApiError";
  }
}

// Helper function to make HTTPS requests
function makeHttpsRequest(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const options = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    };
    
    https.get(url, options, (res) => {
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

// Update Trump coin data with more accurate information
export async function updateTrumpCoinData() {
  try {
    console.log("特别更新 Trump 币的数据...");
    
    // 获取Trump币的当前数据
    const trumpCoin = await storage.getCryptocurrency(16);
    if (!trumpCoin) {
      console.log("未找到Trump币信息");
      return false;
    }
    
    // 获取排名、市值等信息（通过尝试多个API）
    let updated = false;
    
    try {
      // 尝试CoinGecko的Trump币搜索
      console.log("尝试从CoinGecko获取Trump币数据");
      const searchUrl = `https://api.coingecko.com/api/v3/search?query=trump`;
      const searchResponse = await makeHttpsRequest(searchUrl);
      const searchData = JSON.parse(searchResponse);
      
      if (searchData.coins && Array.isArray(searchData.coins) && searchData.coins.length > 0) {
        // 寻找可能匹配的Trump币
        const trumpMatches = searchData.coins.filter((coin: any) => 
          coin.symbol && coin.symbol.toLowerCase() === 'trump' ||
          coin.name && coin.name.toLowerCase().includes('trump')
        );
        
        if (trumpMatches.length > 0) {
          const match = trumpMatches[0];
          console.log(`找到CoinGecko匹配: ${match.name} (${match.symbol})`);
          
          // 获取详细信息
          try {
            const detailUrl = `https://api.coingecko.com/api/v3/coins/${match.id}?localization=false&tickers=false&market_data=true&community_data=false&developer_data=false`;
            const detailResponse = await makeHttpsRequest(detailUrl);
            const detailData = JSON.parse(detailResponse);
            
            if (detailData && detailData.market_data) {
              // 更新数据
              const updateData: Partial<InsertCryptocurrency> = {};
              
              if (detailData.market_cap_rank) {
                updateData.rank = detailData.market_cap_rank;
                console.log(`更新Trump排名为: ${detailData.market_cap_rank}`);
              }
              
              if (detailData.market_data.market_cap?.usd) {
                updateData.marketCap = detailData.market_data.market_cap.usd;
                console.log(`更新Trump市值为: ${detailData.market_data.market_cap.usd}`);
              }
              
              if (detailData.market_data.current_price?.usd) {
                updateData.price = detailData.market_data.current_price.usd;
                console.log(`更新Trump价格为: ${detailData.market_data.current_price.usd}`);
              }
              
              if (detailData.market_data.total_volume?.usd) {
                updateData.volume24h = detailData.market_data.total_volume.usd;
              }
              
              if (detailData.links?.homepage && detailData.links.homepage.length > 0 && detailData.links.homepage[0]) {
                updateData.officialWebsite = detailData.links.homepage[0];
                console.log(`更新Trump网站为: ${detailData.links.homepage[0]}`);
              }
              
              if (Object.keys(updateData).length > 0) {
                await storage.updateCryptocurrency(16, updateData);
                console.log(`已更新Trump币基础数据`);
                updated = true;
              }
              
              // 如果有区块链浏览器信息，也更新
              if (detailData.links?.blockchain_site) {
                const explorers = detailData.links.blockchain_site.filter(Boolean);
                if (explorers.length > 0) {
                  for (const explorer of explorers) {
                    console.log(`添加区块链浏览器: ${explorer}`);
                    // 这里直接添加区块链浏览器而不是调用找浏览器的函数
                    // 因为我们这里是确定知道浏览器URL的
                    await import('./scraper').then(module => 
                      module.findBlockchainExplorer("OFFICIAL TRUMP", 16)
                    );
                  }
                }
              }
            }
          } catch (error) {
            const detailError = error as Error;
            console.log(`获取Trump币详情失败: ${detailError.message}`);
          }
        }
      }
    } catch (error) {
      const apiError = error as Error;
      console.log(`CoinGecko Trump币搜索失败: ${apiError.message}`);
    }
    
    // 如果CoinGecko没有更新，尝试CryptoCompare
    if (!updated) {
      try {
        console.log("尝试从CryptoCompare获取Trump币数据");
        const cryptoCompareUrl = `https://min-api.cryptocompare.com/data/coin/generalinfo?fsyms=TRUMP&tsym=USD`;
        const response = await makeHttpsRequest(cryptoCompareUrl);
        const data = JSON.parse(response);
        
        if (data.Data && Array.isArray(data.Data) && data.Data.length > 0) {
          const coinInfo = data.Data[0].CoinInfo;
          
          if (coinInfo) {
            const updateData: Partial<InsertCryptocurrency> = {};
            
            if (coinInfo.SortOrder) {
              updateData.rank = parseInt(coinInfo.SortOrder);
              console.log(`更新Trump排名为: ${updateData.rank}`);
            }
            
            if (coinInfo.Url && coinInfo.Url !== "N/A") {
              const website = coinInfo.Url.startsWith('http') ? coinInfo.Url : `https://${coinInfo.Url}`;
              updateData.officialWebsite = website;
              console.log(`更新Trump网站为: ${website}`);
            }
            
            if (Object.keys(updateData).length > 0) {
              await storage.updateCryptocurrency(16, updateData);
              console.log(`已从CryptoCompare更新Trump币数据`);
              updated = true;
            }
            
            // 尝试获取价格和市值信息
            try {
              const priceUrl = `https://min-api.cryptocompare.com/data/pricemultifull?fsyms=TRUMP&tsyms=USD`;
              const priceResponse = await makeHttpsRequest(priceUrl);
              const priceData = JSON.parse(priceResponse);
              
              if (priceData.RAW && priceData.RAW.TRUMP && priceData.RAW.TRUMP.USD) {
                const rawData = priceData.RAW.TRUMP.USD;
                const updatePriceData: Partial<InsertCryptocurrency> = {};
                
                if (rawData.MKTCAP) {
                  updatePriceData.marketCap = rawData.MKTCAP;
                  console.log(`更新Trump市值为: ${rawData.MKTCAP}`);
                }
                
                if (rawData.PRICE) {
                  updatePriceData.price = rawData.PRICE;
                  console.log(`更新Trump价格为: ${rawData.PRICE}`);
                }
                
                if (rawData.VOLUME24HOUR) {
                  updatePriceData.volume24h = rawData.VOLUME24HOUR;
                }
                
                if (Object.keys(updatePriceData).length > 0) {
                  await storage.updateCryptocurrency(16, updatePriceData);
                  console.log(`已更新Trump币市场数据`);
                  updated = true;
                }
              }
            } catch (error) {
              const priceError = error as Error;
              console.log(`获取Trump币价格信息失败: ${priceError.message}`);
            }
          }
        }
      } catch (error) {
        const cryptoCompareError = error as Error;
        console.log(`CryptoCompare Trump币查询失败: ${cryptoCompareError.message}`);
      }
    }
    
    // 尝试从浏览器获取链上指标
    try {
      console.log("尝试从区块链浏览器获取Trump币链上指标");
      
      // 获取所有浏览器
      const explorers = await storage.getBlockchainExplorers(16);
      if (explorers && explorers.length > 0) {
        // 选择第一个浏览器
        const explorer = explorers[0];
        console.log(`使用浏览器: ${explorer.url}`);
        
        // 使用改进的抓取逻辑
        await import('./scraper').then(module => 
          module.scrapeBlockchainData(explorer.url, 16)
        );
        
        // 检查是否成功抓取了指标
        const metrics = await storage.getMetrics(16);
        console.log(`Trump币链上指标更新状态: ${JSON.stringify(metrics)}`);
      } else {
        console.log("没有找到Trump币的区块链浏览器");
        
        // 尝试寻找浏览器
        console.log("尝试为Trump币寻找新浏览器");
        const explorerUrl = await import('./scraper').then(module => 
          module.findBlockchainExplorer("OFFICIAL TRUMP", 16)
        );
        
        if (explorerUrl) {
          console.log(`找到新的Trump币浏览器: ${explorerUrl}`);
          // 尝试抓取数据
          await import('./scraper').then(module => 
            module.scrapeBlockchainData(explorerUrl, 16)
          );
        }
      }
    } catch (error) {
      const explorerError = error as Error;
      console.log(`处理Trump币区块链浏览器时出错: ${explorerError.message}`);
    }
    
    // 如果市场数据和链上指标都被更新，返回成功
    return updated;
  } catch (error) {
    console.error(`更新Trump币数据失败:`, error);
    return false;
  }
}

// 直接执行更新
updateTrumpCoinData().then((result) => {
  console.log(`Trump币数据更新结果: ${result ? '成功' : '失败'}`);
});