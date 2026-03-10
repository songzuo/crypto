import express from 'express';
import { db } from './server/db.js';
import { registerRoutes } from './server/routes.js';

console.log('🔄 启动真实服务器，连接数据库...');
const app = express();
const PORT = process.env.PORT || 5000;

// 配置中间件
app.use(express.json({ limit: '1mb' }));

// 打印数据库连接状态
console.log('📊 数据库状态检查:');
console.log('  - 数据库URL:', process.env.DATABASE_URL ? '✅ 已设置' : '❌ 未设置');

// 健康检查端点
app.get('/api/health', (req, res) => {
    res.json({
        status: 'UP',
        database: db ? 'connected' : 'disconnected',
        timestamp: new Date().toISOString()
    });
});

// 尝试注册所有路由
try {
    console.log('🔧 注册API路由...');
    registerRoutes(app);
    console.log('✅ API路由注册完成');
} catch (error) {
    console.error('❌ 路由注册失败:', error);
}

// 启动服务器
app.listen(PORT, () => {
    console.log(`🚀 真实服务器已在 http://localhost:${PORT} 启动`);
    console.log(`🔍 健康检查: http://localhost:${PORT}/api/health`);
});

export default app;