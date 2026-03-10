/**
 * 独立Web服务 - 集成真实API数据源和Web界面
 * 提供完整的加密货币数据仪表板界面
 */

import express from 'express';
import axios from 'axios';
import path from 'path';

console.log('🎯 独立Web服务开始执行 - 集成真实API数据源和Web界面');
console.log('🔍 环境变量NODE_ENV:', process.env.NODE_ENV || '未设置');

const app = express();
const PORT = 5006; // 使用不同端口避免冲突

// 设置静态文件目录
app.use(express.static(path.join(__dirname, 'client')));
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
 * 从CoinGecko API获取加密货币数据
 */
async function fetchFromCoinGeckoAPI(limit: number = 50) {
  try {
    console.log(`📊 从CoinGecko API获取前${limit}个加密货币数据...`);
    const url = `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=${limit}&page=1&sparkline=false&price_change_percentage=24h`;
    
    const response = await requestWithRetry(url);
    const data = response.data;
    
    return data.map((coin: any) => ({
      id: coin.id,
      symbol: coin.symbol.toUpperCase(),
      name: coin.name,
      price: coin.current_price,
      market_cap: coin.market_cap,
      volume_24h: coin.total_volume,
      price_change_percentage_24h: coin.price_change_percentage_24h,
      last_updated: coin.last_updated,
      source: 'CoinGecko'
    }));
  } catch (error: any) {
    console.error('CoinGecko API请求失败:', error.message);
    return [];
  }
}

/**
 * 从CryptoCompare API获取加密货币数据
 */
async function fetchFromCryptoCompareAPI(limit: number = 50) {
  try {
    console.log(`📊 从CryptoCompare API获取前${limit}个加密货币数据...`);
    const url = `https://min-api.cryptocompare.com/data/top/mktcapfull?limit=${limit}&tsym=USD`;
    
    const response = await requestWithRetry(url);
    const data = response.data.Data;
    
    return data.map((coin: any) => ({
      id: coin.CoinInfo.Id,
      symbol: coin.CoinInfo.Name,
      name: coin.CoinInfo.FullName,
      price: coin.RAW?.USD?.PRICE || 0,
      market_cap: coin.RAW?.USD?.MKTCAP || 0,
      volume_24h: coin.RAW?.USD?.VOLUME24HOUR || 0,
      price_change_percentage_24h: coin.RAW?.USD?.CHANGEPCT24HOUR || 0,
      last_updated: new Date().toISOString(),
      source: 'CryptoCompare'
    }));
  } catch (error: any) {
    console.error('CryptoCompare API请求失败:', error.message);
    return [];
  }
}

/**
 * 聚合多个API的数据
 */
async function aggregateCryptoData(limit: number = 50) {
  console.log('🔄 开始聚合加密货币数据...');
  
  const [coinGeckoData, cryptoCompareData] = await Promise.all([
    fetchFromCoinGeckoAPI(limit),
    fetchFromCryptoCompareAPI(limit)
  ]);
  
  // 合并数据，去重（基于symbol）
  const allData = [...coinGeckoData, ...cryptoCompareData];
  const uniqueData = allData.reduce((acc: any[], coin: any) => {
    const existing = acc.find((c: any) => c.symbol === coin.symbol);
    if (!existing) {
      acc.push(coin);
    }
    return acc;
  }, []);
  
  console.log(`✅ 数据聚合完成，共获取 ${uniqueData.length} 个加密货币数据`);
  return uniqueData.slice(0, limit);
}

// Web界面路由
app.get('/', (req, res) => {
  const html = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>加密货币数据仪表板 - 独立服务</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            color: #333;
        }
        
        .container {
            max-width: 1200px;
            margin: 0 auto;
            padding: 20px;
        }
        
        .header {
            background: rgba(255, 255, 255, 0.95);
            backdrop-filter: blur(10px);
            border-radius: 20px;
            padding: 30px;
            margin-bottom: 30px;
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.1);
            text-align: center;
        }
        
        .header h1 {
            font-size: 2.5em;
            margin-bottom: 10px;
            background: linear-gradient(45deg, #667eea, #764ba2);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
        }
        
        .header p {
            font-size: 1.2em;
            color: #666;
            margin-bottom: 20px;
        }
        
        .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 20px;
            margin-bottom: 30px;
        }
        
        .stat-card {
            background: rgba(255, 255, 255, 0.95);
            backdrop-filter: blur(10px);
            border-radius: 15px;
            padding: 25px;
            text-align: center;
            box-shadow: 0 5px 15px rgba(0, 0, 0, 0.1);
            transition: transform 0.3s ease;
        }
        
        .stat-card:hover {
            transform: translateY(-5px);
        }
        
        .stat-value {
            font-size: 2em;
            font-weight: bold;
            margin: 10px 0;
        }
        
        .positive { color: #10b981; }
        .negative { color: #ef4444; }
        
        .crypto-table {
            background: rgba(255, 255, 255, 0.95);
            backdrop-filter: blur(10px);
            border-radius: 15px;
            overflow: hidden;
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.1);
        }
        
        .table-header {
            background: linear-gradient(45deg, #667eea, #764ba2);
            color: white;
            padding: 20px;
            font-size: 1.3em;
            font-weight: bold;
        }
        
        .table-container {
            max-height: 500px;
            overflow-y: auto;
        }
        
        table {
            width: 100%;
            border-collapse: collapse;
        }
        
        th, td {
            padding: 15px;
            text-align: left;
            border-bottom: 1px solid #eee;
        }
        
        th {
            background: #f8fafc;
            font-weight: 600;
            color: #64748b;
        }
        
        tr:hover {
            background: #f1f5f9;
        }
        
        .loading {
            text-align: center;
            padding: 50px;
            font-size: 1.2em;
            color: #666;
        }
        
        .refresh-btn {
            background: linear-gradient(45deg, #667eea, #764ba2);
            color: white;
            border: none;
            padding: 12px 25px;
            border-radius: 25px;
            font-size: 1em;
            cursor: pointer;
            transition: all 0.3s ease;
            margin: 10px;
        }
        
        .refresh-btn:hover {
            transform: scale(1.05);
            box-shadow: 0 5px 15px rgba(102, 126, 234, 0.4);
        }
        
        .api-status {
            display: flex;
            justify-content: center;
            gap: 15px;
            margin: 20px 0;
        }
        
        .status-badge {
            padding: 8px 15px;
            border-radius: 20px;
            font-size: 0.9em;
            font-weight: 500;
        }
        
        .status-active { background: #d1fae5; color: #065f46; }
        .status-inactive { background: #fee2e2; color: #991b1b; }
        
        @media (max-width: 768px) {
            .container {
                padding: 10px;
            }
            
            .header h1 {
                font-size: 2em;
            }
            
            .stats-grid {
                grid-template-columns: 1fr;
            }
            
            th, td {
                padding: 10px;
                font-size: 0.9em;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🚀 加密货币数据仪表板</h1>
            <p>实时监控加密货币市场数据 - 独立服务版本</p>
            <div class="api-status">
                <span class="status-badge status-active">CoinGecko API ✓</span>
                <span class="status-badge status-active">CryptoCompare API ✓</span>
            </div>
            <button class="refresh-btn" onclick="loadData()">🔄 刷新数据</button>
        </div>
        
        <div class="stats-grid">
            <div class="stat-card">
                <div>📊 加密货币数量</div>
                <div class="stat-value" id="cryptoCount">-</div>
                <div>实时统计</div>
            </div>
            <div class="stat-card">
                <div>💰 总市值</div>
                <div class="stat-value" id="totalMarketCap">-</div>
                <div>USD</div>
            </div>
            <div class="stat-card">
                <div>📈 24h涨幅</div>
                <div class="stat-value" id="avgChange">-</div>
                <div>平均变化</div>
            </div>
            <div class="stat-card">
                <div>🕒 最后更新</div>
                <div class="stat-value" id="lastUpdate">-</div>
                <div>时间</div>
            </div>
        </div>
        
        <div class="crypto-table">
            <div class="table-header">
                📋 加密货币列表 (前50名)
            </div>
            <div class="table-container">
                <div class="loading" id="loading">正在加载数据...</div>
                <table id="cryptoTable" style="display: none;">
                    <thead>
                        <tr>
                            <th>排名</th>
                            <th>名称</th>
                            <th>代码</th>
                            <th>价格 (USD)</th>
                            <th>市值</th>
                            <th>24h变化</th>
                            <th>数据源</th>
                        </tr>
                    </thead>
                    <tbody id="cryptoTableBody">
                    </tbody>
                </table>
            </div>
        </div>
    </div>

    <script>
        async function loadData() {
            const loading = document.getElementById('loading');
            const table = document.getElementById('cryptoTable');
            const tableBody = document.getElementById('cryptoTableBody');
            
            loading.style.display = 'block';
            table.style.display = 'none';
            
            try {
                const response = await fetch('/api/data');
                const result = await response.json();
                
                if (result.success) {
                    displayData(result.data);
                    updateStats(result.data);
                } else {
                    throw new Error(result.error);
                }
            } catch (error) {
                loading.innerHTML = `数据加载失败: ${error.message}`;
                console.error('数据加载错误:', error);
            }
        }
        
        function displayData(data) {
            const loading = document.getElementById('loading');
            const table = document.getElementById('cryptoTable');
            const tableBody = document.getElementById('cryptoTableBody');
            
            loading.style.display = 'none';
            table.style.display = 'table';
            
            tableBody.innerHTML = '';
            
            data.forEach((coin, index) => {
                const row = document.createElement('tr');
                
                const changeClass = coin.price_change_percentage_24h >= 0 ? 'positive' : 'negative';
                const changeSymbol = coin.price_change_percentage_24h >= 0 ? '↗' : '↘';
                
                row.innerHTML = `
                    <td>${index + 1}</td>
                    <td><strong>${coin.name}</strong></td>
                    <td><code>${coin.symbol}</code></td>
                    <td>$${formatNumber(coin.price)}</td>
                    <td>$${formatMarketCap(coin.market_cap)}</td>
                    <td class="${changeClass}">${changeSymbol} ${coin.price_change_percentage_24h?.toFixed(2) || '0.00'}%</td>
                    <td><span class="status-badge status-active">${coin.source}</span></td>
                `;
                
                tableBody.appendChild(row);
            });
        }
        
        function updateStats(data) {
            const totalMarketCap = data.reduce((sum, coin) => sum + (coin.market_cap || 0), 0);
            const avgChange = data.reduce((sum, coin) => sum + (coin.price_change_percentage_24h || 0), 0) / data.length;
            
            document.getElementById('cryptoCount').textContent = data.length;
            document.getElementById('totalMarketCap').textContent = `$${formatMarketCap(totalMarketCap)}`;
            document.getElementById('avgChange').textContent = `${avgChange >= 0 ? '+' : ''}${avgChange.toFixed(2)}%`;
            document.getElementById('avgChange').className = avgChange >= 0 ? 'stat-value positive' : 'stat-value negative';
            document.getElementById('lastUpdate').textContent = new Date().toLocaleTimeString();
        }
        
        function formatNumber(num) {
            if (!num) return '0';
            if (num < 1) return num.toFixed(6);
            if (num < 1000) return num.toFixed(2);
            return num.toLocaleString('en-US', { maximumFractionDigits: 2 });
        }
        
        function formatMarketCap(marketCap) {
            if (!marketCap) return '0';
            if (marketCap >= 1e12) return (marketCap / 1e12).toFixed(2) + 'T';
            if (marketCap >= 1e9) return (marketCap / 1e9).toFixed(2) + 'B';
            if (marketCap >= 1e6) return (marketCap / 1e6).toFixed(2) + 'M';
            return formatNumber(marketCap);
        }
        
        // 页面加载时自动获取数据
        document.addEventListener('DOMContentLoaded', loadData);
        
        // 每30秒自动刷新数据
        setInterval(loadData, 30000);
    </script>
</body>
</html>`;
  
  res.send(html);
});

// API端点保持不变
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

app.get('/api/health', (req, res) => {
  res.status(200).json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

app.get('/api/sources', (req, res) => {
  res.json({
    available_sources: [
      {
        name: 'CoinGecko',
        status: '免费',
        endpoint: 'https://api.coingecko.com'
      },
      {
        name: 'CryptoCompare',
        status: '免费',
        endpoint: 'https://min-api.cryptocompare.com'
      }
    ]
  });
});

// 启动服务器
const server = app.listen(PORT, '127.0.0.1', () => {
  console.log(`🎉 独立Web服务成功启动，监听端口 ${PORT}`);
  console.log(`🌐 可访问地址: http://localhost:${PORT}`);
  console.log(`📊 Web界面: http://localhost:${PORT}/`);
  console.log(`🔍 API端点: http://localhost:${PORT}/api/data`);
  console.log('⚡ 服务正在使用真实API数据源运行...');
});

// 错误处理
server.on('error', (err) => {
  console.error('服务器错误:', err);
});

// 优雅关闭
process.on('SIGINT', () => {
  console.log('\n🛑 收到关闭信号，正在优雅关闭服务...');
  server.close(() => {
    console.log('✅ 服务已关闭');
    process.exit(0);
  });
});

console.log('🚀 独立Web服务启动中...');