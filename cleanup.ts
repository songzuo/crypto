/**
 * 数据清理脚本
 * 用于清理和修复数据库中的数据
 */

import { storage } from "./server/storage";
import { removeCoinsWithoutMarketCap } from "./server/services/marketCapFixer";

async function main() {
  console.log('开始手动清理没有市值的币种...');
  
  // 获取清理前的加密货币数量
  const before = await storage.getCryptocurrencies(1, 1, 'id', 'asc');
  const beforeCount = before.total;
  console.log(`清理前数据库中有 ${beforeCount} 个加密货币`);
  
  // 执行清理
  const result = await removeCoinsWithoutMarketCap();
  console.log('清理结果：', result);
  
  // 获取清理后的加密货币数量
  const after = await storage.getCryptocurrencies(1, 1, 'id', 'asc');
  const afterCount = after.total;
  console.log(`清理后数据库中有 ${afterCount} 个加密货币`);
  console.log(`净变化: ${afterCount - beforeCount} 个加密货币`);
  
  process.exit(0);
}

// 执行主函数
main().catch(error => {
  console.error('清理脚本执行出错:', error);
  process.exit(1);
});