// 简单的Express测试服务器
import express from 'express';
const app = express();
const PORT = 5001;

console.log('开始启动测试服务器...');

app.get('/', (req, res) => {
  res.send('测试服务器运行正常！');
});

const server = app.listen(PORT, '127.0.0.1', () => {
  console.log(`测试服务器已在 http://localhost:${PORT} 启动`);
});

server.on('error', (err) => {
  console.error('服务器错误:', err);
});

// 捕获所有错误
process.on('uncaughtException', (err) => {
  console.error('未捕获的异常:', err);
});

process.on('unhandledRejection', (reason) => {
  console.error('未处理的Promise拒绝:', reason);
});

console.log('测试服务器初始化完成');