// 手动触发XRP的指标恢复

import { advancedMetricsRecovery } from './services/advancedMetricsRecovery';
import { storage } from './storage';

// 开始执行
async function main() {
  try {
    console.log("手动触发指标恢复，优先处理XRP...");
    
    // 先获取XRP的数据库信息
    const cryptos = await storage.getCryptocurrencies(1, 10, "rank", "asc");
    const xrp = cryptos.data.find(c => c.name === 'XRP' || c.symbol === 'XRP');
    
    if (xrp) {
      console.log(`找到XRP，ID: ${xrp.id}, 名称: ${xrp.name}, 符号: ${xrp.symbol}, 排名: ${xrp.rank}`);
      
      // 查看当前指标状态
      const beforeMetrics = await storage.getMetrics(xrp.id);
      console.log("XRP当前指标状态:", beforeMetrics);
      
      // 执行高级指标恢复
      console.log("开始XRP高级指标恢复...");
      await advancedMetricsRecovery(20);
      
      // 查看新的指标状态
      const afterMetrics = await storage.getMetrics(xrp.id);
      console.log("XRP新指标状态:", afterMetrics);
      
      console.log("XRP指标恢复完成！");
    } else {
      console.log("在前10名中未找到XRP，将处理前20个币种");
      await advancedMetricsRecovery(20);
    }
    
    process.exit(0);
  } catch (error) {
    console.error("执行出错:", error);
    process.exit(1);
  }
}

// 执行主函数
main();