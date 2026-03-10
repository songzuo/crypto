// 包装脚本来运行TypeScript服务器
import { execSync } from 'child_process';
import path from 'path';

try {
    console.log('Starting server with JavaScript wrapper...');
    const serverPath = path.join(process.cwd(), 'server', 'index.ts');
    console.log('Server path:', serverPath);
    
    // 使用execSync运行tsx，并捕获输出
    const output = execSync(`npx tsx "${serverPath}"`, {
        encoding: 'utf8',
        stdio: 'inherit' // 直接输出到控制台
    });
    
    console.log('Server output:', output);
} catch (error) {
    console.error('Error running server:', error.message);
    process.exit(1);
}