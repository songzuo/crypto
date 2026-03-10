# 网页爬虫系统

## 概述

这是一个专业的加密货币网页爬虫系统，使用Playwright浏览器自动化工具，支持多个加密货币网站的轮换爬取，具备反爬虫策略和人类行为模拟功能。

## 功能特性

### 🚀 核心功能
- **浏览器自动化**: 使用Playwright进行真实的浏览器操作
- **网站轮换**: 支持多个加密货币网站的轮换爬取
- **反爬虫策略**: 随机延迟、人类行为模拟、用户代理轮换
- **数据提取**: 自动提取币种名称、价格、市值、交易量等数据
- **实时状态**: 提供详细的爬虫状态和进度信息

### 🌐 支持的网站
1. **CoinMarketCap** - 全球最大的加密货币数据平台
2. **CoinGecko** - 独立的加密货币数据聚合器
3. **CoinRanking** - 加密货币排名和价格数据
4. **Crypto.com** - 全球领先的加密货币交易所
5. **Coinbase** - 美国最大的加密货币交易所

### 📊 爬取的数据项（30项）

#### 价格变化数据（6项）
- 7日、30日、60日、90日价格变化
- 半年、一年价格变化

#### 供应量数据（3项）
- 流通供应量、总供应量
- 流通/总供应量比值

#### 链上活动（3项）
- 日活跃地址数、日交易笔数
- Gas费用消耗、地址集中度

#### 开发活动（3项）
- 月度代码提交次数
- 开发者数量、依赖项目数

#### 交易数据（5项）
- 订单簿深度、买卖价差
- 滑点成本、真实交易量比例
- 前10大交易所交易量

#### 经济指标（2项）
- 年通胀率、锁仓比例

#### 持有分布（2项）
- 前10地址集中度、散户持有比例

#### 财务指标（1项）
- P/S比率

#### 社交媒体活跃度（3项）
- 推特互动率
- Discord/Telegram活跃度
- 开发者论坛活跃度

## 技术架构

### 后端服务
- **文件位置**: `server/services/webScraper.ts`
- **API路由**: `/api/web-scraper/*`
- **数据库**: 更新到现有的`cryptocurrencies`表

### 前端界面
- **页面路径**: `/web-scraper`
- **组件文件**: `client/src/pages/WebScraper.tsx`
- **菜单项**: 已添加到侧边栏导航

## API接口

### 启动爬虫
```http
POST /api/web-scraper/start
```

### 停止爬虫
```http
POST /api/web-scraper/stop
```

### 获取状态
```http
GET /api/web-scraper/status
```

### 重置状态
```http
POST /api/web-scraper/reset
```

### 测试单个网站
```http
POST /api/web-scraper/test-website
Content-Type: application/json

{
  "websiteName": "CoinMarketCap"
}
```

## 使用方法

### 1. 启动服务器
```bash
npm run dev
```

### 2. 访问网页爬虫页面
打开浏览器访问: `http://localhost:5000/web-scraper`

### 3. 操作步骤
1. **开始爬取**: 点击"开始爬取"按钮启动爬虫
2. **查看进度**: 实时查看爬虫状态和进度
3. **测试网站**: 选择单个网站进行测试
4. **停止爬取**: 随时停止正在运行的爬虫

## 反爬虫策略

### 1. 随机延迟
- 请求间随机延迟2-5秒
- 网站间延迟5-10秒

### 2. 人类行为模拟
- 随机鼠标移动
- 模拟滚动操作
- 随机视口大小

### 3. 用户代理轮换
- 使用真实的浏览器用户代理
- 模拟不同操作系统

### 4. 网站轮换
- 自动轮换不同网站
- 避免单一网站压力过大

## 配置说明

### 网站配置
在`server/services/webScraper.ts`中的`WEBSITES`数组配置网站信息：

```typescript
const WEBSITES = [
  {
    name: 'CoinMarketCap',
    url: 'https://coinmarketcap.com/all/views/all/',
    selectors: {
      table: 'table[data-testid="cryptocurrency-table"]',
      rows: 'tbody tr',
      name: 'td:nth-child(3) p[data-testid="name"]',
      symbol: 'td:nth-child(3) p[data-testid="symbol"]',
      price: 'td:nth-child(4) span',
      marketCap: 'td:nth-child(5) span',
      volume: 'td:nth-child(6) span',
      change24h: 'td:nth-child(7) span'
    }
  }
  // ... 更多网站配置
];
```

### 浏览器配置
```typescript
browser = await chromium.launch({
  headless: true,
  args: [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-accelerated-2d-canvas',
    '--no-first-run',
    '--no-zygote',
    '--disable-gpu'
  ]
});
```

## 状态监控

### 爬虫状态
- `isRunning`: 是否正在运行
- `currentWebsite`: 当前爬取的网站
- `processedCoins`: 已处理的币种数量
- `totalCoins`: 总币种数量
- `errors`: 错误信息列表

### 进度显示
- 实时进度百分比
- 当前处理的币种
- 运行时间统计
- 错误信息展示

## 注意事项

1. **网络要求**: 需要稳定的网络连接
2. **资源消耗**: 浏览器自动化会消耗较多内存
3. **频率控制**: 避免过于频繁的请求
4. **数据更新**: 爬取的数据会实时更新到数据库

## 故障排除

### 常见问题
1. **浏览器启动失败**: 检查Playwright是否正确安装
2. **页面加载超时**: 检查网络连接和网站可访问性
3. **数据提取失败**: 检查CSS选择器是否正确

### 调试方法
1. 使用测试功能验证单个网站
2. 查看控制台错误信息
3. 检查网络请求状态

## 扩展功能

### 添加新网站
1. 在`WEBSITES`数组中添加新配置
2. 更新前端选择器选项
3. 测试新网站的数据提取

### 自定义数据项
1. 修改数据提取逻辑
2. 更新数据库表结构
3. 调整前端显示

## 安全考虑

1. **请求频率**: 控制请求频率避免被封
2. **数据验证**: 验证提取数据的有效性
3. **错误处理**: 完善的错误处理和恢复机制
4. **日志记录**: 记录爬虫运行日志

## 性能优化

1. **并发控制**: 限制同时运行的浏览器实例
2. **内存管理**: 及时关闭浏览器实例
3. **数据缓存**: 避免重复爬取相同数据
4. **断点续传**: 支持爬虫中断后继续

---

**开发完成时间**: 2024年12月
**技术栈**: Playwright + TypeScript + React + Express
**数据库**: PostgreSQL + Drizzle ORM
