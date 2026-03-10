import express from 'express';

console.log('🎯 简化服务器开始执行');
console.log('🔍 环境变量NODE_ENV:', process.env.NODE_ENV || '未设置');

const app = express();
const PORT = 5000;

// 健康检查端点
app.get('/', (req, res) => {
  res.status(200).json({ status: 'ok', message: '服务器运行正常' });
});

// 启动服务器
const server = app.listen(PORT, '127.0.0.1', () => {
  console.log(`🎉 服务器成功启动，监听端口 ${PORT}`);
  console.log(`🌐 可访问地址: http://localhost:${PORT}`);
});

// 错误处理
server.on('error', (err) => {
  console.error('❌ 服务器错误:', err);
});

console.log('⚡ 服务器启动中...');