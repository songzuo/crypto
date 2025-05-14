/**
 * 手动触发爬虫脚本
 * 用于临时启动和测试各种爬虫功能
 * 不需要外部配置的依赖进入点
 */

import { storage } from "./storage";
import { searchTopCryptocurrencies, searchRankedCryptocurrencies } from "./services/cryptoSearch";
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
  console.log("正在执行 异步交易量市值比率分析 任务...");
  
  // 选择执行任务的选项：
  
  // 选项1：运行特大型爬取，尝试突破467限制
  // await searchRankedCryptocurrencies(1, 600); 
  
  // 选项2：直接从头搜索前500币
  // await searchTopCryptocurrencies(500);
  
  // 选项3：初始数据收集（与应用启动时相同）
  // await runInitialDataCollection();
  
  // 选项4：运行数据修复
  // await runDataFixer();
  
  // 选项5：删除没有市值的币种
  // await removeCoinsWithoutMarketCap();
  
  // 选项6：运行异步交易量市值比率分析 - 新增选项
  try {
    console.log("开始执行增强版异步交易量市值比率分析...");
    
    // 导入异步分析器
    const { runAsyncRatioAnalysis } = await import("./services/asyncRatioAnalyzer");
    
    // 执行分析
    const result = await runAsyncRatioAnalysis();
    
    if (result.success) {
      console.log(`异步分析成功: 创建了批次 #${result.batchId}，包含 ${result.count} 个加密货币`);
      
      // 获取最新批次的数据
      const batchData = await storage.getVolumeToMarketCapRatiosByBatchId(result.batchId || 0);
      
      // 打印前30个结果
      console.log("\n前30个高交易量市值比率的币种:");
      console.log("排名\t币种\t\t符号\t\t比率");
      console.log("---------------------------------------------");
      
      batchData.slice(0, 30).forEach((item, index) => {
        // 安全地使用volumeToMarketCapRatio并确保它是数字
        const ratio = typeof item.volumeToMarketCapRatio === 'number' ? 
          item.volumeToMarketCapRatio.toFixed(2) : 
          '0.00';
        
        // 确保名称和符号是字符串并填充
        const name = (item.name || 'Unknown').padEnd(16);
        const symbol = (item.symbol || 'N/A').padEnd(8);
        
        console.log(`${index + 1}\t${name}\t${symbol}\t${ratio}`);
      });
    } else {
      console.log(`分析失败: ${result.error}`);
    }
  } catch (error) {
    console.error("执行异步分析时出错:", error);
  }
}

// 立即执行主函数
main().catch(console.error);