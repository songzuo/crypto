// 数据库连接模块
import pg from 'pg';
import dotenv from 'dotenv';

// 加载环境变量
dotenv.config();

// 创建PostgreSQL连接池
const { Pool } = pg;

// 从环境变量获取数据库URL
const DATABASE_URL = process.env.DATABASE_URL;

console.log('数据库URL状态:', DATABASE_URL ? '已设置' : '未设置');

let pool = null;

// 如果设置了数据库URL，创建连接池
if (DATABASE_URL) {
    try {
        pool = new Pool({
            connectionString: DATABASE_URL,
            ssl: false // 禁用SSL连接
        });
        
        console.log('✅ PostgreSQL数据库连接池创建成功');
    } catch (error) {
        console.error('❌ PostgreSQL数据库连接池创建失败:', error.message);
    }
} else {
    console.warn('⚠️  数据库URL未设置，将使用模拟数据');
}

// 查询数据库的函数
const queryDatabase = async (text, params = []) => {
    if (!pool) {
        throw new Error('数据库连接池未初始化');
    }
    
    try {
        const result = await pool.query(text, params);
        return result;
    } catch (error) {
        console.error('数据库查询错误:', error);
        throw error;
    }
};

// 获取加密货币数据
export const getCryptocurrencies = async (page = 1, limit = 50, sort = 'rank', order = 'ASC') => {
    if (!pool) {
        // 返回模拟数据
        return {
            data: [],
            total: 0
        };
    }
    
    try {
        // 构建排序字段映射
        const sortFields = {
            'rank': 'rank',
            'name': 'name',
            'price': 'price',
            'priceChange24h': 'price_change_24h',
            'marketCap': 'market_cap',
            'volume24h': 'volume_24h'
        };
        
        const sortField = sortFields[sort] || 'rank';
        const sortOrder = order.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
        const offset = (page - 1) * limit;
        
        // 查询数据
        const queryText = `
            SELECT id, name, symbol, rank, price, price_change_24h, market_cap, volume_24h,
                   circulating_supply, total_supply, max_supply, official_website,
                   blockchain_explorer, whitepaper
            FROM cryptocurrencies
            ORDER BY ${sortField} ${sortOrder}
            LIMIT $1 OFFSET $2
        `;
        
        const countQuery = 'SELECT COUNT(*) FROM cryptocurrencies';
        
        const [result, countResult] = await Promise.all([
            queryDatabase(queryText, [limit, offset]),
            queryDatabase(countQuery)
        ]);
        
        return {
            data: result.rows,
            total: parseInt(countResult.rows[0].count)
        };
    } catch (error) {
        console.error('获取加密货币数据错误:', error);
        throw error;
    }
};

// 获取爬虫状态
export const getCrawlerStatus = async () => {
    if (!pool) {
        // 返回模拟数据
        return {
            webCrawlerActive: false,
            aiProcessorActive: false,
            blockchainSyncActive: false,
            lastUpdate: null,
            newEntriesCount: 0
        };
    }
    
    try {
        const queryText = `
            SELECT web_crawler_active, ai_processor_active, blockchain_sync_active,
                   last_update, new_entries_count
            FROM crawler_status
            ORDER BY id DESC
            LIMIT 1
        `;
        
        const result = await queryDatabase(queryText);
        
        if (result.rows.length > 0) {
            const row = result.rows[0];
            return {
                webCrawlerActive: row.web_crawler_active,
                aiProcessorActive: row.ai_processor_active,
                blockchainSyncActive: row.blockchain_sync_active,
                lastUpdate: row.last_update,
                newEntriesCount: row.new_entries_count
            };
        } else {
            return {
                webCrawlerActive: false,
                aiProcessorActive: false,
                blockchainSyncActive: false,
                lastUpdate: null,
                newEntriesCount: 0
            };
        }
    } catch (error) {
        console.error('获取爬虫状态错误:', error);
        throw error;
    }
};

// 获取最近的区块链浏览器
export const getRecentExplorers = async () => {
    if (!pool) {
        // 返回模拟数据
        return [];
    }
    
    try {
        const queryText = `
            SELECT id, name, url, last_fetched
            FROM blockchain_explorers
            ORDER BY last_fetched DESC
            LIMIT 10
        `;
        
        const result = await queryDatabase(queryText);
        return result.rows;
    } catch (error) {
        console.error('获取最近探索器错误:', error);
        throw error;
    }
};

// 获取AI洞察
export const getAiInsights = async () => {
    if (!pool) {
        // 返回模拟数据
        return {
            data: [],
            lastGenerated: null
        };
    }
    
    try {
        const queryText = `
            SELECT id, title, content, confidence, created_at
            FROM ai_insights
            ORDER BY created_at DESC
            LIMIT 5
        `;
        
        const result = await queryDatabase(queryText);
        
        const lastGeneratedQuery = 'SELECT MAX(created_at) as last_generated FROM ai_insights';
        const lastGeneratedResult = await queryDatabase(lastGeneratedQuery);
        
        return {
            data: result.rows,
            lastGenerated: lastGeneratedResult.rows[0]?.last_generated || null
        };
    } catch (error) {
        console.error('获取AI洞察错误:', error);
        throw error;
    }
};

// 获取自动完成建议
export const getAutocompleteSuggestions = async (searchTerm) => {
    if (!pool) {
        // 返回模拟数据
        return [];
    }
    
    try {
        let queryText, queryParams;
        
        if (searchTerm) {
            queryText = `
                SELECT id, name, symbol
                FROM cryptocurrencies
                WHERE name ILIKE $1 OR symbol ILIKE $1
                ORDER BY rank
                LIMIT 10
            `;
            queryParams = [`%${searchTerm}%`];
        } else {
            queryText = `
                SELECT id, name, symbol
                FROM cryptocurrencies
                ORDER BY rank
                LIMIT 10
            `;
            queryParams = [];
        }
        
        const result = await queryDatabase(queryText, queryParams);
        return result.rows;
    } catch (error) {
        console.error('获取自动完成建议错误:', error);
        throw error;
    }
};

// 获取统计数据
export const getStats = async () => {
    if (!pool) {
        // 返回模拟数据
        return {
            totalMarketCap: '$0',
            tradingVolume: '$0',
            total_blockchain_explorers: 0,
            trackedAssets: 0
        };
    }
    
    try {
        // 获取市场总市值
        const marketCapQuery = 'SELECT SUM(market_cap) as total_market_cap FROM cryptocurrencies';
        const marketCapResult = await queryDatabase(marketCapQuery);
        const totalMarketCap = marketCapResult.rows[0]?.total_market_cap || 0;
        
        // 获取24小时交易量
        const volumeQuery = 'SELECT SUM(volume_24h) as total_volume FROM cryptocurrencies';
        const volumeResult = await queryDatabase(volumeQuery);
        const tradingVolume = volumeResult.rows[0]?.total_volume || 0;
        
        // 获取区块链浏览器总数
        const explorersQuery = 'SELECT COUNT(*) as total_explorers FROM blockchain_explorers';
        const explorersResult = await queryDatabase(explorersQuery);
        const totalBlockchainExplorers = parseInt(explorersResult.rows[0]?.total_explorers || 0);
        
        // 获取跟踪资产总数
        const assetsQuery = 'SELECT COUNT(*) as total_assets FROM cryptocurrencies';
        const assetsResult = await queryDatabase(assetsQuery);
        const trackedAssets = parseInt(assetsResult.rows[0]?.total_assets || 0);
        
        return {
            totalMarketCap: `$${(totalMarketCap / 1000000000000).toFixed(2)}T`,
            tradingVolume: `$${(tradingVolume / 1000000000).toFixed(2)}B`,
            total_blockchain_explorers: totalBlockchainExplorers,
            trackedAssets: trackedAssets
        };
    } catch (error) {
        console.error('获取统计数据错误:', error);
        throw error;
    }
};

export { pool };