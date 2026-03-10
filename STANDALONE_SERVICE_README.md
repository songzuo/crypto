# 独立加密货币数据服务

这是一个独立的加密货币数据采集服务，使用真实API数据源，不依赖模拟数据。

## 功能特性

- ✅ **真实API数据源**: 使用CoinMarketCap、CoinGecko、CryptoCompare等真实API
- ✅ **多数据源聚合**: 自动聚合多个API源的数据，提高数据可靠性
- ✅ **独立运行**: 不依赖主项目的数据库和复杂配置
- ✅ **简单易用**: 一键启动，提供清晰的API接口
- ✅ **错误处理**: 完善的错误处理和重试机制

## 快速开始

### 1. 启动服务

#### 方法一：使用批处理文件 (Windows)
```bash
start-standalone.bat
```

#### 方法二：使用PowerShell脚本
```powershell
.\start-standalone.ps1
```

#### 方法三：直接运行
```bash
node --loader tsx standalone-service.ts
```

### 2. 验证服务

服务启动后，访问以下地址：
- **服务主页**: http://localhost:5001
- **健康检查**: http://localhost:5001/api/health
- **数据端点**: http://localhost:5001/api/data

### 3. 测试API

运行测试脚本验证服务功能：
```bash
node test-standalone.js
```

## API接口

### 根端点
- **GET** `/`
  - 返回服务信息和可用端点

### 健康检查
- **GET** `/api/health`
  - 返回服务状态信息

### 数据源信息
- **GET** `/api/sources`
  - 返回可用的数据源信息

### 加密货币数据
- **GET** `/api/data`
  - **参数**: 
    - `limit` (可选): 返回的加密货币数量，默认50
  - **返回**: 实时加密货币数据

## 数据源配置

### 支持的API数据源

1. **CoinMarketCap** (推荐)
   - 状态: 需要API密钥
   - 配置: 在`.env`文件中设置`COINMARKETCAP_API_KEY`

2. **CoinGecko**
   - 状态: 免费使用
   - 配置: 无需API密钥

3. **CryptoCompare**
   - 状态: 免费使用，支持API密钥
   - 配置: 可选设置`CRYPTOCOMPARE_API_KEY`

### 环境变量配置

编辑`.env`文件，添加以下配置：

```env
# 外部API配置（可选）
COINMARKETCAP_API_KEY=your_coinmarketcap_api_key_here
COINGECKO_API_KEY=your_coingecko_api_key_here
CRYPTOCOMPARE_API_KEY=your_cryptocompare_api_key_here
```

**注意**: 即使没有配置API密钥，服务也会使用免费的API源正常运行。

## 数据格式

### 返回数据示例

```json
{
  "success": true,
  "timestamp": "2025-01-25T10:30:00.000Z",
  "count": 50,
  "data": [
    {
      "name": "Bitcoin",
      "symbol": "BTC",
      "marketCap": 1000000000000,
      "volume24h": 50000000000,
      "price": 50000,
      "source": "CoinMarketCap"
    }
  ]
}
```

## 技术架构

### 核心组件

1. **Express服务器**: 提供RESTful API接口
2. **多API聚合器**: 并行调用多个加密货币API
3. **数据合并逻辑**: 智能合并不同API源的数据
4. **错误处理机制**: 自动重试和降级处理

### 数据流

```
用户请求 → Express服务器 → 多API并行调用 → 数据聚合 → 返回结果
```

## 故障排除

### 常见问题

1. **端口占用错误**
   - 解决方案: 修改`standalone-service.ts`中的端口号

2. **API调用失败**
   - 检查网络连接
   - 验证API密钥配置
   - 查看控制台错误信息

3. **依赖包问题**
   - 运行`npm install`重新安装依赖

### 日志信息

服务启动时会显示详细的日志信息，包括：
- 环境变量检查
- API数据源状态
- 服务启动状态
- 错误和警告信息

## 开发说明

### 添加新的数据源

1. 在`standalone-service.ts`中添加新的API调用函数
2. 在`aggregateCryptoData`函数中添加新的数据源
3. 更新API路由和文档

### 扩展功能

- 添加数据缓存机制
- 支持更多加密货币指标
- 添加WebSocket实时数据推送
- 支持历史数据查询

## 许可证

MIT License