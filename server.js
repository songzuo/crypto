// 简化的JavaScript服务器
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';
import dotenv from 'dotenv';

// 加载环境变量
dotenv.config();

// 获取当前文件和目录路径
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 创建Express应用
const app = express();
const PORT = process.env.PORT || 5001;

// 日志环境变量
console.log('环境变量配置:');
console.log('PORT =', process.env.PORT || '默认5000');
console.log('NODE_ENV =', process.env.NODE_ENV || 'development');

// 配置静态文件服务 - 优先提供构建后的文件，回退到frontpage/client目录
const distDir = path.resolve(__dirname, './dist/public');
const clientDir = path.resolve(__dirname, './frontpage/client');
console.log('构建文件目录:', distDir);
console.log('开发文件目录:', clientDir);

// 优先提供构建后的静态文件
app.use(express.static(distDir, {
  // 设置正确的Content-Type
  setHeaders: (res, path) => {
    if (path.endsWith('.html')) {
      res.setHeader('Content-Type', 'text/html');
    } else if (path.endsWith('.js')) {
      res.setHeader('Content-Type', 'application/javascript');
    } else if (path.endsWith('.css')) {
      res.setHeader('Content-Type', 'text/css');
    }
  },
  // 启用缓存控制
  cacheControl: false
}));

// 如果没有构建文件，则提供开发文件
app.use(express.static(clientDir, {
  // 设置正确的Content-Type
  setHeaders: (res, path) => {
    if (path.endsWith('.html')) {
      res.setHeader('Content-Type', 'text/html');
    } else if (path.endsWith('.js') || path.endsWith('.ts') || path.endsWith('.tsx') || path.endsWith('.jsx')) {
      res.setHeader('Content-Type', 'application/javascript');
    } else if (path.endsWith('.css')) {
      res.setHeader('Content-Type', 'text/css');
    }
  },
  // 启用缓存控制
  cacheControl: false
}));

// 配置JSON解析
app.use(express.json({ limit: '1mb' }));

// 导入数据库模块
let dbModule;
try {
    dbModule = await import('./server/db.js');
    console.log('✅ 数据库模块加载成功');
} catch (error) {
    console.error('❌ 数据库模块加载失败:', error.message);
    dbModule = null;
}

// 健康检查端点
app.get('/api/health', (req, res) => {
    res.json({
        status: 'UP',
        message: '服务器运行正常',
        timestamp: new Date().toISOString()
    });
});

// API端点 - 加密货币数据
app.get('/api/cryptocurrencies', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 50;
        const sort = req.query.sort || 'rank';
        const order = req.query.order || 'ASC';
        
        if (dbModule && dbModule.getCryptocurrencies) {
            const result = await dbModule.getCryptocurrencies(page, limit, sort, order);
            res.json(result);
        } else {
            // 返回模拟数据
            res.json({
                data: [],
                total: 0
            });
        }
    } catch (error) {
        console.error('获取加密货币数据错误:', error);
        res.status(500).json({
            error: 'Internal Server Error',
            message: error.message
        });
    }
});

// API端点 - 爬虫状态
app.get('/api/crawler-status', async (req, res) => {
    try {
        if (dbModule && dbModule.getCrawlerStatus) {
            const result = await dbModule.getCrawlerStatus();
            res.json(result);
        } else {
            // 返回模拟数据
            res.json({
                webCrawlerActive: false,
                aiProcessorActive: false,
                blockchainSyncActive: false,
                lastUpdate: null,
                newEntriesCount: 0
            });
        }
    } catch (error) {
        console.error('获取爬虫状态错误:', error);
        res.status(500).json({
            error: 'Internal Server Error',
            message: error.message
        });
    }
});

// API端点 - 最近探索器
app.get('/api/recent-explorers', async (req, res) => {
    try {
        if (dbModule && dbModule.getRecentExplorers) {
            const result = await dbModule.getRecentExplorers();
            res.json(result);
        } else {
            // 返回模拟数据
            res.json([]);
        }
    } catch (error) {
        console.error('获取最近探索器错误:', error);
        res.status(500).json({
            error: 'Internal Server Error',
            message: error.message
        });
    }
});

// API端点 - AI洞察
app.get('/api/ai-insights', async (req, res) => {
    try {
        if (dbModule && dbModule.getAiInsights) {
            const result = await dbModule.getAiInsights();
            res.json(result);
        } else {
            // 返回模拟数据
            res.json({
                data: [],
                lastGenerated: null
            });
        }
    } catch (error) {
        console.error('获取AI洞察错误:', error);
        res.status(500).json({
            error: 'Internal Server Error',
            message: error.message
        });
    }
});

// API端点 - 自动完成
app.get('/api/autocomplete', async (req, res) => {
    try {
        const searchTerm = req.query.q || '';
        
        if (dbModule && dbModule.getAutocompleteSuggestions) {
            const result = await dbModule.getAutocompleteSuggestions(searchTerm);
            res.json(result);
        } else {
            // 返回模拟数据
            res.json([]);
        }
    } catch (error) {
        console.error('获取自动完成建议错误:', error);
        res.status(500).json({
            error: 'Internal Server Error',
            message: error.message
        });
    }
});

// API端点 - 比较数据
app.get('/api/compare', async (req, res) => {
    try {
        // 比较功能需要额外的参数处理
        res.json({
            data: [],
            message: 'API端点尚未完全实现'
        });
    } catch (error) {
        console.error('获取比较数据错误:', error);
        res.status(500).json({
            error: 'Internal Server Error',
            message: error.message
        });
    }
});

// API端点 - 统计数据
app.get('/api/stats', async (req, res) => {
    try {
        if (dbModule && dbModule.getStats) {
            const result = await dbModule.getStats();
            res.json(result);
        } else {
            // 返回模拟数据
            res.json({
                totalMarketCap: '$0',
                tradingVolume: '$0',
                total_blockchain_explorers: 0,
                trackedAssets: 0
            });
        }
    } catch (error) {
        console.error('获取统计数据错误:', error);
        res.status(500).json({
            error: 'Internal Server Error',
            message: error.message
        });
    }
});

// 根路径 - 返回前端应用
app.get('/', (req, res) => {
    const indexPath = path.join(clientDir, 'index.html');
    if (existsSync(indexPath)) {
        res.sendFile(indexPath);
    } else {
        // 如果frontpage/client中没有index.html，尝试使用frontpage中的index.html
        const frontpageIndexPath = path.join(path.resolve(__dirname, './frontpage'), 'index.html');
        if (existsSync(frontpageIndexPath)) {
            res.sendFile(frontpageIndexPath);
        } else {
            res.send('Crypto API服务器运行中');
        }
    }
});

// 前端路由处理 - 对于所有非API请求，返回index.html以支持前端路由
app.get('*', (req, res) => {
    // 跳过API路径
    if (req.path.startsWith('/api/')) {
        // 检查是否是已知的API端点
        const knownApiEndpoints = [
            '/api/health',
            '/api/cryptocurrencies',
            '/api/ai-insights',
            '/api/autocomplete',
            '/api/crawler-status',
            '/api/recent-explorers',
            '/api/compare',
            '/api/stats'
        ];
        
        // 如果是已知的API端点，返回200状态码和空数据（表示功能未实现但避免前端错误）
        if (knownApiEndpoints.includes(req.path)) {
            // 根据不同的API端点返回适当的空数据结构
            switch (req.path) {
                case '/api/cryptocurrencies':
                    return res.status(200).json({
                        data: [],
                        total: 0,
                        message: 'API端点尚未实现',
                        code: 'API_NOT_IMPLEMENTED'
                    });
                case '/api/crawler-status':
                    return res.status(200).json({
                        webCrawlerActive: false,
                        aiProcessorActive: false,
                        blockchainSyncActive: false,
                        lastUpdate: null,
                        newEntriesCount: 0,
                        message: 'API端点尚未实现',
                        code: 'API_NOT_IMPLEMENTED'
                    });
                case '/api/recent-explorers':
                    return res.status(200).json([]);
                case '/api/ai-insights':
                    return res.status(200).json({
                        data: [],
                        lastGenerated: null,
                        message: 'API端点尚未实现',
                        code: 'API_NOT_IMPLEMENTED'
                    });
                case '/api/autocomplete':
                    return res.status(200).json([]);
                case '/api/compare':
                    return res.status(200).json({
                        data: [],
                        message: 'API端点尚未实现',
                        code: 'API_NOT_IMPLEMENTED'
                    });
                case '/api/stats':
                    return res.status(200).json({
                        totalMarketCap: '$0',
                        tradingVolume: '$0',
                        total_blockchain_explorers: 0,
                        trackedAssets: 0,
                        message: 'API端点尚未实现',
                        code: 'API_NOT_IMPLEMENTED'
                    });
                default:
                    return res.status(200).json({
                        data: null,
                        message: 'API端点尚未实现',
                        code: 'API_NOT_IMPLEMENTED'
                    });
            }
        }
        
        // 其他API路径返回404
        return res.status(404).send('API路径未找到');
    }
    
    // 尝试提供请求的静态文件
    const requestedPath = path.join(clientDir, req.path);
    if (existsSync(requestedPath)) {
        return res.sendFile(requestedPath);
    }
    
    // 对于其他所有请求，返回index.html以支持前端路由
    const indexPath = path.join(clientDir, 'index.html');
    if (existsSync(indexPath)) {
        res.sendFile(indexPath);
    } else {
        // 如果frontpage/client中没有index.html，尝试使用frontpage中的index.html
        const frontpageIndexPath = path.join(path.resolve(__dirname, './frontpage'), 'index.html');
        if (existsSync(frontpageIndexPath)) {
            res.sendFile(frontpageIndexPath);
        } else {
            res.send('Crypto API服务器运行中');
        }
    }
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
    console.log(`服务器已在 http://localhost:${PORT} 启动`);
    console.log(`API健康检查地址: http://localhost:${PORT}/api/health`);
});

// 导出app以便测试（可选）
export default app;