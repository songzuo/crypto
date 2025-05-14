/**
 * API驱动的交易量市值比率分析器
 * 直接从API获取数据，计算交易量市值比率
 */

import axios from 'axios';
import { log } from './vite';
import { storage } from './storage';
import { sleep, parseNumber } from './services/utils';
import { 
  fetch7DayAverageVolumeForMany, 
  fetchFromAllAPIs, 
  ApiCryptoData,
  fetchFromCoinMarketCapAPI,
  fetchFromCoinGeckoAPI,
  fetchFromCryptoCompareAPI,
  fetchFromCoinAPI,
  fetchFromCoinCapAPI, 
  fetchFromCoinlayerAPI
} from './services/cryptoApiAggregator';

// 稳定币列表（排除稳定币是因为它们的交易量市值比率不具有参考价值）
const STABLECOINS = new Set([
  'USDT', 'USDC', 'BUSD', 'DAI', 'TUSD', 'USDP', 'GUSD', 'USDD', 'USDK', 'SUSD',
  'LUSD', 'FRAX', 'ALUSD', 'USDN', 'OUSD', 'USDJ', 'USDX', 'HUSD', 'CUSD', 'ZUSD',
  'USDK', 'DUSD', 'FEI', 'XSGD', 'CADC', 'EURS', 'EURT', 'EUROC', 'XAUD', 'NZDS'
]);

// 主函数
async function runAPIVolumeRatioAnalysis() {
  log('开始执行基于API的交易量市值比率分析...', 'volume-ratio');
  
  try {
    // 第一步：从多个API获取前100个加密货币数据
    log('第一阶段: 从6个API源获取前100个加密货币数据...', 'volume-ratio');
    
    // 创建API获取任务
    const tasks = [
      fetchFromCoinMarketCapAPI(100),
      fetchFromCoinGeckoAPI(1, 100),
      fetchFromCryptoCompareAPI(100),
      fetchFromCoinCapAPI(100),
      fetchFromCoinAPI(100),
      fetchFromCoinlayerAPI(100)
    ];
    
    // 并行获取数据
    const results = await Promise.all(tasks);
    
    // 合并所有数据
    let allCryptos: ApiCryptoData[] = [];
    results.forEach(result => {
      allCryptos = allCryptos.concat(result);
    });
    
    // 去重（按symbol去重）
    const uniqueCryptos = new Map<string, ApiCryptoData>();
    allCryptos.forEach(crypto => {
      const symbol = crypto.symbol.toUpperCase();
      const existing = uniqueCryptos.get(symbol);
      
      if (!existing || (crypto.marketCap > existing.marketCap)) {
        uniqueCryptos.set(symbol, crypto);
      }
    });
    
    // 转换回数组
    const cryptoList = Array.from(uniqueCryptos.values());
    
    // 按市值排序
    cryptoList.sort((a, b) => b.marketCap - a.marketCap);
    
    // 获取前100个
    const top100 = cryptoList.slice(0, 100);
    
    log(`第一阶段完成: 从API获取到 ${allCryptos.length} 个币种数据，去重后有 ${cryptoList.length} 个，取前100个进行分析`, 'volume-ratio');
    
    // 第二步：排除稳定币
    const nonStablecoins = top100.filter(crypto => !STABLECOINS.has(crypto.symbol.toUpperCase()));
    
    log(`第二阶段: 排除稳定币后剩余 ${nonStablecoins.length} 个币种`, 'volume-ratio');
    
    // 第三步：获取7天平均交易量
    log('第三阶段: 获取7天平均交易量数据...', 'volume-ratio');
    
    const symbols = nonStablecoins.map(crypto => crypto.symbol);
    const volumeData = await fetch7DayAverageVolumeForMany(symbols, 3, 2000); // 每批3个，2秒延迟
    
    // 计算交易量市值比率
    const cryptosWithRatio = nonStablecoins.map(crypto => {
      const volume7d = volumeData.get(crypto.symbol) || crypto.volume24h * 7;
      const ratio = volume7d / crypto.marketCap;
      
      return {
        ...crypto,
        volume7d,
        volumeToMarketCapRatio: ratio
      };
    });
    
    // 按比率排序
    cryptosWithRatio.sort((a, b) => b.volumeToMarketCapRatio - a.volumeToMarketCapRatio);
    
    // 选出前30个
    const top30 = cryptosWithRatio.slice(0, 30);
    
    log(`第三阶段完成: 已计算出比率并选出前30个高比率币种`, 'volume-ratio');
    
    // 第四步：创建批次并存储结果
    log('第四阶段: 存储分析结果...', 'volume-ratio');
    
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
          slug: crypto.symbol.toLowerCase(),
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
        volume7d: crypto.volume7d,
        volumeToMarketCapRatio: crypto.volumeToMarketCapRatio
      });
    }
    
    log(`分析完成: 已创建批次 #${batch.id}，包含 ${top30.length} 个币种数据`, 'volume-ratio');
    return { success: true, batchId: batch.id, count: top30.length };
    
  } catch (error) {
    log(`执行API驱动的交易量市值比率分析时出错: ${error instanceof Error ? error.message : String(error)}`, 'volume-ratio');
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

// 立即运行分析
runAPIVolumeRatioAnalysis()
  .then(result => {
    if (result.success) {
      log(`API驱动的交易量市值比率分析成功完成，批次ID: ${result.batchId}，共${result.count}个币种`, 'volume-ratio');
      process.exit(0);
    } else {
      log(`API驱动的交易量市值比率分析失败: ${result.error}`, 'volume-ratio');
      process.exit(1);
    }
  })
  .catch(err => {
    log(`运行API驱动的交易量市值比率分析时发生异常: ${err.message}`, 'volume-ratio');
    process.exit(1);
  });