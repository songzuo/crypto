#!/bin/bash

echo "正在设置CryptoScan本地开发环境..."

# 检查Node.js是否已安装
if ! command -v node &> /dev/null; then
    echo "错误: 请先安装Node.js (https://nodejs.org/)"
    exit 1
fi

# 检查npm是否已安装
if ! command -v npm &> /dev/null; then
    echo "错误: npm未找到，请重新安装Node.js"
    exit 1
fi

echo "正在安装项目依赖..."
npm install

# 复制环境变量文件
if [ ! -f .env ]; then
    cp env.example .env
    echo "已创建.env文件，请编辑其中的配置"
fi

echo "正在检查数据库连接..."
echo "请确保PostgreSQL数据库正在运行"

echo "正在启动开发服务器..."
echo "应用将在 http://localhost:5000 运行"
echo "按Ctrl+C停止服务器"

npm run dev
