import fs from 'fs';
import path from 'path';
import { db } from './server/db.js';
import {
  cryptocurrencies,
  volatilityAnalysisBatches,
  volatilityAnalysisEntries,
  cryptoNews,
  technicalAnalysisBatches,
  technicalAnalysisEntries,
  aiInsights,
  dashboardConfigs,
  metrics,
  blockchainExplorers,
  users,
  volumeToMarketCapRatios,
  volumeToMarketCapBatches,
  crawlerStatus
} from './shared/schema';

interface ExportSummary {
  exportDate: string;
  totalTables: number;
  totalRecords: number;
  tables: string[];
}

interface ExportFile {
  table: string;
  exportDate: string;
  recordCount: number;
  data: any[];
}

async function importDatabase() {
  console.log('🚀 开始导入数据库...');
  
  const exportDir = path.join(__dirname, 'database_export');
  
  try {
    // 读取导出摘要
    const summary: ExportSummary = JSON.parse(fs.readFileSync(path.join(exportDir, 'export_summary.json'), 'utf8'));
    console.log(`📊 导入摘要: ${summary.totalRecords} 条记录，${summary.totalTables} 个表`);
    
    // 按依赖顺序导入表（先导入基础表，再导入关联表）
    const importOrder = [
      'users',
      'cryptocurrencies', 
      'blockchain_explorers',
      'metrics',
      'ai_insights',
      'crawler_status',
      'crypto_news',
      'volume_to_market_cap_batches',
      'volume_to_market_cap_ratios',
      'technical_analysis_batches',
      'technical_analysis_entries',
      'volatility_analysis_batches',
      'volatility_analysis_entries',
      'dashboard_configs'
    ];
    
    let totalImported = 0;
    
    for (const tableName of importOrder) {
      const fileName = `${tableName}.json`;
      const filePath = path.join(exportDir, fileName);
      
      if (fs.existsSync(filePath)) {
        console.log(`📥 导入表: ${tableName}`);
        
        const fileContent: ExportFile = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        const data = fileContent.data || fileContent; // 兼容不同的JSON格式
        console.log(`   记录数: ${data.length}`);
        
        if (data.length > 0) {
          try {
            // 根据表名选择对应的表
            let table: any;
            
            switch (tableName) {
              case 'users':
                table = users;
                break;
              case 'cryptocurrencies':
                table = cryptocurrencies;
                break;
              case 'blockchain_explorers':
                table = blockchainExplorers;
                break;
              case 'metrics':
                table = metrics;
                break;
              case 'ai_insights':
                table = aiInsights;
                break;
              case 'crawler_status':
                table = crawlerStatus;
                break;
              case 'crypto_news':
                table = cryptoNews;
                break;
              case 'volume_to_market_cap_batches':
                table = volumeToMarketCapBatches;
                break;
              case 'volume_to_market_cap_ratios':
                table = volumeToMarketCapRatios;
                break;
              case 'technical_analysis_batches':
                table = technicalAnalysisBatches;
                break;
              case 'technical_analysis_entries':
                table = technicalAnalysisEntries;
                break;
              case 'volatility_analysis_batches':
                table = volatilityAnalysisBatches;
                break;
              case 'volatility_analysis_entries':
                table = volatilityAnalysisEntries;
                break;
              case 'dashboard_configs':
                table = dashboardConfigs;
                break;
              default:
                console.log(`⚠️  跳过未知表: ${tableName}`);
                continue;
            }
            
            // 批量插入数据
            const batchSize = 1000;
            for (let i = 0; i < data.length; i += batchSize) {
              const batch = data.slice(i, i + batchSize);
              await db.insert(table).values(batch);
              console.log(`   已导入: ${Math.min(i + batchSize, data.length)}/${data.length}`);
            }
            
            totalImported += data.length;
            console.log(`✅ ${tableName} 导入完成`);
            
          } catch (error: any) {
            console.error(`❌ 导入 ${tableName} 时出错:`, error.message);
            // 继续导入其他表
          }
        } else {
          console.log(`⚠️  ${tableName} 为空，跳过`);
        }
      } else {
        console.log(`⚠️  文件不存在: ${fileName}`);
      }
    }
    
    console.log(`🎉 导入完成！总共导入 ${totalImported} 条记录`);
    
  } catch (error: any) {
    console.error('❌ 导入过程中出错:', error);
    throw error;
  }
}

// 运行导入
importDatabase()
  .then(() => {
    console.log('✅ 数据库导入成功完成！');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ 数据库导入失败:', error);
    process.exit(1);
  });
