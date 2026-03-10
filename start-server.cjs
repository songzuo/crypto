const { spawn } = require('child_process');
const path = require('path');

console.log('🚀 启动服务器中...');

// 使用完整路径启动服务器
const serverProcess = spawn('./node_modules/.bin/tsx.cmd', ['server/index.ts'], {
  stdio: 'inherit',
  cwd: __dirname,
  shell: true
});

serverProcess.on('error', (error) => {
  console.error('启动服务器失败:', error);
});

serverProcess.on('close', (code) => {
  console.log(`服务器进程退出，代码: ${code}`);
});