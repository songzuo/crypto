// 全栈服务器 - 提供API和静态文件服务
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

// 获取当前文件和目录路径
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 创建Express应用
const app = express();
const PORT = process.env.PORT || 5001;

console.log('🚀 启动全栈服务器...');
console.log('环境变量配置:');
console.log('PORT =', process.env.PORT || '默认5000');
console.log('NODE_ENV =', process.env.NODE_ENV || 'development');

// 配置JSON解析
app.use(express.json({ limit: '1mb' }));

// 配置静态文件服务 - 提供构建后的前端文件
const staticDir = path.resolve(__dirname, 'dist/public');
console.log('静态文件目录:', staticDir);

app.use(express.static(staticDir, {
  // 设置正确的Content-Type
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html')) {
      res.setHeader('Content-Type', 'text/html');
    } else if (filePath.endsWith('.js')) {
      res.setHeader('Content-Type', 'application/javascript');
    } else if (filePath.endsWith('.css')) {
      res.setHeader('Content-Type', 'text/css');
    }
  },
  // 禁用缓存以方便开发
  cacheControl: false
}));

// API健康检查端点
app.get('/api/health', (req, res) => {
    res.json({
        status: 'UP',
        message: '全栈服务器运行正常',
        timestamp: new Date().toISOString()
    });
});

// 简单的数据库连接
import postgres from 'postgres';
const sql = postgres('postgresql://cry:ccsongzone@localhost:5432/cryptoscan');

// API路由 - 加密货币相关
app.get('/api/cryptocurrencies', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const sort = req.query.sort || 'rank';
        const order = req.query.order || 'asc';
        const offset = (page - 1) * limit;

        // 查询加密货币数据 - 使用简单的字符串拼接
        const orderClause = order === 'desc' ? 'DESC' : 'ASC';
        const validSorts = ['rank', 'symbol', 'name', 'market_cap', 'price', 'volume_24h'];
        const sortField = validSorts.includes(sort) ? sort : 'rank';

        const query = `
            SELECT id, symbol, name, rank, market_cap, price, volume_24h, price_change_24h
            FROM cryptocurrencies
            ORDER BY ${sortField} ${orderClause}
            LIMIT ${limit} OFFSET ${offset}
        `;

        const cryptocurrencies = await sql.unsafe(query);

        // 获取总数
        const totalResult = await sql`SELECT COUNT(*) as count FROM cryptocurrencies`;
        const total = parseInt(totalResult[0].count);
        const totalPages = Math.ceil(total / limit);

        res.json({
            cryptocurrencies: cryptocurrencies,
            pagination: { page, limit, total, totalPages },
            sort, order
        });
    } catch (error) {
        console.error('获取加密货币失败:', error);
        res.status(500).json({ error: error.message });
    }
});

// API路由 - 新闻相关
app.get('/api/news', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 20;

        // 直接查询数据库获取新闻
        const news = await sql`
            SELECT id, title, url, source, summary, published_at, fetched_at
            FROM crypto_news
            ORDER BY published_at DESC
            LIMIT ${limit}
        `;

        res.json({
            news: news,
            total: news.length
        });
    } catch (error) {
        console.error('获取新闻失败:', error);
        res.status(500).json({ error: error.message });
    }
});

// AI洞察API端点
app.get('/api/ai-insights', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 10;

        // 查询AI洞察数据
        const insights = await sql`
            SELECT id, cryptocurrency_id, content, confidence, created_at
            FROM ai_insights
            ORDER BY created_at DESC
            LIMIT ${limit}
        `;

        res.json({
            insights: insights,
            total: insights.length
        });
    } catch (error) {
        console.error('获取AI洞察失败:', error);
        res.status(500).json({ error: error.message });
    }
});

// 爬虫状态API端点
app.get('/api/crawler-status', async (req, res) => {
    try {
        // 查询爬虫状态
        const status = await sql`
            SELECT web_crawler_active, ai_processor_active, blockchain_sync_active, last_update, new_entries_count, breakthrough_count
            FROM crawler_status
            ORDER BY id DESC
            LIMIT 1
        `;

        res.json({
            status: status[0] || {
                web_crawler_active: false,
                ai_processor_active: false,
                blockchain_sync_active: false,
                last_update: null,
                new_entries_count: 0,
                breakthrough_count: 0
            }
        });
    } catch (error) {
        console.error('获取爬虫状态失败:', error);
        res.status(500).json({ error: error.message });
    }
});

// 最近浏览器数据API端点
app.get('/api/recent-explorers', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 20;

        // 查询区块链浏览器数据，关联加密货币名称
        const explorers = await sql`
            SELECT be.id, be.cryptocurrency_id, be.last_fetched, be.url, be.name, c.symbol, c.name as crypto_name
            FROM blockchain_explorers be
            LEFT JOIN cryptocurrencies c ON be.cryptocurrency_id = c.id
            ORDER BY be.last_fetched DESC
            LIMIT ${limit}
        `;

        res.json({
            explorers: explorers,
            total: explorers.length
        });
    } catch (error) {
        console.error('获取浏览器数据失败:', error);
        res.status(500).json({ error: error.message });
    }
});

// 自动完成API端点
app.get('/api/autocomplete', async (req, res) => {
    try {
        const query = req.query.q || '';
        const limit = parseInt(req.query.limit) || 10;

        if (!query) {
            return res.json({ suggestions: [] });
        }

        // 简单的自动完成查询
        const results = await sql`
            SELECT symbol, name
            FROM cryptocurrencies
            WHERE symbol ILIKE ${'%' + query + '%'} OR name ILIKE ${'%' + query + '%'}
            LIMIT ${limit}
        `;

        res.json({ suggestions: results });
    } catch (error) {
        console.error('自动完成失败:', error);
        res.status(500).json({ error: error.message });
    }
});

// 统计API端点
app.get('/api/stats', async (req, res) => {
    try {
        // 基本统计信息
        const stats = await sql`
            SELECT
                (SELECT COUNT(*) FROM cryptocurrencies) as total_cryptos,
                (SELECT COUNT(*) FROM crypto_news) as total_news,
                (SELECT COUNT(*) FROM ai_insights) as total_insights,
                (SELECT COUNT(*) FROM blockchain_explorers) as total_explorers
        `;

        const result = {
            total_cryptocurrencies: stats[0].total_cryptos,
            total_news: stats[0].total_news,
            total_ai_insights: stats[0].total_insights,
            total_blockchain_explorers: stats[0].total_explorers,
            last_updated: new Date().toISOString()
        };

        res.json(result);
    } catch (error) {
        console.error('获取统计失败:', error);
        res.status(500).json({ error: error.message });
    }
});

// 比较API端点
app.get('/api/compare', async (req, res) => {
    try {
        const symbols = req.query.symbols;
        if (!symbols || typeof symbols !== 'string') {
            return res.json({ error: '请提供symbols参数，如: ?symbols=bitcoin,ethereum' });
        }

        const symbolList = symbols.split(',').map(s => s.trim().toUpperCase());
        if (symbolList.length === 0 || symbolList.length > 5) {
            return res.json({ error: '请提供1-5个加密货币符号进行比较' });
        }

        // 构建查询条件 - 简化版本
        const conditions = symbolList.map((symbol, index) => `symbol = '${symbol}'`).join(' OR ');

        const cryptoData = await sql.unsafe(`
            SELECT symbol, name, price, market_cap, volume_24h, price_change_24h, rank
            FROM cryptocurrencies
            WHERE ${conditions}
        `);

        res.json({
            compared: cryptoData,
            count: cryptoData.length
        });
    } catch (error) {
        console.error('比较失败:', error);
        res.status(500).json({ error: error.message });
    }
});

// API测试端点
app.get('/api/test', (req, res) => {
    res.json({
        message: 'API测试成功',
        timestamp: new Date().toISOString(),
        database: 'connected'
    });
});

// 所有其他路由都返回前端index.html（支持React Router）
app.get('*', (req, res) => {
    const indexPath = path.join(staticDir, 'index.html');
    console.log(`请求路径: ${req.path}`);

    // 简单的缓存控制，防止Request aborted错误
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');

    res.sendFile(indexPath, (err) => {
        if (err) {
            console.error('发送index.html失败:', err);
            res.status(500).send('无法提供前端页面');
        } else {
            console.log(`成功提供前端页面: ${req.path}`);
        }
    });
});

// 全局错误处理
app.use((err, req, res, next) => {
    console.error('全局错误捕获:', err);
    res.status(500).json({
        error: 'Internal Server Error',
        message: err.message
    });
});

// 启动服务器
app.listen(PORT, () => {
    console.log(`✅ 全栈服务器已在 http://localhost:${PORT} 启动`);
    console.log(`🌐 前端界面地址: http://localhost:${PORT}`);
    console.log(`🔍 API健康检查地址: http://localhost:${PORT}/api/health`);
    console.log(`📡 API测试地址: http://localhost:${PORT}/api/test`);
});

export default app;