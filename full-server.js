// 完整的CryptoScan服务器
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';

// 获取当前文件和目录路径
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 创建Express应用
const app = express();
const PORT = process.env.PORT || 5000;

// 配置静态文件服务 - 支持开发环境
const clientDir = path.resolve(__dirname, './client');
const clientSrcDir = path.resolve(clientDir, './src');

console.log('📁 使用客户端源代码目录:', clientDir);
console.log('📂 客户端源码目录:', clientSrcDir);

// 配置静态文件服务，允许访问client目录下的所有文件
app.use(express.static(clientDir));
app.use(express.static(path.resolve(clientDir, './src')));

// 为React应用的路径别名提供支持
app.use('/@', express.static(path.resolve(clientDir, './src')));
app.use('/@components', express.static(path.resolve(clientDir, './src/components')));
app.use('/@pages', express.static(path.resolve(clientDir, './src/pages')));
app.use('/@hooks', express.static(path.resolve(clientDir, './src/hooks')));
app.use('/@lib', express.static(path.resolve(clientDir, './src/lib')));
app.use('/@shared', express.static(path.resolve(__dirname, './shared')));

// 配置JSON解析
app.use(express.json({ limit: '1mb' }));

// 健康检查端点
app.get('/api/health', (req, res) => {
    res.json({
        status: 'UP',
        message: 'CryptoScan服务器运行正常',
        timestamp: new Date().toISOString(),
        version: '1.0.0'
    });
});

// 统计数据端点 - 为Dashboard组件提供数据
app.get('/api/stats', (req, res) => {
    res.json({
        totalMarketCap: '$1.26T',
        marketCapChange: '2.4%',
        tradingVolume: '$48.7B',
        volumeChange: '1.3%',
        activeBlockchains: '84',
        lastUpdated: 'Last updated 3min ago',
        trackedAssets: '578',
        newAssets: '12 new today'
    });
});

// 虚拟加密货币数据端点
app.get('/api/cryptocurrencies', (req, res) => {
    res.json([
        { id: 'bitcoin', name: 'Bitcoin', symbol: 'BTC', price: '$42,567.89', change: '+2.4%', volume: '$24.5B' },
        { id: 'ethereum', name: 'Ethereum', symbol: 'ETH', price: '$2,245.31', change: '+1.8%', volume: '$12.3B' },
        { id: 'solana', name: 'Solana', symbol: 'SOL', price: '$108.76', change: '-0.5%', volume: '$3.2B' },
        { id: 'cardano', name: 'Cardano', symbol: 'ADA', price: '$0.45', change: '+3.2%', volume: '$1.8B' },
        { id: 'polkadot', name: 'Polkadot', symbol: 'DOT', price: '$6.78', change: '+0.9%', volume: '$956M' }
    ]);
});

// 爬虫状态端点
app.get('/api/crawler-status', (req, res) => {
    res.json({
        status: 'active',
        lastRun: '2025-10-25T18:30:45Z',
        nextRun: '2025-10-25T19:30:45Z',
        processedItems: 567,
        pendingItems: 12,
        successRate: '98.7%'
    });
});

// AI洞察端点
app.get('/api/ai-insights', (req, res) => {
    res.json({
        insights: [
            {
                id: 1,
                title: '比特币价格上涨趋势分析',
                content: '基于最近7天的数据，比特币显示出明显的上升趋势，交易量增加了24%。',
                confidence: '高',
                timestamp: '2025-10-25T18:00:00Z'
            },
            {
                id: 2,
                title: '以太坊网络活动异常',
                content: '检测到以太坊网络上的智能合约交互频率异常增加，可能与新DApp发布相关。',
                confidence: '中',
                timestamp: '2025-10-25T17:30:00Z'
            }
        ]
    });
});

// 最近探索记录端点
app.get('/api/recent-explorers', (req, res) => {
    res.json([
        { id: 'bitcoin', name: 'Bitcoin', lastViewed: '5分钟前' },
        { id: 'ethereum', name: 'Ethereum', lastViewed: '15分钟前' },
        { id: 'solana', name: 'Solana', lastViewed: '1小时前' },
        { id: 'cardano', name: 'Cardano', lastViewed: '2小时前' }
    ]);
});

// 前端路由处理 - 支持单页应用路由
app.get('*', (req, res) => {
    // 避免为API请求提供HTML文件
    if (req.path.startsWith('/api/')) {
        res.status(404).json({ error: 'API端点未找到' });
        return;
    }
    
    // 直接使用client目录中的index.html
    const indexPath = path.join(clientDir, 'index.html');
    
    if (existsSync(indexPath)) {
        console.log(`📄 提供前端页面: ${indexPath}`);
        res.sendFile(indexPath, (err) => {
            if (err) {
                console.error('❌ 无法提供前端页面:', err);
                res.status(500).send('无法加载CryptoScan应用');
            }
        });
    } else {
        console.error('❌ 未找到index.html:', indexPath);
        res.status(404).send('找不到前端应用');
    }
});

// 全局错误处理
app.use((err, req, res, next) => {
    console.error('❌ 全局错误捕获:', err);
    res.status(500).json({
        error: 'Internal Server Error',
        message: process.env.NODE_ENV === 'development' ? err.message : '服务器内部错误'
    });
});

// 启动服务器
app.listen(PORT, '127.0.0.1', () => {
    console.log(`🚀 CryptoScan服务器已启动`);
    console.log(`🌐 访问地址: http://localhost:${PORT}`);
    console.log(`🔍 API健康检查: http://localhost:${PORT}/api/health`);
    console.log(`📊 项目主页: http://localhost:${PORT}`);
    console.log(`🔧 环境: development`);
    console.log('🔍 调试信息: 服务器配置为提供client目录下的静态文件');
});

// 错误处理
process.on('uncaughtException', (err) => {
    console.error('❌ 未捕获的异常:', err);
});

process.on('unhandledRejection', (reason) => {
    console.error('❌ 未处理的Promise拒绝:', reason);
});

export default app;