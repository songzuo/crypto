-- CryptoScan 数据库初始化脚本
-- 这个脚本会在Docker容器启动时自动执行

-- 创建数据库（如果不存在）
-- 注意：在Docker环境中，数据库通常已经创建

-- 设置时区
SET timezone = 'UTC';

-- 创建扩展（如果需要）
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 这里可以添加其他初始化SQL语句
-- 例如：创建索引、设置权限等

-- 输出初始化完成信息
DO $$
BEGIN
    RAISE NOTICE 'CryptoScan 数据库初始化完成';
END $$;
