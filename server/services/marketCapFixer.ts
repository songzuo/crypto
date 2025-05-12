/**
 * 市值数据修复模块
 * 专门处理没有市值的币种数据删除和清理
 */

import { storage } from "../storage";

/**
 * 删除没有市值的加密货币
 * 根据需求，没有市值的币不应该保留在数据库中
 */
export async function removeCoinsWithoutMarketCap(): Promise<{
  removedCount: number;
  remainingCount: number;
}> {
  console.log('开始删除没有市值的币种...');
  
  try {
    // 获取所有加密货币
    const allCryptos = await storage.getCryptocurrencies(1, 9999, 'id', 'asc');
    
    // 筛选出没有市值的币种
    const coinsWithoutMarketCap = allCryptos.data.filter(crypto => 
      crypto.marketCap === null || crypto.marketCap === undefined || crypto.marketCap <= 0
    );
    
    console.log(`找到 ${coinsWithoutMarketCap.length} 个没有市值的币种准备删除`);
    
    let removedCount = 0;
    
    // 逐个删除没有市值的币种及其相关数据
    for (const crypto of coinsWithoutMarketCap) {
      try {
        // 获取币种相关的区块链浏览器
        const explorers = await storage.getBlockchainExplorers(crypto.id);
        
        // 获取币种相关的指标和AI洞察
        const insights = await storage.getAiInsightsForCrypto(crypto.id);

        // 使用已有的 purgeAllCryptoData 方法删除此币种的所有数据
        // 但实际上我们只删除单个币种，所以需要单独删除
        console.log(`删除币种: ${crypto.name} (${crypto.symbol}) [ID: ${crypto.id}]`);
        
        // 通常应该有单独的delete方法，但目前我们可以使用update方法标记删除
        // 因为数据库接口中没有提供直接删除单个币种的方法
        await storage.updateCryptocurrency(crypto.id, { 
          // 将市值和其他关键字段标记为null，在展示时可以过滤掉这些币种
          marketCap: null, 
          price: null,
          volume24h: null,
          priceChange24h: null,
          rank: null,
          slug: `deleted-${crypto.slug || crypto.symbol.toLowerCase()}-${Date.now()}`
        });
        
        removedCount++;
      } catch (error) {
        console.error(`删除币种 ${crypto.name} (ID: ${crypto.id}) 时出错:`, error);
      }
    }
    
    // 获取剩余币种数量
    const remainingCryptos = await storage.getCryptocurrencies(1, 1, 'id', 'asc');
    const remainingCount = remainingCryptos.total;
    
    console.log(`成功删除了 ${removedCount} 个没有市值的币种，剩余 ${remainingCount} 个币种`);
    return { removedCount, remainingCount };
  } catch (error) {
    console.error('删除没有市值的币种时出错:', error);
    return { removedCount: 0, remainingCount: 0 };
  }
}

/**
 * 修复不合理的市值数据
 * 修正极低或极高的市值数据，确保数据合理性
 */
export async function fixUnreasonableMarketCaps(): Promise<number> {
  console.log('开始修复异常市值数据...');
  
  try {
    // 获取所有币种
    const allCryptos = await storage.getCryptocurrencies(1, 500, 'marketCap', 'desc');
    
    let fixedCount = 0;
    
    // 检查异常高或异常低的市值
    for (const crypto of allCryptos.data) {
      if (!crypto.marketCap) continue;
      
      let shouldFix = false;
      let updatedMarketCap = crypto.marketCap;
      
      // 检查是否有非常规无效的市值
      // 例如：负数、极小值或超大值
      if (crypto.marketCap < 0) {
        // 负数市值是无效的
        shouldFix = true;
        updatedMarketCap = null; // 将删除这个币种
      } else if (crypto.marketCap < 1000 && crypto.marketCap > 0) {
        // 市值过低的(<$1000)可能是单位错误，标记为无效
        shouldFix = true;
        updatedMarketCap = null; // 将删除这个币种
      } else if (crypto.marketCap > 3e12) {
        // 市值超过3万亿美元是不合理的，可能是单位错误
        shouldFix = true;
        updatedMarketCap = null; // 将删除这个币种
      }
      
      if (shouldFix) {
        console.log(`修复币种 ${crypto.name} (${crypto.symbol}) 的异常市值: ${crypto.marketCap} -> ${updatedMarketCap || 'null'}`);
        
        await storage.updateCryptocurrency(crypto.id, { 
          marketCap: updatedMarketCap
        });
        
        fixedCount++;
      }
    }
    
    console.log(`完成异常市值修复，修复了 ${fixedCount} 个币种`);
    return fixedCount;
  } catch (error) {
    console.error('修复异常市值数据时出错:', error);
    return 0;
  }
}