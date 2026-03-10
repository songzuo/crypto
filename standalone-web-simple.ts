/**
 * 独立Web服务 - 简化版本
 * 提供完整的加密货币数据仪表板界面
 */

import express from 'express';
import axios from 'axios';

console.log('Starting standalone web service with real API data sources');

const app = express();
const PORT = 5006;

app.use(express.json());

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
      console.log(`Request failed, retrying in ${delay}ms (${i + 1}/${maxRetries}): ${url}`);
      await new Promise(resolve => setTimeout(resolve, delay));
      delay *= 2;
    }
  }
}

// 从CoinGecko API获取加密货币数据
async function fetchFromCoinGeckoAPI(limit: number = 50) {
  try {
    console.log(`Fetching ${limit} cryptocurrencies from CoinGecko API...`);
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
    console.error('CoinGecko API request failed:', error.message);
    return [];
  }
}

// 聚合数据
async function aggregateCryptoData(limit: number = 50) {
  console.log('Aggregating cryptocurrency data...');
  
  const coinGeckoData = await fetchFromCoinGeckoAPI(limit);
  
  console.log(`Data aggregation completed, got ${coinGeckoData.length} cryptocurrencies`);
  return coinGeckoData.slice(0, limit);
}

// Web界面路由
app.get('/', (req, res) => {
  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Crypto Dashboard - Standalone Service</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
            font-family: Arial, sans-serif; 
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh; 
            color: #333; 
            padding: 20px;
        }
        .container { max-width: 1200px; margin: 0 auto; }
        .header { 
            background: white; 
            border-radius: 15px; 
            padding: 30px; 
            margin-bottom: 30px; 
            text-align: center; 
            box-shadow: 0 10px 30px rgba(0,0,0,0.1);
        }
        .header h1 { 
            font-size: 2.5em; 
            margin-bottom: 10px; 
            background: linear-gradient(45deg, #667eea, #764ba2);
            -webkit-background-clip: text; -webkit-text-fill-color: transparent;
        }
        .stats-grid { 
            display: grid; 
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); 
            gap: 20px; 
            margin-bottom: 30px; 
        }
        .stat-card { 
            background: white; 
            border-radius: 15px; 
            padding: 25px; 
            text-align: center; 
            box-shadow: 0 5px 15px rgba(0,0,0,0.1);
        }
        .stat-value { font-size: 2em; font-weight: bold; margin: 10px 0; }
        .positive { color: #10b981; }
        .negative { color: #ef4444; }
        .crypto-table { 
            background: white; 
            border-radius: 15px; 
            overflow: hidden; 
            box-shadow: 0 10px 30px rgba(0,0,0,0.1);
        }
        .table-header { 
            background: linear-gradient(45deg, #667eea, #764ba2); 
            color: white; 
            padding: 20px; 
            font-size: 1.3em; 
            font-weight: bold; 
        }
        .table-container { max-height: 500px; overflow-y: auto; }
        table { width: 100%; border-collapse: collapse; }
        th, td { padding: 15px; text-align: left; border-bottom: 1px solid #eee; }
        th { background: #f8fafc; font-weight: 600; color: #64748b; }
        tr:hover { background: #f1f5f9; }
        .loading { text-align: center; padding: 50px; font-size: 1.2em; color: #666; }
        .refresh-btn { 
            background: linear-gradient(45deg, #667eea, #764ba2); 
            color: white; 
            border: none; 
            padding: 12px 25px; 
            border-radius: 25px; 
            font-size: 1em; 
            cursor: pointer; 
            margin: 10px;
        }
        .refresh-btn:hover { transform: scale(1.05); }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Crypto Dashboard</h1>
            <p>Real-time cryptocurrency market data - Standalone Service</p>
            <button class="refresh-btn" onclick="loadData()">Refresh Data</button>
        </div>
        
        <div class="stats-grid">
            <div class="stat-card">
                <div>Crypto Count</div>
                <div class="stat-value" id="cryptoCount">-</div>
                <div>Live Statistics</div>
            </div>
            <div class="stat-card">
                <div>Total Market Cap</div>
                <div class="stat-value" id="totalMarketCap">-</div>
                <div>USD</div>
            </div>
            <div class="stat-card">
                <div>24h Change</div>
                <div class="stat-value" id="avgChange">-</div>
                <div>Average Change</div>
            </div>
            <div class="stat-card">
                <div>Last Update</div>
                <div class="stat-value" id="lastUpdate">-</div>
                <div>Time</div>
            </div>
        </div>
        
        <div class="crypto-table">
            <div class="table-header">Cryptocurrency List (Top 50)</div>
            <div class="table-container">
                <div class="loading" id="loading">Loading data...</div>
                <table id="cryptoTable" style="display: none;">
                    <thead>
                        <tr>
                            <th>Rank</th>
                            <th>Name</th>
                            <th>Symbol</th>
                            <th>Price (USD)</th>
                            <th>Market Cap</th>
                            <th>24h Change</th>
                            <th>Source</th>
                        </tr>
                    </thead>
                    <tbody id="cryptoTableBody"></tbody>
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
                loading.innerHTML = 'Data loading failed: ' + error.message;
                console.error('Data loading error:', error);
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
                
                row.innerHTML = \`
                    <td>\${index + 1}</td>
                    <td><strong>\${coin.name}</strong></td>
                    <td><code>\${coin.symbol}</code></td>
                    <td>\$\${formatNumber(coin.price)}</td>
                    <td>\$\${formatMarketCap(coin.market_cap)}</td>
                    <td class="\${changeClass}">\${changeSymbol} \${coin.price_change_percentage_24h?.toFixed(2) || '0.00'}%</td>
                    <td>\${coin.source}</td>
                \`;
                
                tableBody.appendChild(row);
            });
        }
        
        function updateStats(data) {
            const totalMarketCap = data.reduce((sum, coin) => sum + (coin.market_cap || 0), 0);
            const avgChange = data.reduce((sum, coin) => sum + (coin.price_change_percentage_24h || 0), 0) / data.length;
            
            document.getElementById('cryptoCount').textContent = data.length;
            document.getElementById('totalMarketCap').textContent = \`\$\${formatMarketCap(totalMarketCap)}\`;
            document.getElementById('avgChange').textContent = \`\${avgChange >= 0 ? '+' : ''}\${avgChange.toFixed(2)}%\`;
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
        
        // Auto-load data on page load
        document.addEventListener('DOMContentLoaded', loadData);
        
        // Auto-refresh every 30 seconds
        setInterval(loadData, 30000);
    </script>
</body>
</html>`;
  
  res.send(html);
});

// API端点
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

// 启动服务器
const server = app.listen(PORT, '127.0.0.1', () => {
  console.log(`Standalone web service started on port ${PORT}`);
  console.log(`Web interface: http://localhost:${PORT}`);
  console.log(`API endpoint: http://localhost:${PORT}/api/data`);
  console.log('Service running with real API data sources...');
});

// 错误处理
server.on('error', (err) => {
  console.error('Server error:', err);
});

// 优雅关闭
process.on('SIGINT', () => {
  console.log('\nShutting down service...');
  server.close(() => {
    console.log('Service stopped');
    process.exit(0);
  });
});