# CryptoScan 快速启动指南

## 🚀 一键启动（推荐）

### Windows用户
```bash
# 本地开发环境
start-local.bat

# 或使用Docker环境
start-docker.bat
```

### Linux/Mac用户
```bash
# 本地开发环境
./setup-dev.sh

# 或使用Docker环境
docker-compose up --build
```

## 📋 前置要求

### 本地开发
- ✅ Node.js 20+
- ✅ PostgreSQL 15+
- ✅ 编辑 `.env` 文件设置API密钥

### Docker开发
- ✅ Docker Desktop
- ✅ 编辑 `.env` 文件设置API密钥

## 🔧 环境配置

复制并编辑环境变量文件：
```bash
cp env.example .env
```

**必需配置：**
- `DATABASE_URL` - PostgreSQL连接字符串
- `OPENAI_API_KEY` - OpenAI API密钥

## 🌐 访问地址

启动成功后访问：
- **应用首页**: http://localhost:5000
- **API接口**: http://localhost:5000/api

## 🛠️ 常用命令

```bash
# 开发模式
npm run dev

# 构建项目
npm run build

# 启动生产版本
npm start

# 数据库迁移
npm run db:push

# 类型检查
npm run check
```

## 🐳 Docker命令

```bash
# 启动所有服务
docker-compose up -d

# 查看日志
docker-compose logs -f

# 停止服务
docker-compose down

# 重新构建
docker-compose up --build
```

## ❓ 遇到问题？

1. **端口被占用**: 更改 `.env` 中的 `PORT` 设置
2. **数据库连接失败**: 检查 `DATABASE_URL` 配置
3. **依赖安装失败**: 删除 `node_modules` 重新安装
4. **构建失败**: 运行 `npm run check` 检查类型错误

## 📚 详细文档

查看 `LOCAL_DEVELOPMENT.md` 获取完整的设置指南。
