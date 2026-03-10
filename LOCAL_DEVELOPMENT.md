# CryptoScan 本地开发环境设置指南

## 概述

本指南将帮助您在本地环境中设置和运行CryptoScan项目，创建一个类似Replit的开发环境。

## 系统要求

### 必需软件
- **Node.js** (版本 20 或更高)
- **npm** (通常随Node.js一起安装)
- **PostgreSQL** (版本 15 或更高)
- **Git** (用于版本控制)

### 可选软件
- **Docker** 和 **Docker Compose** (用于容器化部署)
- **Redis** (用于缓存，可选)

## 快速开始

### 方法一：使用Docker (推荐)

1. **安装Docker和Docker Compose**
   - Windows: 下载并安装 [Docker Desktop](https://www.docker.com/products/docker-desktop/)
   - 确保Docker Desktop正在运行

2. **克隆项目并设置环境**
   ```bash
   # 复制环境变量文件
   cp env.example .env
   
   # 编辑.env文件，设置您的API密钥
   # 至少需要设置DATABASE_URL和OPENAI_API_KEY
   ```

3. **启动所有服务**
   ```bash
   docker-compose up -d
   ```

4. **访问应用**
   - 打开浏览器访问: http://localhost:5000
   - 应用将自动构建并启动

### 方法二：本地开发环境

1. **安装PostgreSQL**
   - Windows: 下载并安装 [PostgreSQL](https://www.postgresql.org/download/windows/)
   - 创建数据库: `cryptoscan`
   - 记录数据库连接信息

2. **设置项目**
   ```bash
   # Windows用户
   setup-dev.bat
   
   # Linux/Mac用户
   ./setup-dev.sh
   ```

3. **手动设置（如果脚本不工作）**
   ```bash
   # 安装依赖
   npm install
   
   # 复制环境变量文件
   cp env.example .env
   
   # 编辑.env文件
   # 设置DATABASE_URL为您的PostgreSQL连接字符串
   
   # 启动开发服务器
   npm run dev
   ```

## 环境变量配置

编辑 `.env` 文件，设置以下关键配置：

```env
# 数据库配置 (必需)
DATABASE_URL=postgresql://username:password@localhost:5432/cryptoscan

# OpenAI API配置 (必需)
OPENAI_API_KEY=your_openai_api_key_here

# 应用配置
NODE_ENV=development
PORT=5000

# 会话配置
SESSION_SECRET=your_random_secret_string

# 外部API配置 (可选，用于增强数据收集)
COINMARKETCAP_API_KEY=your_api_key
COINGECKO_API_KEY=your_api_key
CRYPTOCOMPARE_API_KEY=your_api_key
```

## 数据库设置

### 使用Docker PostgreSQL
Docker Compose会自动创建和配置PostgreSQL数据库。

### 使用本地PostgreSQL
1. 安装PostgreSQL
2. 创建数据库：
   ```sql
   CREATE DATABASE cryptoscan;
   ```
3. 运行数据库迁移：
   ```bash
   npm run db:push
   ```

## 开发命令

```bash
# 开发模式启动
npm run dev

# 构建生产版本
npm run build

# 启动生产版本
npm start

# 类型检查
npm run check

# 数据库迁移
npm run db:push
```

## 项目结构

```
CryptoScan/
├── client/                 # React前端应用
│   ├── src/
│   │   ├── components/     # React组件
│   │   ├── pages/         # 页面组件
│   │   ├── hooks/         # 自定义Hooks
│   │   └── lib/           # 工具库
│   └── index.html         # HTML模板
├── server/                # Express后端应用
│   ├── services/          # 业务逻辑服务
│   ├── routes.ts          # API路由
│   └── index.ts           # 服务器入口
├── shared/                # 共享类型和模式
├── docker-compose.yml     # Docker服务配置
├── Dockerfile            # Docker镜像配置
└── package.json          # 项目依赖和脚本
```

## 功能特性

### 数据收集
- 加密货币价格和市值数据
- 区块链指标和链上数据
- 新闻和社交媒体数据
- 技术分析指标

### 分析功能
- 波动性分析 (7天和30天)
- 技术分析 (RSI, MACD, EMA)
- 成交量与市值比率分析
- AI驱动的市场洞察

### 用户界面
- 响应式仪表板
- 实时数据更新
- 交互式图表
- 深色/浅色主题

## 故障排除

### 常见问题

1. **端口5000被占用**
   ```bash
   # 查找占用端口的进程
   netstat -ano | findstr :5000
   # 终止进程或更改PORT环境变量
   ```

2. **数据库连接失败**
   - 检查PostgreSQL是否正在运行
   - 验证DATABASE_URL配置
   - 确保数据库用户有适当权限

3. **依赖安装失败**
   ```bash
   # 清除npm缓存
   npm cache clean --force
   # 删除node_modules并重新安装
   rm -rf node_modules package-lock.json
   npm install
   ```

4. **构建失败**
   - 检查TypeScript错误: `npm run check`
   - 确保所有依赖都已安装
   - 检查环境变量配置

### 日志和调试

- 开发模式下，服务器日志会显示在控制台
- API请求日志包含响应时间和状态码
- 错误信息会显示详细的堆栈跟踪

## 部署到生产环境

### 使用Docker
```bash
# 构建并启动生产环境
docker-compose -f docker-compose.yml up -d
```

### 传统部署
```bash
# 构建应用
npm run build

# 设置生产环境变量
export NODE_ENV=production

# 启动应用
npm start
```

## 贡献指南

1. Fork项目
2. 创建功能分支
3. 提交更改
4. 推送到分支
5. 创建Pull Request

## 支持

如果您遇到问题：
1. 检查本指南的故障排除部分
2. 查看项目的GitHub Issues
3. 创建新的Issue并提供详细信息

---

**注意**: 这是一个加密货币数据分析平台，需要稳定的网络连接来获取实时数据。某些功能可能需要外部API密钥才能正常工作。
