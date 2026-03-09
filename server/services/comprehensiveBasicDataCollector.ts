/**
 * 综合基础数据采集器
 * 
 * 一次性采集所有基础数据项，支持进度显示和状态跟踪
 * 数据来源：
 * - CoinMarketCap/CoinGecko：基础数据
 * - Glassnode/Santiment：链上数据分析
 * - DeFiLlama：DeFi项目TVL和收入数据
 * - GitHub：开发者活动数据
 * - Messari：综合项目研究报告
 */

import axios from 'axios';
import { db } from '../db';
import { cryptocurrencies, cryptoBasicData } from '@shared/schema';
import { eq } from 'drizzle-orm';

// 创建带重试机制的axios实例
const axiosWithRetry = axios.create({
  timeout: 30000, // 增加超时时间到30秒
  headers: {
    'Accept': 'application/json',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
  }
});

// 重试机制
async function requestWithRetry(url: string, maxRetries: number = 3, delay: number = 1000) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await axiosWithRetry.get(url);
      return response;
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      console.log(`请求失败，${delay}ms后重试 (${i + 1}/${maxRetries}): ${url}`);
      await new Promise(resolve => setTimeout(resolve, delay));
      delay *= 2; // 指数退避
    }
  }
}

// 数据项采集状态
interface DataItemStatus {
  name: string;
  status: 'pending' | 'success' | 'failed' | 'skipped';
  source?: string;
  error?: string;
  value?: any;
}

// 单个加密货币的采集详情
interface CoinCollectionDetails {
  symbol: string;
  name: string;
  totalItems: number;
  successItems: number;
  failedItems: number;
  skippedItems: number;
  dataItems: DataItemStatus[];
  startTime: Date;
  endTime?: Date;
  duration?: number; // 毫秒
}

// 采集进度状态
interface CollectionProgress {
  status: 'idle' | 'running' | 'completed' | 'error';
  currentStep: string;
  progress: number; // 0-100
  totalCoins: number;
  processedCoins: number;
  currentCoin?: string;
  errors: string[];
  startTime?: Date;
  endTime?: Date;
  // 新增详细跟踪
  coinDetails: CoinCollectionDetails[];
  currentCoinDetails?: CoinCollectionDetails;
  totalDataItems: number;
  successDataItems: number;
  failedDataItems: number;
}

// 全局进度状态
let collectionProgress: CollectionProgress = {
  status: 'idle',
  currentStep: '准备就绪',
  progress: 0,
  totalCoins: 0,
  processedCoins: 0,
  errors: [],
  coinDetails: [],
  totalDataItems: 0,
  successDataItems: 0,
  failedDataItems: 0
};

// 数据源配置
const DATA_SOURCES = {
  COINMARKETCAP: {
    name: 'CoinMarketCap',
    baseUrl: 'https://pro-api.coinmarketcap.com/v1',
    apiKey: 'b7473e43-0c05-46a7-b82e-726a04985baa',
    endpoints: {
      listings: '/cryptocurrency/listings/latest',
      quotes: '/cryptocurrency/quotes/latest',
      metrics: '/cryptocurrency/quotes/historical'
    }
  },
  COINGECKO: {
    name: 'CoinGecko',
    baseUrl: 'https://api.coingecko.com/api/v3',
    endpoints: {
      markets: '/coins/markets',
      coin: '/coins/{id}',
      history: '/coins/{id}/market_chart'
    }
  },
  GLASSNODE: {
    name: 'Glassnode',
    baseUrl: 'https://api.glassnode.com/v1',
    apiKey: process.env.GLASSNODE_API_KEY,
    endpoints: {
      metrics: '/metrics'
    }
  },
  SANTIMENT: {
    name: 'Santiment',
    baseUrl: 'https://api.santiment.net',
    apiKey: process.env.SANTIMENT_API_KEY,
    endpoints: {
      metrics: '/metrics'
    }
  },
  DEFILLAMA: {
    name: 'DeFiLlama',
    baseUrl: 'https://api.llama.fi',
    endpoints: {
      protocols: '/protocols',
      tokens: '/tokens'
    }
  }
};

/**
 * 获取采集进度
 */
export function getCollectionProgress(): CollectionProgress {
  return collectionProgress;
}

/**
 * 开始综合基础数据采集
 */
export async function startComprehensiveCollection(): Promise<{
  success: boolean;
  message: string;
  progressId?: string;
}> {
  if (collectionProgress.status === 'running') {
    return {
      success: false,
      message: '采集正在进行中，请等待完成'
    };
  }

  try {
    // 重置进度状态
    collectionProgress = {
      status: 'running',
      currentStep: '初始化采集器',
      progress: 0,
      totalCoins: 0,
      processedCoins: 0,
      errors: [],
      coinDetails: [],
      totalDataItems: 0,
      successDataItems: 0,
      failedDataItems: 0,
      startTime: new Date()
    };

    console.log('🚀 开始综合基础数据采集...');
    
    // 获取所有加密货币列表
    collectionProgress.currentStep = '获取加密货币列表';
    const coins = await getAllCryptocurrencies();
    
    if (coins.length === 0) {
      throw new Error('没有找到任何加密货币数据，请先运行数据采集');
    }
    
    collectionProgress.totalCoins = coins.length;
    console.log(`📊 找到 ${coins.length} 个加密货币，开始采集基础数据...`);

    // 分批处理加密货币
    const batchSize = 10;
    for (let i = 0; i < coins.length; i += batchSize) {
      const batch = coins.slice(i, i + batchSize);
      
      // 并行处理批次
      await Promise.allSettled(
        batch.map(coin => collectBasicDataForCoin(coin))
      );
      
      collectionProgress.processedCoins = Math.min(i + batchSize, coins.length);
      collectionProgress.progress = Math.round((collectionProgress.processedCoins / collectionProgress.totalCoins) * 100);
      
      console.log(`📈 进度: ${collectionProgress.processedCoins}/${collectionProgress.totalCoins} (${collectionProgress.progress}%)`);
    }

    collectionProgress.status = 'completed';
    collectionProgress.endTime = new Date();
    collectionProgress.currentStep = '采集完成';
    collectionProgress.progress = 100;

    console.log('✅ 综合基础数据采集完成');
    return {
      success: true,
      message: `成功采集 ${collectionProgress.processedCoins} 个加密货币的基础数据`
    };

  } catch (error) {
    collectionProgress.status = 'error';
    collectionProgress.currentStep = '采集失败';
    collectionProgress.errors.push(error.message);
    
    console.error('❌ 综合基础数据采集失败:', error);
    return {
      success: false,
      message: `采集失败: ${error.message}`
    };
  }
}

/**
 * 获取所有加密货币列表
 */
async function getAllCryptocurrencies(): Promise<any[]> {
  try {
    console.log('正在获取加密货币列表...');
    const coins = await db.select().from(cryptocurrencies)
      .orderBy(cryptocurrencies.rank);
      // 移除限制，采集所有加密货币
    
    console.log(`成功获取 ${coins.length} 个加密货币`);
    return coins;
  } catch (error) {
    console.error('获取加密货币列表失败:', error);
    console.error('错误详情:', error.message);
    return [];
  }
}

/**
 * 为单个加密货币采集基础数据
 */
async function collectBasicDataForCoin(coin: any): Promise<void> {
  const startTime = new Date();
  const coinDetails: CoinCollectionDetails = {
    symbol: coin.symbol,
    name: coin.name,
    totalItems: 0,
    successItems: 0,
    failedItems: 0,
    skippedItems: 0,
    dataItems: [],
    startTime: startTime
  };

  try {
    collectionProgress.currentCoin = coin.symbol;
    collectionProgress.currentCoinDetails = coinDetails;
    
    // 定义所有需要采集的数据项
    const dataItems = [
      // 价格变化数据
      { name: 'priceChange7d', source: 'CoinMarketCap' },
      { name: 'priceChange30d', source: 'CoinMarketCap' },
      { name: 'priceChange60d', source: 'CoinMarketCap' },
      { name: 'priceChange90d', source: 'CoinMarketCap' },
      { name: 'priceChange180d', source: 'CoinGecko' },
      { name: 'priceChange1y', source: 'CoinGecko' },
      
      // 供应量数据
      { name: 'circulatingSupply', source: 'CoinMarketCap' },
      { name: 'totalSupply', source: 'CoinMarketCap' },
      { name: 'circulatingToTotalRatio', source: 'calculated' },
      
      // 市值和交易量比率
      { name: 'volumeToMarketCapRatio', source: 'calculated' },
      { name: 'marketCapToFDV', source: 'calculated' },
      
      // 交易深度数据
      { name: 'orderBookDepth', source: 'external' },
      { name: 'bidAskSpread', source: 'external' },
      { name: 'slippageCost', source: 'external' },
      
      // 交易质量数据
      { name: 'realVolumeRatio', source: 'external' },
      { name: 'top10ExchangeVolume', source: 'external' },
      
      // 经济指标
      { name: 'annualInflationRate', source: 'external' },
      { name: 'lockedRatio', source: 'external' },
      
      // 持有分布
      { name: 'top10AddressConcentration', source: 'onchain' },
      { name: 'retailHoldingRatio', source: 'onchain' },
      
      // 链上活动
      { name: 'dailyActiveAddresses', source: 'onchain' },
      { name: 'dailyTransactions', source: 'onchain' },
      { name: 'dailyGasCost', source: 'onchain' },
      
      // 开发活动
      { name: 'monthlyCommits', source: 'github' },
      { name: 'developerCount', source: 'github' },
      { name: 'dependentProjects', source: 'github' },
      
      // 财务指标
      { name: 'priceToSalesRatio', source: 'CoinGecko' },
      
      // 社交媒体活跃度
      { name: 'twitterEngagementRate', source: 'social' },
      { name: 'discordTelegramActivity', source: 'social' },
      { name: 'developerForumActivity', source: 'social' }
    ];

    coinDetails.totalItems = dataItems.length;
    collectionProgress.totalDataItems += dataItems.length;

    // 初始化数据项状态
    dataItems.forEach(item => {
      coinDetails.dataItems.push({
        name: item.name,
        status: 'pending',
        source: item.source
      });
    });

    console.log(`开始采集 ${coin.symbol} 的 ${dataItems.length} 个数据项...`);
    
    // 从多个数据源采集数据
    const basicData = await collectFromAllSourcesWithTracking(coin, coinDetails);
    
    // 保存到数据库
    await saveBasicDataToDatabase(coin.id, basicData);
    
    coinDetails.endTime = new Date();
    coinDetails.duration = coinDetails.endTime.getTime() - coinDetails.startTime.getTime();
    
    console.log(`✅ ${coin.symbol} 采集完成: ${coinDetails.successItems}/${coinDetails.totalItems} 成功, ${coinDetails.failedItems} 失败, ${coinDetails.skippedItems} 跳过`);
    
  } catch (error) {
    console.error(`❌ 采集 ${coin.symbol} 基础数据失败:`, error);
    collectionProgress.errors.push(`${coin.symbol}: ${error.message}`);
    
    coinDetails.endTime = new Date();
    coinDetails.duration = coinDetails.endTime.getTime() - coinDetails.startTime.getTime();
  } finally {
    // 更新统计
    collectionProgress.successDataItems += coinDetails.successItems;
    collectionProgress.failedDataItems += coinDetails.failedItems;
    collectionProgress.coinDetails.push(coinDetails);
    collectionProgress.currentCoinDetails = undefined;
  }
}

/**
 * 从所有数据源采集数据（带跟踪）
 */
async function collectFromAllSourcesWithTracking(coin: any, coinDetails: CoinCollectionDetails): Promise<any> {
  const basicData: any = {
    cryptocurrencyId: coin.id,
    dataSource: 'comprehensive_collection',
    lastUpdated: new Date()
  };

  try {
    // 1. 从CoinMarketCap获取基础数据
    const cmcData = await collectFromCoinMarketCapWithTracking(coin.symbol, coinDetails);
    Object.assign(basicData, cmcData);

    // 2. 从CoinGecko获取补充数据
    const cgData = await collectFromCoinGeckoWithTracking(coin.symbol, coinDetails);
    Object.assign(basicData, cgData);

    // 3. 从链上数据源获取链上指标
    const onChainData = await collectOnChainDataWithTracking(coin.symbol, coinDetails);
    Object.assign(basicData, onChainData);

    // 4. 从GitHub获取开发数据
    const devData = await collectDeveloperDataWithTracking(coin.symbol, coinDetails);
    Object.assign(basicData, devData);

    // 5. 从社交媒体获取活跃度数据
    const socialData = await collectSocialDataWithTracking(coin.symbol, coinDetails);
    Object.assign(basicData, socialData);

    // 6. 计算衍生指标
    await calculateDerivedMetrics(basicData, coinDetails);

  } catch (error) {
    console.error(`从数据源采集 ${coin.symbol} 数据失败:`, error);
  }

  return basicData;
}

/**
 * 从所有数据源采集数据
 */
async function collectFromAllSources(coin: any): Promise<any> {
  const basicData: any = {
    cryptocurrencyId: coin.id,
    dataSource: 'comprehensive_collection',
    lastUpdated: new Date()
  };

  try {
    // 1. 从CoinMarketCap获取基础数据
    const cmcData = await collectFromCoinMarketCap(coin.symbol);
    Object.assign(basicData, cmcData);

    // 2. 从CoinGecko获取补充数据
    const cgData = await collectFromCoinGecko(coin.symbol);
    Object.assign(basicData, cgData);

    // 3. 从链上数据源获取链上指标
    const onChainData = await collectOnChainData(coin.symbol);
    Object.assign(basicData, onChainData);

    // 4. 从GitHub获取开发数据
    const devData = await collectDeveloperData(coin.symbol);
    Object.assign(basicData, devData);

    // 5. 从社交媒体获取活跃度数据
    const socialData = await collectSocialData(coin.symbol);
    Object.assign(basicData, socialData);

  } catch (error) {
    console.error(`从数据源采集 ${coin.symbol} 数据失败:`, error);
  }

  return basicData;
}

/**
 * 更新数据项状态
 */
function updateDataItemStatus(coinDetails: CoinCollectionDetails, itemName: string, status: 'success' | 'failed' | 'skipped', source?: string, value?: any, error?: string): void {
  const dataItem = coinDetails.dataItems.find(item => item.name === itemName);
  if (dataItem) {
    dataItem.status = status;
    dataItem.source = source;
    dataItem.value = value;
    dataItem.error = error;
    
    // 更新统计
    if (status === 'success') {
      coinDetails.successItems++;
    } else if (status === 'failed') {
      coinDetails.failedItems++;
    } else if (status === 'skipped') {
      coinDetails.skippedItems++;
    }
  }
}

/**
 * 从CoinMarketCap采集数据（带跟踪）
 */
async function collectFromCoinMarketCapWithTracking(symbol: string, coinDetails: CoinCollectionDetails): Promise<any> {
  const result: any = {};
  
  try {
    const response = await requestWithRetry(
      `${DATA_SOURCES.COINMARKETCAP.baseUrl}${DATA_SOURCES.COINMARKETCAP.endpoints.quotes}?symbol=${symbol}&convert=USD`,
      3, // 重试3次
      1000 // 初始延迟1秒
    );

    if (response.data.data && response.data.data[symbol]) {
      const data = response.data.data[symbol][0];
      const quote = data.quote.USD;
      
      // 更新数据项状态
      updateDataItemStatus(coinDetails, 'priceChange7d', 'success', 'CoinMarketCap', quote.percent_change_7d);
      updateDataItemStatus(coinDetails, 'priceChange30d', 'success', 'CoinMarketCap', quote.percent_change_30d);
      updateDataItemStatus(coinDetails, 'priceChange60d', 'success', 'CoinMarketCap', quote.percent_change_60d);
      updateDataItemStatus(coinDetails, 'priceChange90d', 'success', 'CoinMarketCap', quote.percent_change_90d);
      updateDataItemStatus(coinDetails, 'circulatingSupply', 'success', 'CoinMarketCap', data.circulating_supply);
      updateDataItemStatus(coinDetails, 'totalSupply', 'success', 'CoinMarketCap', data.total_supply);
      
      result.priceChange7d = quote.percent_change_7d;
      result.priceChange30d = quote.percent_change_30d;
      result.priceChange60d = quote.percent_change_60d;
      result.priceChange90d = quote.percent_change_90d;
      result.circulatingSupply = data.circulating_supply;
      result.totalSupply = data.total_supply;
      result.volumeToMarketCapRatio = quote.volume_24h / quote.market_cap;
      result.marketCapToFDV = quote.market_cap / (data.total_supply * quote.price);
      result.circulatingToTotalRatio = data.circulating_supply / data.total_supply;
    }
  } catch (error) {
    console.error(`CoinMarketCap采集 ${symbol} 失败:`, error.message);
    // 更新失败的数据项状态
    updateDataItemStatus(coinDetails, 'priceChange7d', 'failed', 'CoinMarketCap', null, error.message);
    updateDataItemStatus(coinDetails, 'priceChange30d', 'failed', 'CoinMarketCap', null, error.message);
    updateDataItemStatus(coinDetails, 'priceChange60d', 'failed', 'CoinMarketCap', null, error.message);
    updateDataItemStatus(coinDetails, 'priceChange90d', 'failed', 'CoinMarketCap', null, error.message);
    updateDataItemStatus(coinDetails, 'circulatingSupply', 'failed', 'CoinMarketCap', null, error.message);
    updateDataItemStatus(coinDetails, 'totalSupply', 'failed', 'CoinMarketCap', null, error.message);
  }
  
  return result;
}

/**
 * 从CoinMarketCap采集数据
 */
async function collectFromCoinMarketCap(symbol: string): Promise<any> {
  try {
    const response = await axios.get(
      `${DATA_SOURCES.COINMARKETCAP.baseUrl}${DATA_SOURCES.COINMARKETCAP.endpoints.quotes}`,
      {
        params: {
          symbol: symbol,
          convert: 'USD'
        },
        headers: {
          'X-CMC_PRO_API_KEY': DATA_SOURCES.COINMARKETCAP.apiKey,
          'Accept': 'application/json'
        },
        timeout: 30000
      }
    );

    if (response.data.data && response.data.data[symbol]) {
      const data = response.data.data[symbol][0];
      const quote = data.quote.USD;
      
      return {
        // 价格变化数据
        priceChange7d: quote.percent_change_7d,
        priceChange30d: quote.percent_change_30d,
        priceChange60d: quote.percent_change_60d,
        priceChange90d: quote.percent_change_90d,
        
        // 供应量数据
        circulatingSupply: data.circulating_supply,
        totalSupply: data.total_supply,
        maxSupply: data.max_supply,
        
        // 市值和交易量比率
        volumeToMarketCapRatio: quote.volume_24h / quote.market_cap,
        marketCapToFDV: quote.market_cap / (data.total_supply * quote.price),
        
        // 计算流通/总供应量比值
        circulatingToTotalRatio: data.circulating_supply / data.total_supply
      };
    }
  } catch (error) {
    console.error(`CoinMarketCap采集 ${symbol} 失败:`, error.message);
  }
  
  return {};
}

/**
 * 从CoinGecko采集数据（带跟踪）
 */
async function collectFromCoinGeckoWithTracking(symbol: string, coinDetails: CoinCollectionDetails): Promise<any> {
  const result: any = {};
  
  try {
    // 先获取币种ID
    const searchResponse = await requestWithRetry(
      `${DATA_SOURCES.COINGECKO.baseUrl}/search?query=${symbol}`,
      3, // 重试3次
      1000 // 初始延迟1秒
    );

    if (searchResponse.data.coins && searchResponse.data.coins.length > 0) {
      const coinId = searchResponse.data.coins[0].id;
      
      // 获取详细信息
      const detailResponse = await axios.get(
        `${DATA_SOURCES.COINGECKO.baseUrl}/coins/${coinId}`,
        {
          params: {
            localization: false,
            tickers: false,
            market_data: true,
            community_data: true,
            developer_data: true,
            sparkline: false
          },
          timeout: 30000
        }
      );

      const data = detailResponse.data;
      const marketData = data.market_data;
      const communityData = data.community_data;
      const developerData = data.developer_data;

      // 更新数据项状态
      updateDataItemStatus(coinDetails, 'priceChange180d', 'success', 'CoinGecko', marketData.price_change_percentage_180d_in_currency?.usd);
      updateDataItemStatus(coinDetails, 'priceChange1y', 'success', 'CoinGecko', marketData.price_change_percentage_1y_in_currency?.usd);
      updateDataItemStatus(coinDetails, 'twitterEngagementRate', 'success', 'CoinGecko', communityData.twitter_followers ? (communityData.twitter_followers / 1000000) : null);
      updateDataItemStatus(coinDetails, 'discordTelegramActivity', 'success', 'CoinGecko', communityData.telegram_channel_user_count || communityData.discord_members || null);
      updateDataItemStatus(coinDetails, 'monthlyCommits', 'success', 'CoinGecko', developerData.commit_count_4_weeks);
      updateDataItemStatus(coinDetails, 'developerCount', 'success', 'CoinGecko', developerData.developers?.length || null);
      updateDataItemStatus(coinDetails, 'priceToSalesRatio', 'success', 'CoinGecko', marketData.price_to_sales_ratio?.usd);

      result.priceChange180d = marketData.price_change_percentage_180d_in_currency?.usd;
      result.priceChange1y = marketData.price_change_percentage_1y_in_currency?.usd;
      result.twitterEngagementRate = communityData.twitter_followers ? (communityData.twitter_followers / 1000000) : null;
      result.discordTelegramActivity = communityData.telegram_channel_user_count || communityData.discord_members || null;
      result.monthlyCommits = developerData.commit_count_4_weeks;
      result.developerCount = developerData.developers?.length || null;
      result.priceToSalesRatio = marketData.price_to_sales_ratio?.usd;
    }
  } catch (error) {
    console.error(`CoinGecko采集 ${symbol} 失败:`, error.message);
    // 更新失败的数据项状态
    updateDataItemStatus(coinDetails, 'priceChange180d', 'failed', 'CoinGecko', null, error.message);
    updateDataItemStatus(coinDetails, 'priceChange1y', 'failed', 'CoinGecko', null, error.message);
    updateDataItemStatus(coinDetails, 'twitterEngagementRate', 'failed', 'CoinGecko', null, error.message);
    updateDataItemStatus(coinDetails, 'discordTelegramActivity', 'failed', 'CoinGecko', null, error.message);
    updateDataItemStatus(coinDetails, 'monthlyCommits', 'failed', 'CoinGecko', null, error.message);
    updateDataItemStatus(coinDetails, 'developerCount', 'failed', 'CoinGecko', null, error.message);
    updateDataItemStatus(coinDetails, 'priceToSalesRatio', 'failed', 'CoinGecko', null, error.message);
  }
  
  return result;
}

/**
 * 从CoinGecko采集数据
 */
async function collectFromCoinGecko(symbol: string): Promise<any> {
  try {
    // 先获取币种ID
    const searchResponse = await axios.get(
      `${DATA_SOURCES.COINGECKO.baseUrl}/search`,
      {
        params: { query: symbol },
        timeout: 30000
      }
    );

    if (searchResponse.data.coins && searchResponse.data.coins.length > 0) {
      const coinId = searchResponse.data.coins[0].id;
      
      // 获取详细信息
      const detailResponse = await axios.get(
        `${DATA_SOURCES.COINGECKO.baseUrl}/coins/${coinId}`,
        {
          params: {
            localization: false,
            tickers: false,
            market_data: true,
            community_data: true,
            developer_data: true,
            sparkline: false
          },
          timeout: 30000
        }
      );

      const data = detailResponse.data;
      const marketData = data.market_data;
      const communityData = data.community_data;
      const developerData = data.developer_data;

      return {
        // 价格变化数据（补充更长时间段）
        priceChange180d: marketData.price_change_percentage_180d_in_currency?.usd,
        priceChange1y: marketData.price_change_percentage_1y_in_currency?.usd,
        
        // 社交媒体活跃度
        twitterEngagementRate: communityData.twitter_followers ? 
          (communityData.twitter_followers / 1000000) : null, // 简化的互动率计算
        discordTelegramActivity: communityData.telegram_channel_user_count || 
          communityData.discord_members || null,
        
        // 开发活动
        monthlyCommits: developerData.commit_count_4_weeks,
        developerCount: developerData.developers?.length || null,
        
        // 财务指标
        priceToSalesRatio: marketData.price_to_sales_ratio?.usd
      };
    }
  } catch (error) {
    console.error(`CoinGecko采集 ${symbol} 失败:`, error.message);
  }
  
  return {};
}

/**
 * 采集链上数据
 */
async function collectOnChainData(symbol: string): Promise<any> {
  // 这里可以集成Glassnode、Santiment等链上数据API
  // 由于需要API密钥，这里提供框架结构
  try {
    // 示例：从Glassnode获取链上指标
    // const response = await axios.get(`${DATA_SOURCES.GLASSNODE.baseUrl}/metrics/active_addresses`, {
    //   params: { a: symbol, s: 1640995200, i: '24h' },
    //   headers: { 'X-API-KEY': DATA_SOURCES.GLASSNODE.apiKey }
    // });
    
    return {
      // 链上活动数据（需要具体API实现）
      dailyActiveAddresses: null,
      dailyTransactions: null,
      dailyGasCost: null,
      
      // 持有分布数据（需要具体API实现）
      top10AddressConcentration: null,
      retailHoldingRatio: null
    };
  } catch (error) {
    console.error(`链上数据采集 ${symbol} 失败:`, error.message);
    return {};
  }
}

/**
 * 采集开发数据
 */
async function collectDeveloperData(symbol: string): Promise<any> {
  try {
    // 这里可以集成GitHub API获取开发活动数据
    // 需要根据项目名称或仓库地址来获取数据
    
    return {
      // 开发活动数据（需要GitHub API实现）
      monthlyCommits: null,
      developerCount: null,
      dependentProjects: null,
      developerForumActivity: null
    };
  } catch (error) {
    console.error(`开发数据采集 ${symbol} 失败:`, error.message);
    return {};
  }
}

/**
 * 采集社交媒体数据
 */
async function collectSocialData(symbol: string): Promise<any> {
  try {
    // 这里可以集成Twitter API、Discord API等
    // 获取社交媒体活跃度数据
    
    return {
      // 社交媒体活跃度（需要具体API实现）
      twitterEngagementRate: null,
      discordTelegramActivity: null,
      developerForumActivity: null
    };
  } catch (error) {
    console.error(`社交媒体数据采集 ${symbol} 失败:`, error.message);
    return {};
  }
}

/**
 * 保存基础数据到数据库
 */
async function saveBasicDataToDatabase(cryptoId: number, basicData: any): Promise<void> {
  try {
    // 检查是否已有基础数据
    const existing = await db.select().from(cryptoBasicData)
      .where(eq(cryptoBasicData.cryptocurrencyId, cryptoId))
      .limit(1);

    if (existing.length > 0) {
      // 更新现有数据
      await db.update(cryptoBasicData)
        .set(basicData)
        .where(eq(cryptoBasicData.cryptocurrencyId, cryptoId));
    } else {
      // 插入新数据
      await db.insert(cryptoBasicData).values(basicData);
    }
  } catch (error) {
    console.error(`保存基础数据失败:`, error);
    throw error;
  }
}

/**
 * 停止采集
 */
export function stopCollection(): void {
  if (collectionProgress.status === 'running') {
    collectionProgress.status = 'idle';
    collectionProgress.currentStep = '已停止';
    console.log('⏹️ 采集已停止');
  }
}

/**
 * 重置采集状态
 */
export function resetCollection(): void {
  collectionProgress = {
    status: 'idle',
    currentStep: '准备就绪',
    progress: 0,
    totalCoins: 0,
    processedCoins: 0,
    errors: [],
    coinDetails: [],
    totalDataItems: 0,
    successDataItems: 0,
    failedDataItems: 0
  };
}

/**
 * 从链上数据源采集数据（带跟踪）
 */
async function collectOnChainDataWithTracking(symbol: string, coinDetails: CoinCollectionDetails): Promise<any> {
  const result: any = {};
  
  // 标记链上数据项为跳过（需要API密钥）
  const onChainItems = ['top10AddressConcentration', 'retailHoldingRatio', 'dailyActiveAddresses', 'dailyTransactions', 'dailyGasCost'];
  onChainItems.forEach(item => {
    updateDataItemStatus(coinDetails, item, 'skipped', 'onchain', null, '需要API密钥');
  });
  
  return result;
}

/**
 * 从GitHub获取开发数据（带跟踪）
 */
async function collectDeveloperDataWithTracking(symbol: string, coinDetails: CoinCollectionDetails): Promise<any> {
  const result: any = {};
  
  // 标记开发数据项为跳过（需要GitHub API）
  const devItems = ['monthlyCommits', 'developerCount', 'dependentProjects'];
  devItems.forEach(item => {
    updateDataItemStatus(coinDetails, item, 'skipped', 'github', null, '需要GitHub API');
  });
  
  return result;
}

/**
 * 从社交媒体获取活跃度数据（带跟踪）
 */
async function collectSocialDataWithTracking(symbol: string, coinDetails: CoinCollectionDetails): Promise<any> {
  const result: any = {};
  
  // 标记社交媒体数据项为跳过（需要API密钥）
  const socialItems = ['twitterEngagementRate', 'discordTelegramActivity', 'developerForumActivity'];
  socialItems.forEach(item => {
    updateDataItemStatus(coinDetails, item, 'skipped', 'social', null, '需要API密钥');
  });
  
  return result;
}

/**
 * 计算衍生指标（带跟踪）
 */
async function calculateDerivedMetrics(basicData: any, coinDetails: CoinCollectionDetails): Promise<void> {
  try {
    // 计算流通/总供应量比值
    if (basicData.circulatingSupply && basicData.totalSupply) {
      basicData.circulatingToTotalRatio = basicData.circulatingSupply / basicData.totalSupply;
      updateDataItemStatus(coinDetails, 'circulatingToTotalRatio', 'success', 'calculated', basicData.circulatingToTotalRatio);
    } else {
      updateDataItemStatus(coinDetails, 'circulatingToTotalRatio', 'failed', 'calculated', null, '缺少基础数据');
    }
    
    // 计算市值/FDV比值
    if (basicData.marketCap && basicData.totalSupply && basicData.price) {
      basicData.marketCapToFDV = basicData.marketCap / (basicData.totalSupply * basicData.price);
      updateDataItemStatus(coinDetails, 'marketCapToFDV', 'success', 'calculated', basicData.marketCapToFDV);
    } else {
      updateDataItemStatus(coinDetails, 'marketCapToFDV', 'failed', 'calculated', null, '缺少基础数据');
    }
  } catch (error) {
    console.error(`计算衍生指标失败:`, error);
  }
}
