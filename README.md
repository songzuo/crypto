# Crypto - 加密货币交易与分析系统

## 项目概述

加密货币交易机器人、数据分析工具和相关基础设施的集合。

## 主要功能

- 🤖 自动化交易策略 (freqtrade)
- 📊 市场数据分析
- 🔍 信号生成与回测
- 💰 多交易所支持

## 技术栈

- Python
- Freqtrade
- PostgreSQL
- Docker

## 快速开始

```bash
# 克隆仓库
git clone <repo-url>
cd Crypto

# 安装依赖
pip install -r requirements.txt

# 配置环境变量
cp .env.example .env

# 启动服务
docker-compose up -d
```

## 项目结构

```
Crypto/
├── freqtrade/          # 交易机器人配置
├── strategies/         # 交易策略
├── data/              # 市场数据
├── notebooks/         # 分析笔记本
└── scripts/           # 工具脚本
```

## 相关项目

- [iflow](../iflow) - 主工作流系统
- [api3](../api3) - API 探针服务

## 状态

🟡 开发中

## 注意事项

- 交易有风险，投资需谨慎
- 建议在测试环境充分验证策略
- 定期备份配置和数据

---

*最后更新：2026-03-09*
*由 ClawX 自主创建*
