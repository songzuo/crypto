/**
 * 系统守护进程
 * 
 * 这个模块负责监控和自动重启爬虫任务，确保系统持续运行
 * 即使在某些任务崩溃的情况下也能恢复运行
 */

import { setTimeout } from 'timers/promises';
import { storage } from '../storage';
import { log } from '../vite';
import { scrapeAdvancedMarketData } from './advancedMarketDataScraper';
import { searchTopCryptocurrencies } from './cryptoSearch';

// 监控配置
const HEALTH_CHECK_INTERVAL = 5 * 60 * 1000; // 5分钟检查一次
const MAX_INACTIVITY_TIME = 15 * 60 * 1000; // 15分钟无活动视为异常
const MAX_RETRIES = 3; // 最大重试次数

// 追踪上次活动时间
let lastActivityTime = Date.now();
let consecutiveFailures = 0;

/**
 * 更新活动时间
 */
export function updateActivityTime() {
  lastActivityTime = Date.now();
  consecutiveFailures = 0;
}

/**
 * 执行健康检查并在需要时重启爬虫
 */
async function performHealthCheck() {
  try {
    // 检查数据库中的爬虫状态
    const crawlerStatus = await storage.getCrawlerStatus();
    
    // 检查最后更新时间
    const currentTime = Date.now();
    const inactiveTime = currentTime - lastActivityTime;
    
    if (inactiveTime > MAX_INACTIVITY_TIME || 
        (crawlerStatus && !crawlerStatus.webCrawlerActive)) {
      log(`监测到爬虫可能已停止工作 (${inactiveTime / 60000}分钟无活动)`);
      
      // 尝试重启爬虫
      await restartCrawlers();
      consecutiveFailures++;
      
      // 如果连续多次失败，执行更彻底的恢复
      if (consecutiveFailures >= MAX_RETRIES) {
        log('多次重启失败，执行紧急恢复流程');
        await performEmergencyRecovery();
        consecutiveFailures = 0;
      }
    } else {
      log('爬虫健康检查正常');
      consecutiveFailures = 0;
    }
  } catch (error) {
    log(`健康检查失败: ${error}`);
  }
  
  // 无论结果如何，安排下一次健康检查
  setTimeout(HEALTH_CHECK_INTERVAL).then(performHealthCheck);
}

/**
 * 重启爬虫任务
 */
async function restartCrawlers() {
  try {
    log('尝试重启爬虫任务...');
    
    // 更新爬虫状态为活动状态
    await storage.updateCrawlerStatus({
      webCrawlerActive: true,
      lastUpdate: new Date()
    });
    
    // 执行紧急数据收集
    try {
      log('执行紧急数据收集...');
      const newCryptos = await scrapeAdvancedMarketData();
      log(`紧急数据收集完成，新增 ${newCryptos} 个加密货币`);
      
      // 如果高级爬虫没有添加新币种，尝试使用搜索功能
      if (newCryptos === 0) {
        log('尝试使用搜索功能添加币种...');
        await searchTopCryptocurrencies(100);
      }
    } catch (error) {
      log(`紧急数据收集失败: ${error}`);
    }
    
    updateActivityTime();
    log('爬虫任务已重启');
    
    return true;
  } catch (error) {
    log(`重启爬虫失败: ${error}`);
    return false;
  }
}

/**
 * 执行紧急恢复流程
 */
async function performEmergencyRecovery() {
  try {
    log('执行紧急恢复流程...');
    
    // 获取当前加密货币数量
    const currentCryptos = await storage.getCryptocurrencies(1, 1, 'id', 'asc');
    const totalCount = currentCryptos.total || 0;
    
    log(`当前数据库中有 ${totalCount} 个加密货币`);
    
    // 如果不到500个币种，尝试添加更多
    if (totalCount < 500) {
      log('尝试添加更多币种以达到500个...');
      
      // 尝试搜索更多币种
      await searchTopCryptocurrencies(500 - totalCount);
      
      // 尝试高级爬取
      await scrapeAdvancedMarketData();
    }
    
    // 重置系统状态
    await storage.updateCrawlerStatus({
      webCrawlerActive: true,
      aiProcessorActive: true,
      lastUpdate: new Date()
    });
    
    updateActivityTime();
    log('紧急恢复流程完成');
    
    return true;
  } catch (error) {
    log(`紧急恢复流程失败: ${error}`);
    return false;
  }
}

/**
 * 启动守护进程
 */
export function startWatchdog() {
  log('启动系统守护进程...');
  updateActivityTime();
  
  // 立即启动健康检查循环
  performHealthCheck();
}