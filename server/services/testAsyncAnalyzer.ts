/**
 * 测试异步交易量市值比率分析器
 */

import { runAsyncRatioAnalysis } from './asyncRatioAnalyzer';

async function main() {
  console.log('开始测试异步交易量市值比率分析器...');
  
  try {
    const result = await runAsyncRatioAnalysis();
    
    if (result.success) {
      console.log(`测试成功! 已创建批次 #${result.batchId}，共${result.count}个币种数据`);
    } else {
      console.error(`测试失败: ${result.error}`);
    }
  } catch (error) {
    console.error('测试异步分析器时出错:', error);
  }
  
  console.log('测试完成');
}

main().catch(console.error);