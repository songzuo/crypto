/**
 * 手动触发爬虫脚本
 * 用于临时启动和测试各种爬虫功能
 * 不需要外部配置的依赖进入点
 */

import { storage } from "./storage";
import { scrapeTopCryptocurrencies } from "./services/cryptoSearch";
import { searchRankedCryptocurrencies } from "./services/cryptoSearch";
import { setupScheduler, runInitialDataCollection } from "./services/scheduler";
import { fixMarketCapAndRankData, fixMetricsData, runDataFixer } from "./services/dataFixer";
import { removeCoinsWithoutMarketCap } from "./services/marketCapFixer";

async function main() {
  console.log(`
================================
 手动加密货币抓取触发器 v1.0
================================

开始执行手动触发任务...
`);

  try {
    // 1. 检查当前数据库中的加密货币数量
    const currentCryptos = await storage.getCryptocurrencies(1, 1, 'id', 'asc');
    const totalCount = currentCryptos.total || 0;
    
    console.log(`当前数据库中有 ${totalCount} 个加密货币`);
    
    // 2. 执行所需的任务
    await executeTask();
    
    // 3. 再次检查数据库中的加密货币数量
    const afterCryptos = await storage.getCryptocurrencies(1, 1, 'id', 'asc');
    const afterCount = afterCryptos.total || 0;
    
    console.log(`
任务完成。
当前数据库中有 ${afterCount} 个加密货币（之前：${totalCount}）。
净变化：${afterCount - totalCount} 个加密货币。
`);
    
  } catch (error) {
    console.error("执行过程中出错:", error);
  }
  
  // 退出程序
  process.exit(0);
}

// 你可以修改这个函数来执行不同的任务
async function executeTask() {
  console.log("正在执行 突破性爬取 任务...");
  
  // 选择执行任务的选项：
  
  // 选项1：运行特大型爬取，尝试突破467限制
  // await searchRankedCryptocurrencies(1, 600); 
  
  // 选项2：直接从头搜索前500币
  await scrapeTopCryptocurrencies(500);
  
  // 选项3：初始数据收集（与应用启动时相同）
  // await runInitialDataCollection();
  
  // 选项4：运行数据修复
  // await runDataFixer();
  
  // 选项5：删除没有市值的币种
  // await removeCoinsWithoutMarketCap();
}

// 立即执行主函数
main().catch(console.error);