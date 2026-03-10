-- 创建数据库表结构
-- 基于 shared/schema.ts 生成的SQL

-- 用户表
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL
);

-- 加密货币表
CREATE TABLE IF NOT EXISTS cryptocurrencies (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    symbol TEXT NOT NULL,
    slug TEXT NOT NULL,
    market_cap REAL,
    price REAL,
    volume_24h REAL,
    price_change_24h REAL,
    rank INTEGER,
    official_website TEXT,
    logo_url TEXT,
    last_updated TIMESTAMP DEFAULT NOW()
);

-- 区块链浏览器表
CREATE TABLE IF NOT EXISTS blockchain_explorers (
    id SERIAL PRIMARY KEY,
    cryptocurrency_id INTEGER NOT NULL,
    url TEXT NOT NULL,
    name TEXT NOT NULL,
    last_fetched TIMESTAMP DEFAULT NOW(),
    FOREIGN KEY (cryptocurrency_id) REFERENCES cryptocurrencies(id)
);

-- 指标表
CREATE TABLE IF NOT EXISTS metrics (
    id SERIAL PRIMARY KEY,
    cryptocurrency_id INTEGER NOT NULL,
    active_addresses INTEGER,
    total_transactions INTEGER,
    average_transaction_value REAL,
    hashrate TEXT,
    transactions_per_second REAL,
    metrics JSONB,
    last_updated TIMESTAMP DEFAULT NOW(),
    FOREIGN KEY (cryptocurrency_id) REFERENCES cryptocurrencies(id)
);

-- AI洞察表
CREATE TABLE IF NOT EXISTS ai_insights (
    id SERIAL PRIMARY KEY,
    cryptocurrency_id INTEGER,
    content TEXT NOT NULL,
    confidence REAL,
    created_at TIMESTAMP DEFAULT NOW(),
    FOREIGN KEY (cryptocurrency_id) REFERENCES cryptocurrencies(id)
);

-- 爬虫状态表
CREATE TABLE IF NOT EXISTS crawler_status (
    id SERIAL PRIMARY KEY,
    web_crawler_active BOOLEAN DEFAULT FALSE,
    ai_processor_active BOOLEAN DEFAULT FALSE,
    blockchain_sync_active BOOLEAN DEFAULT FALSE,
    last_update TIMESTAMP DEFAULT NOW(),
    new_entries_count INTEGER DEFAULT 0,
    last_breakthrough_attempt TIMESTAMP,
    breakthrough_count INTEGER DEFAULT 0,
    max_crypto_count INTEGER DEFAULT 0
);

-- 加密货币新闻表
CREATE TABLE IF NOT EXISTS crypto_news (
    id SERIAL PRIMARY KEY,
    title TEXT NOT NULL,
    url TEXT NOT NULL,
    summary TEXT,
    source TEXT,
    published_at TIMESTAMP DEFAULT NOW(),
    fetched_at TIMESTAMP DEFAULT NOW()
);

-- 交易量市值比率批次表
CREATE TABLE IF NOT EXISTS volume_to_market_cap_batches (
    id SERIAL PRIMARY KEY,
    created_at TIMESTAMP DEFAULT NOW(),
    entries_count INTEGER NOT NULL,
    has_changes BOOLEAN DEFAULT TRUE,
    previous_batch_id INTEGER
);

-- 交易量市值比率表
CREATE TABLE IF NOT EXISTS volume_to_market_cap_ratios (
    id SERIAL PRIMARY KEY,
    cryptocurrency_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    symbol TEXT NOT NULL,
    volume_7d REAL,
    market_cap REAL,
    volume_to_market_cap_ratio REAL NOT NULL,
    includes_futures BOOLEAN DEFAULT TRUE,
    rank INTEGER,
    timestamp TIMESTAMP DEFAULT NOW(),
    batch_id INTEGER NOT NULL,
    FOREIGN KEY (cryptocurrency_id) REFERENCES cryptocurrencies(id),
    FOREIGN KEY (batch_id) REFERENCES volume_to_market_cap_batches(id)
);

-- 技术分析批次表
CREATE TABLE IF NOT EXISTS technical_analysis_batches (
    id SERIAL PRIMARY KEY,
    created_at TIMESTAMP DEFAULT NOW(),
    entries_count INTEGER NOT NULL,
    timeframe TEXT NOT NULL,
    description TEXT,
    volume_ratio_batch_id INTEGER,
    FOREIGN KEY (volume_ratio_batch_id) REFERENCES volume_to_market_cap_batches(id)
);

-- 技术分析记录表
CREATE TABLE IF NOT EXISTS technical_analysis_entries (
    id SERIAL PRIMARY KEY,
    batch_id INTEGER NOT NULL,
    cryptocurrency_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    symbol TEXT NOT NULL,
    volume_to_market_cap_ratio REAL,
    volume_ratio_signal TEXT,
    rsi_value REAL,
    rsi_signal TEXT,
    rsi_data_start_time TIMESTAMP,
    rsi_data_end_time TIMESTAMP,
    macd_line REAL,
    signal_line REAL,
    histogram REAL,
    macd_signal TEXT,
    short_ema REAL,
    long_ema REAL,
    ema_signal TEXT,
    combined_signal TEXT NOT NULL,
    signal_strength INTEGER,
    recommendation_type TEXT,
    analysis_time TIMESTAMP DEFAULT NOW(),
    FOREIGN KEY (batch_id) REFERENCES technical_analysis_batches(id),
    FOREIGN KEY (cryptocurrency_id) REFERENCES cryptocurrencies(id)
);

-- 波动性分析批次表
CREATE TABLE IF NOT EXISTS volatility_analysis_batches (
    id SERIAL PRIMARY KEY,
    created_at TIMESTAMP DEFAULT NOW(),
    timeframe TEXT NOT NULL DEFAULT '24h',
    total_analyzed INTEGER DEFAULT 0,
    analysis_type TEXT DEFAULT 'volume_volatility',
    base_volume_ratio_batch_id INTEGER,
    comparison_volume_ratio_batch_id INTEGER,
    FOREIGN KEY (base_volume_ratio_batch_id) REFERENCES volume_to_market_cap_batches(id),
    FOREIGN KEY (comparison_volume_ratio_batch_id) REFERENCES volume_to_market_cap_batches(id)
);

-- 波动性分析条目表
CREATE TABLE IF NOT EXISTS volatility_analysis_entries (
    id SERIAL PRIMARY KEY,
    batch_id INTEGER NOT NULL,
    cryptocurrency_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    symbol TEXT NOT NULL,
    current_volume_ratio REAL,
    previous_volume_ratio REAL,
    volatility_score REAL,
    volatility_percentage REAL,
    volatility_direction TEXT,
    volatility_rank INTEGER,
    price_change_24h REAL,
    volume_change_24h REAL,
    market_cap_change_24h REAL,
    volatility_category TEXT,
    risk_level TEXT,
    analysis_time TIMESTAMP DEFAULT NOW(),
    FOREIGN KEY (batch_id) REFERENCES volatility_analysis_batches(id),
    FOREIGN KEY (cryptocurrency_id) REFERENCES cryptocurrencies(id)
);

-- 基础数据补充表 - 存储加密货币的详细基础数据
CREATE TABLE IF NOT EXISTS crypto_basic_data (
    id SERIAL PRIMARY KEY,
    cryptocurrency_id INTEGER NOT NULL,
    -- 价格变化数据
    price_change_7d REAL,           -- 7日涨跌
    price_change_30d REAL,           -- 30日涨跌
    price_change_60d REAL,           -- 60日涨跌
    price_change_90d REAL,           -- 90日涨跌
    price_change_180d REAL,          -- 半年涨跌
    price_change_1y REAL,           -- 一年涨跌
    
    -- 供应量数据
    circulating_supply REAL,          -- 流通供应量
    total_supply REAL,               -- 总供应量
    circulating_to_total_ratio REAL, -- 流通/总供应量比值
    
    -- 市值和交易量比率
    volume_to_market_cap_ratio REAL, -- Vol/Mkt Cap 比值
    market_cap_to_fdv REAL,          -- Market cap/FDV
    
    -- 交易深度数据
    order_book_depth REAL,           -- 订单簿深度（买卖盘前10档总深度）
    bid_ask_spread REAL,             -- 买卖价差（%）
    slippage_cost REAL,              -- 滑点成本（10万美元交易）
    
    -- 交易质量数据
    real_volume_ratio REAL,          -- 真实交易量比例（%）
    top_10_exchange_volume REAL,     -- 前10大交易所交易量（%）
    
    -- 经济指标
    annual_inflation_rate REAL,      -- 年通胀率
    locked_ratio REAL,               -- 锁仓比例
    
    -- 持有分布
    top_10_address_concentration REAL, -- 前10地址集中度（%）
    retail_holding_ratio REAL,       -- 散户持有比例（%）
    
    -- 链上活动
    daily_active_addresses INTEGER,  -- 日活跃地址数
    daily_transactions INTEGER,      -- 日交易笔数
    daily_gas_cost REAL,             -- 日均Gas费用消耗（美元）
    
    -- 开发活动
    monthly_commits INTEGER,         -- 月度代码提交次数
    developer_count INTEGER,         -- 开发者数量
    dependent_projects INTEGER,      -- 依赖项目数
    
    -- 财务指标
    price_to_sales_ratio REAL,       -- P/S比率
    
    -- 社交媒体活跃度
    twitter_engagement_rate REAL,    -- 推特互动率（%）
    discord_telegram_activity REAL, -- Discord/Telegram活跃度
    developer_forum_activity INTEGER, -- 开发者论坛活跃度
    
    -- 元数据
    data_source TEXT,                -- 数据来源
    last_updated TIMESTAMP DEFAULT NOW(),
    FOREIGN KEY (cryptocurrency_id) REFERENCES cryptocurrencies(id)
);

-- 仪表板配置表
CREATE TABLE IF NOT EXISTS dashboard_configs (
    id SERIAL PRIMARY KEY,
    user_id TEXT NOT NULL DEFAULT 'default',
    name TEXT NOT NULL DEFAULT 'Default Dashboard',
    is_default BOOLEAN DEFAULT FALSE,
    layout JSONB,
    widgets JSONB DEFAULT '[]',
    preferences JSONB,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- 创建索引以提高查询性能
CREATE INDEX IF NOT EXISTS idx_cryptocurrencies_symbol ON cryptocurrencies(symbol);
CREATE INDEX IF NOT EXISTS idx_cryptocurrencies_rank ON cryptocurrencies(rank);
CREATE INDEX IF NOT EXISTS idx_blockchain_explorers_crypto_id ON blockchain_explorers(cryptocurrency_id);
CREATE INDEX IF NOT EXISTS idx_metrics_crypto_id ON metrics(cryptocurrency_id);
CREATE INDEX IF NOT EXISTS idx_ai_insights_crypto_id ON ai_insights(cryptocurrency_id);
CREATE INDEX IF NOT EXISTS idx_volume_ratios_crypto_id ON volume_to_market_cap_ratios(cryptocurrency_id);
CREATE INDEX IF NOT EXISTS idx_volume_ratios_batch_id ON volume_to_market_cap_ratios(batch_id);
CREATE INDEX IF NOT EXISTS idx_technical_entries_batch_id ON technical_analysis_entries(batch_id);
CREATE INDEX IF NOT EXISTS idx_technical_entries_crypto_id ON technical_analysis_entries(cryptocurrency_id);
CREATE INDEX IF NOT EXISTS idx_volatility_entries_batch_id ON volatility_analysis_entries(batch_id);
CREATE INDEX IF NOT EXISTS idx_volatility_entries_crypto_id ON volatility_analysis_entries(cryptocurrency_id);
CREATE INDEX IF NOT EXISTS idx_crypto_basic_data_crypto_id ON crypto_basic_data(cryptocurrency_id);
CREATE INDEX IF NOT EXISTS idx_crypto_basic_data_last_updated ON crypto_basic_data(last_updated);
