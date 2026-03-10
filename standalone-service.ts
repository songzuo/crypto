/**
 * 独立服务 - 使用真实API数据源
 * 整合主项目中的多种API数据源，提供实时加密货币数据采集服务
 */

import express from 'express';
import axios from 'axios';
import { db } from './server/db';
import { cryptocurrencies, cryptoBasicData } from '@shared/schema';
import { eq } from 'drizzle-orm';

console.log('🎯 独立服务开始执行 - 使用真实API数据源');
console.log('🔍 环境变量NODE_ENV:', process.env.NODE_ENV || '未设置');

const app = express();
const PORT = 5005; // 使用不同端口避免冲突

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// 创建带重试机制的axios实例
const axiosWithRetry = axios.create({
  timeout: 30000,
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
      delay *= 2;
    }
  }
}

/**
 * 从CoinMarketCap API获取加密货币数据
 */
async function fetchFromCoinMarketCapAPI(limit: number = 50) {
  try {
    console.log(`📊 从CoinMarketCap API获取前${limit}个加密货币数据...`);
    
    const response = await axios.get(`https://pro-api.coinmarketcap.com/v1/cryptocurrency/listings/latest`, {
      headers: {
        'X-CMC_PRO_API_KEY': process.env.COINMARKETCAP_API_KEY || 'DEMO-API-KEY',
      },
      params: {
        start: 1,
        limit: limit,
        convert: 'USD'
      }
    });
    
    if (response.data && response.data.data) {
      return response.data.data.map((coin: any) => ({
        name: coin.name,
        symbol: coin.symbol,
        marketCap: coin.quote.USD.market_cap || 0,
        volume24h: coin.quote.USD.volume_24h || 0,
        price: coin.quote.USD.price || 0,
        source: 'CoinMarketCap'
      }));
    }
    return [];
  } catch (error: any) {
    console.log('❌ CoinMarketCap API错误:', error.message);
    return [];
  }
}

/**
 * 从CoinGecko API获取加密货币数据
 */
async function fetchFromCoinGeckoAPI(limit: number = 50) {
  try {
    console.log(`📊 从CoinGecko API获取前${limit}个加密货币数据...`);
    
    const response = await axios.get(`https://api.coingecko.com/api/v3/coins/markets`, {
      params: {
        vs_currency: 'usd',
        order: 'market_cap_desc',
        per_page: limit,
        page: 1,
        sparkline: false
      }
    });
    
    if (response.data) {
      return response.data.map((coin: any) => ({
        name: coin.name,
        symbol: coin.symbol,
        marketCap: coin.market_cap || 0,
        volume24h: coin.total_volume || 0,
        price: coin.current_price || 0,
        source: 'CoinGecko'
      }));
    }
    return [];
  } catch (error: any) {
    console.log('❌ CoinGecko API错误:', error.message);
    return [];
  }
}

/**
 * 从CryptoCompare API获取加密货币数据
 */
async function fetchFromCryptoCompareAPI(limit: number = 50) {
  try {
    console.log(`📊 从CryptoCompare API获取前${limit}个加密货币数据...`);
    
    const response = await axios.get(`https://min-api.cryptocompare.com/data/top/mktcapfull`, {
      params: {
        limit: limit,
        tsym: 'USD',
        api_key: process.env.CRYPTOCOMPARE_API_KEY || ''
      }
    });
    
    if (response.data && response.data.Data) {
      return response.data.Data.map((coin: any) => ({
        name: coin.CoinInfo.FullName,
        symbol: coin.CoinInfo.Name,
        marketCap: coin.RAW?.USD?.MKTCAP || 0,
        volume24h: coin.RAW?.USD?.VOLUME24HOUR || 0,
        price: coin.RAW?.USD?.PRICE || 0,
        source: 'CryptoCompare'
      }));
    }
    return [];
  } catch (error: any) {
    console.log('❌ CryptoCompare API错误:', error.message);
    return [];
  }
}

/**
 * 聚合多个API源的数据
 */
async function aggregateCryptoData(limit: number = 50) {
  console.log('🔄 开始聚合多个API数据源...');
  
  const dataSources = [
    fetchFromCoinMarketCapAPI(limit),
    fetchFromCoinGeckoAPI(limit),
    fetchFromCryptoCompareAPI(limit)
  ];
  
  const results = await Promise.allSettled(dataSources);
  
  const allCoins = new Map<string, any>();
  
  results.forEach((result, index) => {
    const sourceNames = ['CoinMarketCap', 'CoinGecko', 'CryptoCompare'];
    if (result.status === 'fulfilled' && result.value) {
      result.value.forEach((coin: any) => {
        const key = coin.symbol.toLowerCase();
        if (!allCoins.has(key)) {
          allCoins.set(key, {
            ...coin,
            sources: [coin.source]
          });
        } else {
          const existing = allCoins.get(key);
          // 合并数据，优先使用更可靠的数据源
          if (coin.source === 'CoinMarketCap' || 
              (coin.source === 'CoinGecko' && existing.sources.includes('CoinMarketCap'))) {
            allCoins.set(key, {
              ...coin,
              sources: [...new Set([...existing.sources, coin.source])]
            });
          }
        }
      });
      console.log(`✅ ${sourceNames[index]} API成功获取数据: ${result.value.length}条记录`);
    } else {
      console.log(`❌ ${sourceNames[index]} API失败:`, result.reason?.message || '未知错误');
    }
  });
  
  const aggregatedData = Array.from(allCoins.values());
  console.log(`📈 数据聚合完成: ${aggregatedData.length}个加密货币`);
  
  return aggregatedData;
}

// API路由

// 健康检查端点
app.get('/', (req, res) => {
  res.status(200).json({ 
    status: 'ok', 
    message: '独立加密货币数据服务运行正常',
    endpoints: {
      '/api/data': '获取实时加密货币数据',
      '/api/health': '健康检查',
      '/api/sources': '查看可用数据源'
    }
  });
});

// 获取实时加密货币数据
app.get('/api/data', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    const data = await aggregateCryptoData(limit);
    
    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      count: data.length,
      data: data
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 健康检查端点
app.get('/api/health', (req, res) => {
  res.status(200).json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// 查看可用数据源
app.get('/api/sources', (req, res) => {
  res.json({
    available_sources: [
      {
        name: 'CoinMarketCap',
        status: process.env.COINMARKETCAP_API_KEY ? '配置' : '未配置',
        endpoint: 'https://pro-api.coinmarketcap.com'
      },
      {
        name: 'CoinGecko',
        status: '免费',
        endpoint: 'https://api.coingecko.com'
      },
      {
        name: 'CryptoCompare',
        status: process.env.CRYPTOCOMPARE_API_KEY ? '配置' : '免费',
        endpoint: 'https://min-api.cryptocompare.com'
      }
    ]
  });
});

// 启动服务器
const server = app.listen(PORT, '127.0.0.1', () => {
  console.log(`🎉 独立服务成功启动，监听端口 ${PORT}`);
  console.log(`🌐 可访问地址: http://localhost:${PORT}`);
  console.log(`📊 API端点: http://localhost:${PORT}/api/data`);
  console.log(`🔍 健康检查: http://localhost:${PORT}/api/health`);
  console.log('⚡ 服务正在使用真实API数据源运行...');
});

// 错误处理
server.on('error', (err) => {
  console.error('❌ 服务器错误:', err);
});

// 优雅关闭
process.on('SIGINT', () => {
  console.log('\n🛑 收到关闭信号，正在优雅关闭服务...');
  server.close(() => {
    console.log('✅ 服务已关闭');
    process.exit(0);
  });
});

console.log('🚀 独立服务启动中...');