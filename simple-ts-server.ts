// 简化的TypeScript测试服务器
import express from 'express';
const app = express();
const PORT = 5004;

console.log('开始启动TypeScript测试服务器(5004)...');

app.get('/', (req, res) => {
  console.log('接收到健康检查请求');
  res.send('TypeScript测试服务器(端口5004)运行正常！');
});

app.get('/api/health', (req, res) => {
  console.log('接收到API健康检查请求');
  res.json({ status: 'healthy', port: PORT, message: 'TypeScript API服务正常' });
});

const server = app.listen(PORT, '127.0.0.1', () => {
  console.log(`TypeScript测试服务器已在 http://localhost:${PORT} 启动`);
  console.log(`API健康检查地址: http://localhost:${PORT}/api/health`);
});

server.on('error', (err) => {
  console.error('服务器错误:', err);
});

process.on('uncaughtException', (err) => {
  console.error('未捕获的异常:', err);
});

process.on('unhandledRejection', (reason) => {
  console.error('未处理的Promise拒绝:', reason);
});

console.log('TypeScript测试服务器初始化完成');
console.log('服务器将持续运行...');