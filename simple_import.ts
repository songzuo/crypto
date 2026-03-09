import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const exportDir = path.join(__dirname, 'database_export');
const tables = [
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

async function importData() {
  console.log('Starting data import...');
  
  for (const table of tables) {
    const filePath = path.join(exportDir, `${table}.json`);
    if (fs.existsSync(filePath)) {
      console.log(`Importing ${table}...`);
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8')).data;
      
      if (data.length > 0) {
        // Generate SQL insert statements
        const columns = Object.keys(data[0]).join(', ');
        const values = data.map(row => 
          `(${Object.values(row).map(v => 
            typeof v === 'string' ? `'${v.replace(/'/g, "''")}'` : 
            v === null ? 'NULL' : v
          ).join(', ')})`
        ).join(',\n');
        
        const sql = `INSERT INTO ${table} (${columns}) VALUES\n${values};`;
        fs.writeFileSync(`${table}_import.sql`, sql);
        
        // Execute SQL
        try {
          execSync(`psql -U cry -d cryptoscan -f ${table}_import.sql`, { stdio: 'inherit' });
          console.log(`✅ ${table} imported successfully`);
        } catch (error) {
          console.error(`❌ Error importing ${table}:`, error.message);
        }
      }
    }
  }
  
  console.log('Data import completed!');
}

importData().catch(console.error);