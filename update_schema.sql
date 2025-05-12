-- 向crawler_status表添加新字段
ALTER TABLE crawler_status 
ADD COLUMN IF NOT EXISTS last_breakthrough_attempt TIMESTAMP,
ADD COLUMN IF NOT EXISTS breakthrough_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS max_crypto_count INTEGER DEFAULT 0;