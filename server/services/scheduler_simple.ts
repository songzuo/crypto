import { storage } from '../storage';

// 简化的调度器 - 只包含必要的功能，禁用所有定时任务
export async function runInitialDataCollection() {
  console.log('🚀 运行简化的初始数据收集...');
  
  try {
    // 检查现有数据
    const existingData = await storage.getCryptocurrencies(1, 1, 'id', 'asc');
    await storage.updateCrawlerStatus({
      webCrawlerActive: true,
      lastUpdate: new Date()
    });
    
    if (existingData.total > 0) {
      console.log(`✅ 找到 ${existingData.total} 个现有加密货币。系统已准备就绪。`);
      console.log('💡 提示：可通过API手动触发数据更新');
    } else {
      console.log('📊 数据库为空，建议通过API手动添加初始数据');
    }
    
    return true;
  } catch (error) {
    console.error('初始数据收集失败:', error);
    return false;
  }
}

export async function setupScheduler() {
  console.log('🚀 设置简化调度器...');
  
  // 运行初始数据收集
  await runInitialDataCollection();
  
  // 禁用所有定时任务以提升性能
  console.log('🚀 所有定时任务已禁用，系统将以高性能模式运行');
  console.log('💡 可通过以下API手动触发任务:');
  console.log('   - POST /api/news/scrape - 新闻抓取');
  console.log('   - POST /api/market/scrape - 市场数据抓取');
  console.log('   - POST /api/analysis/volume-ratio - 交易量市值比率分析');
  
  console.log('✅ 简化调度器设置完成');
  return true;
}

// 导出空的调度器对象以保持兼容性
export const scheduler = {
  getCachedTrendsAnalysis: () => null
};
