# VINE历史数据采集系统

## 系统概述

VINE历史数据采集系统是一个专门用于采集、验证和存储加密货币历史数据的完整解决方案。系统支持24小时不间断采集，多源数据验证，AI辅助数据增强，以及实时进度监控。

## 核心功能

### 1. 多源数据采集
- **10+种采集方法**：集成CoinGecko、CoinMarketCap、Binance等主流数据源
- **智能轮换策略**：自动切换API源避免限制
- **优先级管理**：根据数据质量自动选择最佳数据源

### 2. AI辅助验证
- **智谱AI集成**：使用GLM-4.6模型进行数据验证
- **多源数据对比**：自动对比不同数据源的一致性
- **异常检测**：识别价格异常、成交量异常等
- **数据增强**：补充技术指标和市场分析

### 3. 实时进度监控
- **可视化进度条**：实时显示采集进度
- **详细日志记录**：记录每个步骤的执行情况
- **自动恢复**：支持断点续传

### 4. 数据完整性保证
- **24小时不间断采集**：确保数据连续性
- **自动修复机制**：检测并修复缺失数据
- **多版本备份**：防止数据丢失

## 系统架构

### 后端服务
- **`vineHistoricalDataCollector.ts`**：核心采集服务
- **`aiDataValidator.ts`**：AI验证服务
- **API路由**：提供RESTful接口

### 前端界面
- **`VINEHistoricalData.tsx`**：用户界面组件
- **实时监控面板**：进度展示和控制
- **数据可视化**：图表展示历史数据

### 数据存储
- **JSON文件存储**：`./vine/`目录下
- **结构化格式**：包含完整的历史数据
- **元数据管理**：记录数据来源和验证状态

## 使用方法

### 1. 启动系统
```bash
# 启动开发服务器
npm run dev
```

### 2. 访问界面
打开浏览器访问：`http://localhost:5173/vine-historical-data`

### 3. 开始采集
1. 在界面中输入币种符号（默认：VINE）
2. 点击"开始采集"按钮
3. 系统将自动开始24小时不间断采集

### 4. 监控进度
- 查看实时进度条
- 监控当前采集步骤
- 查看已采集数据量

### 5. 数据管理
- **查看数据**：浏览已采集的历史数据
- **修复数据**：自动检测并修复问题数据
- **导出数据**：支持JSON格式导出

## API接口

### 开始采集
```http
POST /api/vine/collect
Content-Type: application/json

{
  "symbol": "VINE"
}
```

### 获取进度
```http
GET /api/vine/progress
```

### 重置进度
```http
POST /api/vine/reset
```

### 数据修复
```http
POST /api/vine/repair
Content-Type: application/json

{
  "symbol": "VINE"
}
```

### 获取数据
```http
GET /api/vine/data?symbol=VINE&startDate=2023-01-01&endDate=2023-12-31
```

## 数据格式

### 历史数据结构
```json
{
  "symbol": "VINE",
  "name": "VINE",
  "timestamp": "2023-01-01T00:00:00.000Z",
  "date": "2023-01-01",
  "open": 1.2345,
  "high": 1.5678,
  "low": 1.1234,
  "close": 1.4567,
  "volume": 1000000,
  "marketCap": 50000000,
  "source": "CoinGecko",
  "verified": true,
  "aiEnhanced": true
}
```

## 配置说明

### AI配置
```typescript
const ZHIPU_API_KEY = 'f5e44c5c0001420598434ca9ff50a0df.LC9gVloXbGexZeBa';
const ZHIPU_API_URL = 'https://open.bigmodel.cn/api/paas/v4/chat/completions';
```

### 数据源配置
系统预配置了10+个数据源，包括：
- CoinGecko API
- CoinMarketCap API  
- Binance API
- 其他主流交易所API

## 故障排除

### 常见问题

1. **API限制错误**
   - 系统会自动切换数据源
   - 增加延迟避免频率限制

2. **网络连接问题**
   - 自动重试机制
   - 连接超时处理

3. **数据验证失败**
   - 使用AI辅助验证
   - 多源数据对比

### 日志查看
系统会在控制台输出详细日志，包括：
- 采集进度
- API调用状态
- 数据验证结果
- 错误信息

## 扩展功能

### 支持多币种
修改`symbol`参数即可采集其他币种：
- BTC, ETH, BNB等主流币种
- 自定义币种符号

### 自定义时间范围
支持指定采集的时间范围：
- 从币种创建日期开始
- 自定义开始和结束日期

### 批量操作
支持批量采集多个币种：
- 并行采集提高效率
- 统一进度监控

## 性能优化

### 内存管理
- 分页加载大数据集
- 流式处理避免内存溢出

### 网络优化
- 连接池复用
- 请求合并减少API调用

### 存储优化
- 增量更新避免重复数据
- 压缩存储节省空间

## 安全考虑

### API密钥保护
- 环境变量存储敏感信息
- 密钥轮换机制

### 数据安全
- 本地存储避免数据泄露
- 访问权限控制

### 网络安全
- HTTPS加密传输
- 请求签名验证

## 部署说明

### 开发环境
```bash
npm install
npm run dev
```

### 生产环境
```bash
npm run build
npm start
```

### Docker部署
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build
EXPOSE 5000
CMD ["npm", "start"]
```

## 维护指南

### 日常维护
- 监控系统运行状态
- 检查数据完整性
- 更新API密钥

### 数据备份
- 定期备份数据文件
- 版本控制管理

### 系统更新
- 定期更新依赖包
- 优化采集策略

## 技术支持

如有问题请联系：
- 查看系统日志
- 检查API连接
- 验证数据源配置

---

**注意**：本系统需要稳定的网络连接和有效的API密钥才能正常运行。