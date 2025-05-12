/**
 * 加密货币数据修复与优化模块
 * 
 * 该模块提供了一系列通用的数据修复和优化功能，用于确保加密货币数据的完整性和准确性。
 * 功能包括：市值修复、排名修复、链上指标修复等。
 */

import { storage } from "../storage";
import { InsertCryptocurrency, InsertMetric } from "@shared/schema";
import * as https from 'https';
import * as cheerio from 'cheerio';

// Helper function for making HTTPS requests
function makeHttpsRequest(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const options = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      },
      timeout: 10000 // 设置超时为10秒
    };
    
    const req = https.get(url, options, (res) => {
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

    // 设置超时处理
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('请求超时'));
    });
  });
}

// 解析数字字符串，支持K, M, B, T单位
function parseNumberWithUnits(value: string): number | null {
  if (!value) return null;
  
  // 清理字符串，只保留数字、小数点和单位字符(K,M,B,T)
  const cleanedValue = value.replace(/[^0-9KMBTkmbt.]/g, '').trim();
  if (!cleanedValue) return null;
  
  // 解析数字和单位
  const match = cleanedValue.match(/^([\d.]+)([KMBTkmbt])?$/);
  if (!match) return null;
  
  let num = parseFloat(match[1]);
  const unit = match[2]?.toUpperCase();
  
  // 根据单位调整数值
  if (unit === 'K') num *= 1000;
  else if (unit === 'M') num *= 1000000;
  else if (unit === 'B') num *= 1000000000;
  else if (unit === 'T') num *= 1000000000000;
  
  return isNaN(num) ? null : num;
}

// 针对不同API优化的市值和排名修复
export async function fixMarketCapAndRankData(limit: number = 30): Promise<number> {
  console.log(`开始修复市值和排名数据（处理前${limit}名币种）...`);
  let fixedCount = 0;
  
  try {
    // 获取需要修复的币种（优先处理排名前列但数据不完整的）
    const candidates = await storage.getCryptocurrencies(1, limit, "marketCap", "desc");
    
    for (const crypto of candidates.data) {
      // 检查是否需要修复（排名为0或市值异常低）
      const needsFix = !crypto.rank || crypto.rank === 0 || crypto.rank > 1000 || !crypto.marketCap;
      
      if (needsFix) {
        console.log(`尝试修复 ${crypto.name} (${crypto.symbol}) 的市值和排名信息...`);
        
        // 从多个来源获取数据
        let fixed = false;
        
        // 尝试方法1: CoinGecko
        try {
          console.log(`  尝试从CoinGecko获取${crypto.name}数据...`);
          const searchUrl = `https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(crypto.name)}`;
          const searchResponse = await makeHttpsRequest(searchUrl);
          const searchData = JSON.parse(searchResponse);
          
          if (searchData.coins && searchData.coins.length > 0) {
            // 寻找最佳匹配
            const matches = searchData.coins.filter((coin: any) => 
              (coin.symbol && coin.symbol.toLowerCase() === crypto.symbol.toLowerCase()) ||
              (coin.name && coin.name.toLowerCase().includes(crypto.name.toLowerCase()))
            );
            
            if (matches.length > 0) {
              const match = matches[0];
              console.log(`  找到CoinGecko匹配: ${match.name} (${match.symbol})`);
              
              try {
                const detailUrl = `https://api.coingecko.com/api/v3/coins/${match.id}?localization=false&tickers=false&market_data=true&community_data=false&developer_data=false`;
                const detailResponse = await makeHttpsRequest(detailUrl);
                const detailData = JSON.parse(detailResponse);
                
                if (detailData && detailData.market_data) {
                  const updateData: Partial<InsertCryptocurrency> = {};
                  
                  if (detailData.market_cap_rank) {
                    updateData.rank = detailData.market_cap_rank;
                    console.log(`  更新${crypto.name}排名为: ${detailData.market_cap_rank}`);
                  }
                  
                  if (detailData.market_data.market_cap?.usd) {
                    updateData.marketCap = detailData.market_data.market_cap.usd;
                    console.log(`  更新${crypto.name}市值为: ${detailData.market_data.market_cap.usd}`);
                  }
                  
                  if (detailData.market_data.current_price?.usd) {
                    updateData.price = detailData.market_data.current_price.usd;
                  }
                  
                  if (detailData.market_data.total_volume?.usd) {
                    updateData.volume24h = detailData.market_data.total_volume.usd;
                  }
                  
                  if (detailData.links?.homepage && detailData.links.homepage.length > 0 && detailData.links.homepage[0]) {
                    updateData.officialWebsite = detailData.links.homepage[0];
                  }
                  
                  if (Object.keys(updateData).length > 0) {
                    await storage.updateCryptocurrency(crypto.id, updateData);
                    console.log(`  已更新${crypto.name}数据`);
                    fixed = true;
                    fixedCount++;
                  }
                  
                  // 如果有区块链浏览器信息，也尝试更新
                  if (detailData.links?.blockchain_site) {
                    const explorers = detailData.links.blockchain_site.filter(Boolean);
                    if (explorers.length > 0) {
                      for (const explorer of explorers.slice(0, 2)) { // 只处理前两个避免过多
                        console.log(`  添加区块链浏览器: ${explorer}`);
                        await import('./scraper').then(module => 
                          module.findBlockchainExplorer(crypto.name, crypto.id)
                        );
                      }
                    }
                  }
                }
              } catch (error) {
                console.log(`  获取${crypto.name}详情失败: ${(error as Error).message}`);
              }
            }
          }
        } catch (error) {
          console.log(`  CoinGecko ${crypto.name}搜索失败: ${(error as Error).message}`);
        }
        
        // 如果CoinGecko没有成功，尝试方法2: CryptoCompare
        if (!fixed) {
          try {
            console.log(`  尝试从CryptoCompare获取${crypto.name}数据...`);
            const symbolOnly = crypto.symbol.replace(/[^A-Za-z0-9]/g, '');
            const cryptoCompareUrl = `https://min-api.cryptocompare.com/data/coin/generalinfo?fsyms=${symbolOnly}&tsym=USD`;
            const response = await makeHttpsRequest(cryptoCompareUrl);
            const data = JSON.parse(response);
            
            if (data.Data && Array.isArray(data.Data) && data.Data.length > 0) {
              const coinInfo = data.Data[0].CoinInfo;
              
              if (coinInfo) {
                const updateData: Partial<InsertCryptocurrency> = {};
                
                if (coinInfo.SortOrder) {
                  updateData.rank = parseInt(coinInfo.SortOrder);
                  console.log(`  更新${crypto.name}排名为: ${updateData.rank}`);
                }
                
                if (coinInfo.Url && coinInfo.Url !== "N/A") {
                  const website = coinInfo.Url.startsWith('http') ? coinInfo.Url : `https://${coinInfo.Url}`;
                  updateData.officialWebsite = website;
                  console.log(`  更新${crypto.name}网站为: ${website}`);
                }
                
                if (Object.keys(updateData).length > 0) {
                  await storage.updateCryptocurrency(crypto.id, updateData);
                  console.log(`  已从CryptoCompare更新${crypto.name}数据`);
                  fixed = true;
                  fixedCount++;
                }
                
                // 尝试获取价格和市值信息
                try {
                  const priceUrl = `https://min-api.cryptocompare.com/data/pricemultifull?fsyms=${symbolOnly}&tsyms=USD`;
                  const priceResponse = await makeHttpsRequest(priceUrl);
                  const priceData = JSON.parse(priceResponse);
                  
                  if (priceData.RAW && priceData.RAW[symbolOnly] && priceData.RAW[symbolOnly].USD) {
                    const rawData = priceData.RAW[symbolOnly].USD;
                    const updatePriceData: Partial<InsertCryptocurrency> = {};
                    
                    if (rawData.MKTCAP) {
                      updatePriceData.marketCap = rawData.MKTCAP;
                      console.log(`  更新${crypto.name}市值为: ${rawData.MKTCAP}`);
                    }
                    
                    if (rawData.PRICE) {
                      updatePriceData.price = rawData.PRICE;
                      console.log(`  更新${crypto.name}价格为: ${rawData.PRICE}`);
                    }
                    
                    if (rawData.VOLUME24HOUR) {
                      updatePriceData.volume24h = rawData.VOLUME24HOUR;
                    }
                    
                    if (Object.keys(updatePriceData).length > 0) {
                      await storage.updateCryptocurrency(crypto.id, updatePriceData);
                      console.log(`  已更新${crypto.name}市场数据`);
                      fixed = true;
                      fixedCount++;
                    }
                  }
                } catch (error) {
                  console.log(`  获取${crypto.name}价格信息失败: ${(error as Error).message}`);
                }
              }
            }
          } catch (error) {
            console.log(`  CryptoCompare ${crypto.name}查询失败: ${(error as Error).message}`);
          }
        }
        
        // 如果前两个方法都失败，尝试方法3: 直接从CoinMarketCap网站抓取
        if (!fixed) {
          try {
            console.log(`  尝试从CoinMarketCap网站直接抓取${crypto.name}数据...`);
            const slug = crypto.slug || crypto.name.toLowerCase().replace(/[^a-z0-9]/g, '-');
            const cmcUrl = `https://coinmarketcap.com/currencies/${slug}/`;
            
            const html = await makeHttpsRequest(cmcUrl);
            const $ = cheerio.load(html);
            
            const updateData: Partial<InsertCryptocurrency> = {};
            
            // 尝试提取排名
            const rankText = $('.sc-f70bb44c-0.ekGINp span').text();
            const rankMatch = rankText.match(/Rank #(\d+)/);
            if (rankMatch && rankMatch[1]) {
              const rank = parseInt(rankMatch[1]);
              if (!isNaN(rank) && rank > 0) {
                updateData.rank = rank;
                console.log(`  从CoinMarketCap抓取${crypto.name}排名为: ${rank}`);
              }
            }
            
            // 尝试提取市值
            const marketCapElement = $('dt:contains("Market cap")').next('dd');
            if (marketCapElement.length) {
              const marketCapText = marketCapElement.text().trim();
              const marketCap = parseNumberWithUnits(marketCapText);
              if (marketCap) {
                updateData.marketCap = marketCap;
                console.log(`  从CoinMarketCap抓取${crypto.name}市值为: ${marketCap}`);
              }
            }
            
            // 尝试提取价格
            const priceElement = $('.sc-ba64c6a-0.hiBlcW');
            if (priceElement.length) {
              const priceText = priceElement.text().trim();
              const price = parseFloat(priceText.replace(/[^0-9.]/g, ''));
              if (!isNaN(price)) {
                updateData.price = price;
                console.log(`  从CoinMarketCap抓取${crypto.name}价格为: ${price}`);
              }
            }
            
            // 尝试提取交易量
            const volumeElement = $('dt:contains("Volume")').next('dd');
            if (volumeElement.length) {
              const volumeText = volumeElement.text().trim();
              const volume = parseNumberWithUnits(volumeText);
              if (volume) {
                updateData.volume24h = volume;
                console.log(`  从CoinMarketCap抓取${crypto.name}交易量为: ${volume}`);
              }
            }
            
            if (Object.keys(updateData).length > 0) {
              await storage.updateCryptocurrency(crypto.id, updateData);
              console.log(`  已从CoinMarketCap网站更新${crypto.name}数据`);
              fixed = true;
              fixedCount++;
            }
          } catch (error) {
            console.log(`  从CoinMarketCap抓取${crypto.name}数据失败: ${(error as Error).message}`);
          }
        }
        
        // 如果需要，在这里可以添加更多数据来源...
        
        // 添加日志总结
        if (fixed) {
          console.log(`✓ 成功修复 ${crypto.name} 的数据`);
        } else {
          console.log(`× 未能修复 ${crypto.name} 的数据`);
        }
      }
    }
    
    console.log(`市值和排名数据修复完成。成功修复 ${fixedCount} 个币种的数据。`);
    return fixedCount;
    
  } catch (error) {
    console.error(`市值和排名数据修复过程中出错:`, error);
    return fixedCount;
  }
}

// 修复链上指标数据 - 优化版，多线程处理并按排名优先处理
export async function fixMetricsData(limit: number = 30): Promise<number> {
  console.log(`开始修复链上指标数据（多线程，排名优先）...`);
  let fixedCount = 0;
  
  try {
    // 获取有浏览器但指标数据不完整的加密货币
    const cryptosWithExplorers = await storage.getCryptocurrenciesWithExplorersNoMetrics(limit * 2); // 获取更多，便于排序
    
    if (cryptosWithExplorers.length === 0) {
      console.log("没有找到需要修复指标的加密货币");
      return 0;
    }
    
    // 获取所有这些币种的完整信息，用于排序
    const cryptoDetails: Array<{
      cryptocurrencyId: number;
      url: string;
      name: string;
      symbol: string;
      rank: number;
      marketCap: number;
    }> = [];
    
    for (const item of cryptosWithExplorers) {
      const crypto = await storage.getCryptocurrency(item.cryptocurrencyId);
      if (crypto) {
        cryptoDetails.push({
          cryptocurrencyId: item.cryptocurrencyId,
          url: item.url,
          name: crypto.name,
          symbol: crypto.symbol,
          rank: crypto.rank || 9999,
          marketCap: crypto.marketCap || 0
        });
      }
    }
    
    // 按优先级排序：
    // 1. 先处理排名较小的币种（排名越小越重要）
    // 2. 如果排名相同或不存在，按市值排序
    cryptoDetails.sort((a, b) => {
      // 特殊处理Solana币 - 最高优先级
      if (a.name === "Solana") return -1;
      if (b.name === "Solana") return 1;
      
      // 如果两个都有排名，按排名排序
      if (a.rank !== 9999 && b.rank !== 9999) {
        return a.rank - b.rank;
      }
      
      // 如果只有一个有排名，有排名的优先级更高
      if (a.rank !== 9999 && b.rank === 9999) return -1;
      if (a.rank === 9999 && b.rank !== 9999) return 1;
      
      // 都没有排名，按市值排序
      return b.marketCap - a.marketCap;
    });
    
    // 限制处理数量
    const cryptosToProcess = cryptoDetails.slice(0, limit);
    
    console.log("排序后的待处理币种（按优先级）:");
    cryptosToProcess.forEach((item, index) => {
      console.log(`${index + 1}. ${item.name} (${item.symbol}) - 排名: ${item.rank === 9999 ? '未知' : item.rank}`);
    });
    
    // 计算并行线程数 - 根据可用处理能力动态调整
    const threadCount = Math.min(5, cryptosToProcess.length); // 最多5个并行线程
    console.log(`将使用 ${threadCount} 个并行线程进行处理`);
    
    // 将币种分配到不同的线程中
    const threadsItems = Array.from({ length: threadCount }, () => []);
    cryptosToProcess.forEach((item, index) => {
      const threadIndex = index % threadCount;
      threadsItems[threadIndex].push(item);
    });
    
    // 创建并发执行的Promise数组
    const processingPromises = threadsItems.map((items, threadIndex) => 
      processMetricsBatch(items, threadIndex)
    );
    
    // 等待所有线程完成
    const results = await Promise.all(processingPromises);
    
    // 统计修复数量
    fixedCount = results.reduce((total, count) => total + count, 0);
    
    console.log(`链上指标数据修复完成。成功修复 ${fixedCount} 个币种的数据。`);
    return fixedCount;
    
  } catch (error) {
    console.error(`链上指标数据修复过程中出错:`, error);
    return fixedCount;
  }
}

// 处理一批币种的指标数据修复 - 在单个线程中执行
async function processMetricsBatch(items: any[], threadIndex: number): Promise<number> {
  let fixedCount = 0;
  
  for (const item of items) {
    console.log(`[线程 ${threadIndex + 1}] 尝试修复 ${item.name} (${item.symbol}) [排名 ${item.rank === 9999 ? 'N/A' : item.rank}] 的链上指标数据...`);
    
    try {
      // 获取当前指标（如果有的话）
      const currentMetrics = await storage.getMetrics(item.cryptocurrencyId);
      
      // 使用常规抓取器尝试获取链上数据
      await import('./scraper').then(module => 
        module.scrapeBlockchainData(item.url, item.cryptocurrencyId)
      );
      
      // 等待一小段时间，确保数据写入完成
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // 检查是否成功更新了数据
      const updatedMetrics = await storage.getMetrics(item.cryptocurrencyId);
      
      // 通过比较前后的数据，判断是否成功更新
      const hasNewData = updatedMetrics && (!currentMetrics || 
        JSON.stringify(updatedMetrics.metrics) !== JSON.stringify(currentMetrics.metrics) ||
        updatedMetrics.activeAddresses !== currentMetrics.activeAddresses ||
        updatedMetrics.totalTransactions !== currentMetrics.totalTransactions ||
        updatedMetrics.hashrate !== currentMetrics.hashrate
      );
      
      if (hasNewData) {
        console.log(`[线程 ${threadIndex + 1}] ✓ 成功更新 ${item.name} 的链上指标数据`);
        fixedCount++;
      } else {
        console.log(`[线程 ${threadIndex + 1}] - 尝试直接解析网页获取 ${item.name} 的链上指标数据...`);
        
        // 如果常规方法失败，尝试直接从网页提取关键信息
        try {
          const html = await makeHttpsRequest(item.url);
          const $ = cheerio.load(html);
          
          // 按币种类型优化指标抓取策略
          let metricsToExtract: Record<string, string[]>;
          
          // 为特定币种定制抓取策略
          if (item.name === "Solana") {
            metricsToExtract = {
              activeAddresses: ['active addresses', 'active accounts', 'unique addresses', 'accounts', 'wallets', 'holders'],
              totalTransactions: ['total transactions', 'transaction count', 'tx count', 'transactions', 'txns'],
              hashrate: ['hashrate', 'hash rate', 'network hash rate', 'total stake', 'staked sol'],
              transactionsPerSecond: ['tps', 'transactions per second', 'tx/s', 'current tps'],
              extraMetrics: [] 
            };
          } else if (item.name === "Bitcoin" || item.name === "Ethereum") {
            // 大型币种的关键指标
            metricsToExtract = {
              activeAddresses: ['active addresses', 'active accounts', 'daily active addresses', 'unique addresses', 'unique users'],
              totalTransactions: ['total transactions', 'transaction count', 'tx count', 'all transactions'],
              hashrate: ['hashrate', 'hash rate', 'network hash rate', 'mining power', 'network power'],
              transactionsPerSecond: ['tps', 'transactions per second', 'tx/s', 'network speed'],
              extraMetrics: [] 
            };
          } else {
            // 通用指标搜索模式
            metricsToExtract = {
              activeAddresses: ['active addresses', 'active accounts', 'unique addresses', 'wallet count'],
              totalTransactions: ['total transactions', 'transaction count', 'tx count', 'number of transactions'],
              hashrate: ['hashrate', 'hash rate', 'network hash rate', 'mining power', 'network power'],
              transactionsPerSecond: ['tps', 'transactions per second', 'tx/s', 'network throughput'],
              extraMetrics: [] 
            };
          }
          
          // 添加通用的区块浏览器术语
          metricsToExtract.totalBlocks = ['total blocks', 'block count', 'block height', 'blocks'];
          metricsToExtract.totalValidators = ['validators', 'validator count', 'total validators', 'nodes'];
          
          // 指标更新对象
          const metricsUpdate: Partial<InsertMetric> = {
            metrics: {} // 存储其他发现的指标
          };
          
          // 搜索页面中的数据
          $('body').find('*').each((_, element) => {
            const text = $(element).text().toLowerCase();
            
            // 检查所有可能的指标
            for (const [metricKey, searchTerms] of Object.entries(metricsToExtract)) {
              for (const term of searchTerms) {
                if (text.includes(term)) {
                  // 尝试从包含关键词的元素中提取数字
                  const parentText = $(element).parent().text().trim();
                  const numberMatch = parentText.match(/[\d,\.]+[KkMmBbTt]?/);
                  
                  if (numberMatch) {
                    // 解析数字，处理K/M/B/T单位
                    const numStr = numberMatch[0];
                    let numValue = parseNumberWithUnits(numStr) || 0;
                    
                    if (numValue > 0) {
                      // 根据指标类型更新相应字段
                      if (metricKey === 'activeAddresses') {
                        metricsUpdate.activeAddresses = numValue;
                        console.log(`[线程 ${threadIndex + 1}]   提取到活跃地址数: ${numValue}`);
                      } else if (metricKey === 'totalTransactions') {
                        metricsUpdate.totalTransactions = numValue;
                        console.log(`[线程 ${threadIndex + 1}]   提取到总交易数: ${numValue}`);
                      } else if (metricKey === 'hashrate') {
                        metricsUpdate.hashrate = numValue;
                        console.log(`[线程 ${threadIndex + 1}]   提取到算力/质押量: ${numValue}`);
                      } else if (metricKey === 'transactionsPerSecond') {
                        metricsUpdate.transactionsPerSecond = numValue;
                        console.log(`[线程 ${threadIndex + 1}]   提取到每秒交易数: ${numValue}`);
                      } else if (metricKey === 'extraMetrics') {
                        // 忽略extraMetrics
                        continue;
                      } else {
                        // 存储其他发现的指标
                        if (!metricsUpdate.metrics) metricsUpdate.metrics = {};
                        (metricsUpdate.metrics as Record<string, string>)[metricKey] = String(numValue);
                        console.log(`[线程 ${threadIndex + 1}]   提取到其他指标 ${metricKey}: ${numValue}`);
                      }
                    }
                  }
                }
              }
            }
          });
          
          // 如果找到了任何指标数据，更新数据库
          if (Object.keys(metricsUpdate).length > 1 || Object.keys(metricsUpdate.metrics || {}).length > 0) {
            if (currentMetrics) {
              // 更新现有指标
              await storage.updateMetrics(currentMetrics.id, metricsUpdate);
            } else {
              // 创建新指标记录
              const fullMetrics: InsertMetric = {
                cryptocurrencyId: item.cryptocurrencyId,
                activeAddresses: metricsUpdate.activeAddresses || null,
                totalTransactions: metricsUpdate.totalTransactions || null,
                averageTransactionValue: null,
                hashrate: metricsUpdate.hashrate || null,
                transactionsPerSecond: metricsUpdate.transactionsPerSecond || null,
                metrics: metricsUpdate.metrics || {},
              };
              await storage.createMetrics(fullMetrics);
            }
            
            console.log(`[线程 ${threadIndex + 1}] ✓ 通过直接解析网页成功更新 ${item.name} 的链上指标数据`);
            fixedCount++;
          } else {
            console.log(`[线程 ${threadIndex + 1}] × 未能从网页中提取到 ${item.name} 的有效链上指标数据`);
          }
          
        } catch (error) {
          console.log(`[线程 ${threadIndex + 1}]   直接解析网页失败: ${(error as Error).message}`);
        }
      }
      
    } catch (error) {
      console.error(`[线程 ${threadIndex + 1}] 处理币种 ${item.name} (ID: ${item.cryptocurrencyId}) 时出错:`, error);
    }
    
    // 线程间隔，避免请求过于密集
    await new Promise(resolve => setTimeout(resolve, 1000 + (Math.random() * 1000)));
  }
  
  console.log(`[线程 ${threadIndex + 1}] 完成处理，成功修复 ${fixedCount} 个币种的数据`);
  return fixedCount;
}

// 综合数据修复入口函数
export async function runDataFixer(limit: number = 30): Promise<{ marketCapFixed: number, metricsFixed: number }> {
  console.log('启动综合数据修复程序...');
  
  // 首先修复市值和排名数据
  const marketCapFixed = await fixMarketCapAndRankData(limit);
  
  // 然后修复链上指标数据
  const metricsFixed = await fixMetricsData(limit);
  
  return { marketCapFixed, metricsFixed };
}

// 在ESM环境中，不使用require.main === module检查
// 改为供调度器调用，不需要直接运行的逻辑