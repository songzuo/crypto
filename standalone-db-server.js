import express from 'express';
import postgres from 'postgres';

const app = express();
const PORT = 5005;
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://cry:csongzone@localhost:5432/cryptoscan';

console.log('🔄 启动独立数据库服务器...');
console.log('📊 数据库配置:');
console.log(`  - 数据库URL: ${DATABASE_URL}`);

// 配置中间件
app.use(express.json({ limit: '1mb' }));

// 尝试连接到PostgreSQL数据库
let sql = null;
let isConnected = false;

try {
    console.log('🔌 正在连接到PostgreSQL数据库...');
    // 使用更详细的连接选项
    sql = postgres(DATABASE_URL, {
        max: 10,
        idle_timeout: 30,
        connect_timeout: 5,
        ssl: false // 本地开发通常不需要SSL
    });
    
    // 测试连接
    const result = await sql`SELECT 1 as connected`;
    isConnected = true;
    console.log('✅ 数据库连接成功!');
    console.log('📊 连接测试结果:', result);
} catch (error) {
    console.error('❌ 数据库连接失败:', error.message);
    console.warn('⚠️  请检查数据库凭据是否正确');
    console.warn('⚠️  服务器将以有限功能模式运行，使用模拟数据');
}

// 健康检查端点
app.get('/api/health', async (req, res) => {
    try {
        let dbStatus = 'disconnected';
        let dbInfo = null;
        
        if (isConnected && sql) {
            const result = await sql`SELECT version() as pg_version`;
            dbStatus = 'connected';
            dbInfo = result[0]?.pg_version || 'unknown';
        }
        
        res.json({
            status: 'UP',
            database: {
                status: dbStatus,
                version: dbInfo
            },
            server: {
                port: PORT,
                timestamp: new Date().toISOString()
            }
        });
    } catch (error) {
        res.json({
            status: 'UP',
            database: {
                status: 'error',
                error: error.message
            },
            server: {
                port: PORT,
                timestamp: new Date().toISOString()
            }
        });
    }
});

// 获取加密货币列表（模拟数据）
app.get('/api/cryptocurrencies', (req, res) => {
    const limit = parseInt(req.query.limit) || 10;
    const mockCryptocurrencies = [
        { id: 1, name: 'Bitcoin', symbol: 'BTC', rank: 1 },
        { id: 2, name: 'Ethereum', symbol: 'ETH', rank: 2 },
        { id: 3, name: 'Solana', symbol: 'SOL', rank: 3 },
        { id: 4, name: 'Cardano', symbol: 'ADA', rank: 4 },
        { id: 5, name: 'Ripple', symbol: 'XRP', rank: 5 }
    ];
    res.json(mockCryptocurrencies.slice(0, limit));
});

// 获取AI洞察（模拟数据）
app.get('/api/ai-insights', (req, res) => {
    const limit = parseInt(req.query.limit) || 5;
    const mockInsights = [
        {
            id: 1,
            cryptocurrencyName: 'Bitcoin',
            symbol: 'BTC',
            insight: '比特币价格可能受宏观经济因素影响而波动',
            confidence: 0.85,
            createdAt: new Date().toISOString()
        },
        {
            id: 2,
            cryptocurrencyName: 'Ethereum',
            symbol: 'ETH',
            insight: '以太坊网络活动增加，可能预示价格上涨',
            confidence: 0.78,
            createdAt: new Date().toISOString()
        }
    ];
    res.json(mockInsights.slice(0, limit));
});

// 启动服务器
app.listen(PORT, () => {
    console.log(`🚀 独立数据库服务器已在 http://localhost:${PORT} 启动`);
    console.log(`🔍 健康检查: http://localhost:${PORT}/api/health`);
    console.log(`📊 加密货币API: http://localhost:${PORT}/api/cryptocurrencies`);
    console.log(`🧠 AI洞察API: http://localhost:${PORT}/api/ai-insights`);
});

// 优雅关闭
process.on('SIGINT', async () => {
    console.log('\n🔄 正在关闭服务器...');
    if (sql) {
        await sql.end();
        console.log('✅ 数据库连接已关闭');
    }
    console.log('✅ 服务器已关闭');
    process.exit(0);
});