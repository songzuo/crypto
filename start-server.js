import { spawn } from 'child_process';

console.log('🎯 启动脚本开始执行');

// 直接使用绝对路径运行tsx
const serverProcess = spawn(
  'npx',
  ['tsx', 'server/index.ts'],
  {
    cwd: 'e:/Crypto',
    stdio: 'inherit',
    shell: true,
    env: { ...process.env, NODE_ENV: 'development' }
  }
);

serverProcess.on('error', (error) => {
  console.error('❌ 启动进程出错:', error);
});

serverProcess.on('exit', (code) => {
  console.log(`🚪 服务器进程退出，退出码: ${code}`);
});

console.log('🔄 服务器启动中...');