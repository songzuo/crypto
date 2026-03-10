# Crypto - 加密货币分析平台

## 项目简介

一个功能完整的加密货币分析平台，提供技术分析、波动率分析、新闻爬取和多 API 聚合功能。

## 核心功能

- 📊 **技术分析** - K 线图表、指标分析、趋势预测
- 📈 **波动率分析** - 实时波动率计算、风险评估
- 📰 **新闻爬取** - 自动抓取加密货币相关新闻
- 🔌 **多 API 聚合** - 整合多个交易所和行情 API

## 技术栈

**前端**
- React 18 + Vite
- Tailwind CSS
- TypeScript

**后端**
- Express.js
- PostgreSQL (Drizzle ORM)
- Node.js

## 快速开始

### 安装依赖

```bash
npm install
```

### 配置环境

```bash
# 复制环境配置示例
cp .env.example .env

# 编辑 .env 文件，配置数据库和 API 密钥
```

### 运行项目

```bash
# 开发模式
npm run dev

# 构建生产版本
npm run build

# 启动生产服务
npm start

# 数据库迁移
npm run db:push
```

## 项目结构

```
Crypto/
├── client/          # React 前端
├── server/          # Express 后端服务
├── shared/          # 共享类型和工具
└── database/        # 数据库脚本
```

## 注意事项

⚠️ 投资有风险，入市需谨慎  
⚠️ 本工具仅供学习研究使用

---

*最后更新：2026-03-09*
