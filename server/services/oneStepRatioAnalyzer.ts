/**
 * 一步式交易量市值比率分析器
 * 通过单次API请求获取所有必要数据，减少请求次数，降低速率限制风险
 */

import axios from 'axios';
import { log } from '../vite';
import { storage } from '../storage';
import { sleep } from './utils';

// 稳定币列表
const STABLECOINS = new Set([
  'USDT', 'USDC', 'BUSD', 'DAI', 'TUSD', 'USDP', 'GUSD', 'USDD', 'USDK', 'SUSD',
  'LUSD', 'FRAX', 'ALUSD', 'USDN', 'OUSD', 'USDJ', 'USDX', 'HUSD', 'CUSD', 'ZUSD',
  'USDK', 'DUSD', 'FEI', 'XSGD', 'CADC', 'EURS', 'EURT', 'EUROC', 'XAUD', 'NZDS'
]);

// 加密货币数据接口
interface CryptoData {
  id?: number;          // 数据库中的ID
  coinId?: string;      // API中的唯一标识符
  symbol: string;       // 币种符号
  name: string;         // 币种名称
  marketCap: number;    // 市值
  price: number;        // 价格
  volume24h: number;    // 24小时交易量
  volume7d?: number;    // 7天交易量（如果可用）
  slug?: string;        // URL友好的名称
  volumeToMarketCapRatio?: number; // 计算得出的比率
}

/**
 * 从CoinMarketCap API一次性获取全部数据
 * @returns 加密货币数据数组
 */
async function fetchAllFromCoinMarketCap(): Promise<CryptoData[]> {
  try {
    log('从CoinMarketCap一次性获取排名靠前的加密货币数据（含七日交易量）...', 'ratio-analyzer');
    
    // 获取前1000个币种（可根据需要调整数量）
    const response = await axios.get(`https://pro-api.coinmarketcap.com/v1/cryptocurrency/listings/latest`, {
      headers: {
        'X-CMC_PRO_API_KEY': process.env.COINMARKETCAP_API_KEY || '',
      },
      params: {
        start: 1,
        limit: 1000,  // 获取前1000个币种
        convert: 'USD',
        sort: 'market_cap', 
        sort_dir: 'desc'
      }
    });
    
    if (!response.data || !response.data.data) {
      return [];
    }
    
    // 处理响应数据
    const cryptos: CryptoData[] = response.data.data.map((coin: any) => {
      const volume24h = coin.quote.USD.volume_24h || 0;
      
      return {
        coinId: coin.id.toString(),
        symbol: coin.symbol,
        name: coin.name,
        marketCap: coin.quote.USD.market_cap || 0,
        price: coin.quote.USD.price || 0,
        volume24h: volume24h,
        volume7d: volume24h * 7, // CoinMarketCap直接提供的是24小时交易量，乘以7作为近似
        slug: coin.slug
      };
    });
    
    log(`从CoinMarketCap一次性获取到${cryptos.length}个币种数据`, 'ratio-analyzer');
    return cryptos;
    
  } catch (error) {
    log(`从CoinMarketCap一次性获取数据时出错: ${error instanceof Error ? error.message : String(error)}`, 'ratio-analyzer');
    return [];
  }
}

/**
 * 从CryptoCompare API一次性获取全部数据
 * @returns 加密货币数据数组
 */
async function fetchAllFromCryptoCompare(): Promise<CryptoData[]> {
  try {
    log('从CryptoCompare一次性获取排名靠前的加密货币数据（含七日交易量）...', 'ratio-analyzer');
    
    // 获取前1000个币种数据
    const response = await axios.get('https://min-api.cryptocompare.com/data/top/mktcapfull', {
      params: {
        limit: 1000,
        tsym: 'USD',
        page: 0
      },
      headers: {
        'Authorization': `Apikey ${process.env.CRYPTOCOMPARE_API_KEY || ''}`
      }
    });
    
    if (!response.data || !response.data.Data || !Array.isArray(response.data.Data)) {
      return [];
    }
    
    // 处理响应数据
    const cryptos: CryptoData[] = [];
    for (const item of response.data.Data) {
      const coinInfo = item.CoinInfo || {};
      const raw = item.RAW && item.RAW.USD ? item.RAW.USD : {};
      
      // 获取7天历史交易量数据
      try {
        const historyResponse = await axios.get(`https://min-api.cryptocompare.com/data/v2/histoday`, {
          params: {
            fsym: coinInfo.Name,
            tsym: 'USD',
            limit: 7,
            aggregate: 1
          },
          headers: {
            'Authorization': `Apikey ${process.env.CRYPTOCOMPARE_API_KEY || ''}`
          }
        });
        
        let volume7d = 0;
        if (historyResponse.data && 
            historyResponse.data.Data && 
            historyResponse.data.Data.Data && 
            Array.isArray(historyResponse.data.Data.Data)) {
          
          // 计算7天交易量总和
          volume7d = historyResponse.data.Data.Data.reduce((sum: number, day: any) => {
            return sum + (day.volumeto || 0);
          }, 0);
        } else {
          // 如果历史数据不可用，使用24小时交易量乘以7作为近似值
          volume7d = (raw.VOLUME24HOUR || 0) * 7;
        }
        
        cryptos.push({
          coinId: coinInfo.Id?.toString(),
          symbol: coinInfo.Name || '',
          name: coinInfo.FullName || coinInfo.Name || '',
          marketCap: raw.MKTCAP || 0,
          price: raw.PRICE || 0,
          volume24h: raw.VOLUME24HOUR || 0,
          volume7d: volume7d,
          slug: coinInfo.Name?.toLowerCase() || ''
        });
        
        // 添加短暂延迟以避免触发速率限制
        await sleep(50);
        
      } catch (historyError) {
        // 如果获取历史数据失败，仍然添加币种但使用24小时交易量近似值
        cryptos.push({
          coinId: coinInfo.Id?.toString(),
          symbol: coinInfo.Name || '',
          name: coinInfo.FullName || coinInfo.Name || '',
          marketCap: raw.MKTCAP || 0,
          price: raw.PRICE || 0,
          volume24h: raw.VOLUME24HOUR || 0,
          volume7d: (raw.VOLUME24HOUR || 0) * 7,
          slug: coinInfo.Name?.toLowerCase() || ''
        });
      }
    }
    
    log(`从CryptoCompare一次性获取到${cryptos.length}个币种数据`, 'ratio-analyzer');
    return cryptos;
    
  } catch (error) {
    log(`从CryptoCompare一次性获取数据时出错: ${error instanceof Error ? error.message : String(error)}`, 'ratio-analyzer');
    return [];
  }
}

/**
 * 合并多个来源的数据，保留更高质量的数据
 */
function mergeData(datasets: CryptoData[][]): CryptoData[] {
  // 按symbol为键创建映射
  const cryptoMap = new Map<string, CryptoData>();
  
  // 遍历所有数据集
  datasets.forEach(dataset => {
    dataset.forEach(crypto => {
      const symbol = crypto.symbol.toUpperCase();
      const existing = cryptoMap.get(symbol);
      
      // 保留更有价值的数据（有市值的优先）
      if (!existing || (crypto.marketCap > 0 && (existing.marketCap === 0 || crypto.marketCap > existing.marketCap))) {
        cryptoMap.set(symbol, crypto);
      }
    });
  });
  
  // 转换回数组
  return Array.from(cryptoMap.values());
}

/**
 * 一步式交易量市值比率分析
 * 一次性获取所有数据，减少API请求次数
 */
export async function runOneStepRatioAnalysis(): Promise<{ success: boolean, batchId?: number, count?: number, error?: string }> {
  log('开始执行一步式交易量市值比率分析...', 'ratio-analyzer');
  
  try {
    // 第一步：并行获取数据
    log('第一阶段: 从多个API源一次性获取全部数据...', 'ratio-analyzer');
    
    const [cmcData, ccData] = await Promise.all([
      fetchAllFromCoinMarketCap(),
      fetchAllFromCryptoCompare()
    ]);
    
    // 合并数据
    const allData = mergeData([cmcData, ccData]);
    
    log(`一次性获取并合并了${allData.length}个币种数据`, 'ratio-analyzer');
    
    // 第二步：排除稳定币并计算比率
    const nonStablecoins = allData.filter(crypto => 
      !STABLECOINS.has(crypto.symbol.toUpperCase()) && 
      crypto.marketCap > 0 && 
      (crypto.volume24h > 0 || crypto.volume7d > 0)
    );
    
    log(`排除稳定币后剩余${nonStablecoins.length}个币种数据`, 'ratio-analyzer');
    
    // 计算交易量市值比率 - 使用日均交易量而非7天总量
    const cryptosWithRatio = nonStablecoins.map(crypto => {
      const volume7d = crypto.volume7d || crypto.volume24h * 7;
      // 计算日均交易量（取7日平均或24小时量）
      const dailyAvgVolume = crypto.volume24h || (volume7d / 7);
      // 使用日均交易量除以市值计算正确的比率
      const ratio = dailyAvgVolume / crypto.marketCap;
      
      return {
        ...crypto,
        volumeToMarketCapRatio: ratio
      };
    });
    
    // 按比率排序
    cryptosWithRatio.sort((a, b) => (b.volumeToMarketCapRatio || 0) - (a.volumeToMarketCapRatio || 0));
    
    // 选出前30个
    const top30 = cryptosWithRatio.slice(0, 30);
    
    log(`已计算比率并选出前30个高比率币种`, 'ratio-analyzer');
    
    // 第三步：存储结果
    log('第二阶段: 存储分析结果...', 'ratio-analyzer');
    
    // 创建批次记录
    const batch = await storage.createVolumeToMarketCapBatch({
      entriesCount: top30.length,
      hasChanges: true
    });
    
    // 存储每个币种的比率数据
    for (const crypto of top30) {
      // 查找或创建加密货币记录，确保有cryptocurrencyId
      let cryptoId = 0;
      
      // 尝试通过符号查找现有记录
      const existingCryptos = await storage.searchCryptocurrencies(crypto.symbol);
      if (existingCryptos.length > 0) {
        // 使用现有的cryptocurrencyId
        cryptoId = existingCryptos[0].id;
      } else {
        // 如果找不到，创建一个新记录
        const newCrypto = await storage.createCryptocurrency({
          symbol: crypto.symbol,
          name: crypto.name,
          slug: crypto.slug || crypto.symbol.toLowerCase(),
          marketCap: crypto.marketCap,
          price: crypto.price,
          volume24h: crypto.volume24h,
          rank: 0  // 未知排名
        });
        cryptoId = newCrypto.id;
      }
      
      // 存储比率数据
      await storage.createVolumeToMarketCapRatio({
        batchId: batch.id,
        cryptocurrencyId: cryptoId,
        symbol: crypto.symbol,
        name: crypto.name,
        marketCap: crypto.marketCap,
        volume7d: crypto.volume7d || crypto.volume24h * 7,
        volumeToMarketCapRatio: crypto.volumeToMarketCapRatio || 0
      });
    }
    
    log(`分析完成: 已创建批次 #${batch.id}，包含 ${top30.length} 个币种数据`, 'ratio-analyzer');
    return { success: true, batchId: batch.id, count: top30.length };
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log(`执行一步式交易量市值比率分析时出错: ${errorMessage}`, 'ratio-analyzer');
    return { success: false, error: errorMessage };
  }
}