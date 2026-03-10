# VINE历史数据采集系统 - 独立版本

这是一个独立的VINE历史数据采集系统，从主项目中分离出来，便于单独测试和开发。

## 功能特性

- ✅ 24小时不间断数据采集
- ✅ 实时进度监控
- ✅ AI辅助数据验证
- ✅ 多源数据采集（模拟）
- ✅ 数据修复功能
- ✅ 响应式用户界面

## 快速开始

### 1. 安装依赖

```bash
cd vine-standalone
npm install
```

### 2. 启动后端服务

```bash
npm run server
```

后端服务将在 http://localhost:5000 启动

### 3. 启动前端应用

```bash
npm run dev
```

前端应用将在 http://localhost:5178 启动

## 项目结构

```
vine-standalone/
├── src/
│   ├── components/
│   │   └── VINEHistoricalData.tsx    # 主界面组件
│   ├── App.tsx                       # 应用入口
│   ├── main.tsx                      # 渲染入口
│   └── index.css                     # 样式文件
├── server/
│   └── index.js                      # 后端API服务
├── package.json                      # 依赖配置
├── vite.config.ts                   # Vite配置
├── tailwind.config.js               # Tailwind配置
└── tsconfig.json                    # TypeScript配置
```

## API接口

### 获取进度
```http
GET /api/vine/progress
```

### 开始采集
```http
POST /api/vine/collect
Content-Type: application/json

{
  "symbol": "VINE"
}
```

### 停止采集
```http
POST /api/vine/stop
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

## 使用说明

1. **启动系统**：先启动后端服务，再启动前端应用
2. **开始采集**：在界面中输入币种符号，点击"开始采集"
3. **监控进度**：实时查看采集进度和状态
4. **数据管理**：支持停止、重置、修复等操作

## 技术栈

- **前端**：React 18 + TypeScript + Vite
- **样式**：Tailwind CSS
- **状态管理**：TanStack Query
- **图标**：Lucide React
- **后端**：Node.js + Express

## 开发说明

- 当前版本为模拟版本，数据采集为模拟过程
- 可以轻松集成真实的数据采集API
- 支持多币种采集（修改symbol参数）
- 响应式设计，支持移动端访问

## 部署

### 开发环境
```bash
npm run dev
```

### 生产构建
```bash
npm run build
npm run preview
```