#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
SQL导入脚本生成器 - 将JSON备份数据转换为SQL INSERT语句（无事务版本）
"""

import json
import os
import sys
from typing import Dict, List, Any
from datetime import datetime

def escape_sql_value(value):
    """转义SQL值"""
    if value is None:
        return 'NULL'
    elif isinstance(value, bool):
        return 'TRUE' if value else 'FALSE'
    elif isinstance(value, (int, float)):
        return str(value)
    elif isinstance(value, str):
        # 转义单引号并包装在单引号中
        escaped = value.replace("'", "''")
        return f"'{escaped}'"
    elif isinstance(value, dict):
        # 将字典转换为JSON字符串
        json_str = json.dumps(value).replace("'", "''")
        return f"'{json_str}'"
    elif isinstance(value, list):
        # 将列表转换为JSON字符串
        json_str = json.dumps(value).replace("'", "''")
        return f"'{json_str}'"
    else:
        # 其他类型转换为字符串
        str_value = str(value).replace("'", "''")
        return f"'{str_value}'"

def generate_insert_sql(table_name: str, data: List[Dict[str, Any]]) -> List[str]:
    """为单个表生成INSERT SQL语句"""
    if not data:
        return []
    
    sql_statements = []
    
    # 获取所有可能的列名
    all_columns = set()
    for record in data:
        all_columns.update(record.keys())
    
    columns = sorted(list(all_columns))
    
    # 生成INSERT语句
    batch_size = 1000
    for i in range(0, len(data), batch_size):
        batch = data[i:i + batch_size]
        
        # 构建VALUES子句
        values_clauses = []
        for record in batch:
            values = []
            for col in columns:
                value = record.get(col)
                values.append(escape_sql_value(value))
            values_clauses.append(f"({', '.join(values)})")
        
        # 构建完整的INSERT语句
        sql = f"""-- 插入 {table_name} 表数据 (批次 {i//batch_size + 1})
INSERT INTO {table_name} ({', '.join(columns)}) 
VALUES 
{','.join(values_clauses)};"""
        sql_statements.append(sql)
    
    return sql_statements

def process_export_file(file_path: str) -> List[str]:
    """处理单个导出文件"""
    if not os.path.exists(file_path):
        print(f"⚠️  文件不存在: {file_path}")
        return []
    
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            file_content = json.load(f)
        
        # 兼容不同的JSON格式
        if isinstance(file_content, dict) and 'data' in file_content:
            data = file_content['data']
            table_name = file_content.get('table', os.path.basename(file_path).replace('.json', ''))
        else:
            data = file_content
            table_name = os.path.basename(file_path).replace('.json', '')
        
        print(f"📥 处理表: {table_name} ({len(data)} 条记录)")
        
        return generate_insert_sql(table_name, data)
        
    except Exception as e:
        print(f"❌ 处理文件 {file_path} 时出错: {e}")
        return []

def main():
    """主函数"""
    export_dir = os.path.join(os.path.dirname(__file__), 'database_export')
    
    if not os.path.exists(export_dir):
        print(f"❌ 导出目录不存在: {export_dir}")
        sys.exit(1)
    
    print("🚀 开始生成SQL导入脚本（无事务版本）...")
    
    # 读取导出摘要
    summary_path = os.path.join(export_dir, 'export_summary.json')
    if os.path.exists(summary_path):
        with open(summary_path, 'r', encoding='utf-8') as f:
            summary = json.load(f)
        print(f"📊 导入摘要: {summary['totalRecords']} 条记录，{summary['totalTables']} 个表")
    
    # 按依赖顺序处理表
    import_order = [
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
    ]
    
    # 生成SQL文件
    output_file = 'database_import_no_transaction.sql'
    total_statements = 0
    
    with open(output_file, 'w', encoding='utf-8') as f:
        f.write(f"""-- 数据库导入脚本（无事务版本）
-- 生成时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}
-- 来源: {export_dir}

""")
        
        for table_name in import_order:
            file_path = os.path.join(export_dir, f"{table_name}.json")
            sql_statements = process_export_file(file_path)
            
            if sql_statements:
                for sql in sql_statements:
                    f.write(sql + '\n\n')
                    total_statements += 1
        
        f.write("""-- 显示导入完成信息
SELECT 'Database import completed successfully!' as message;
""")
    
    print(f"✅ SQL导入脚本生成完成: {output_file}")
    print(f"📝 总共生成 {total_statements} 个INSERT语句")
    print(f"💡 请使用以下命令执行导入:")
    print(f"   psql -h localhost -p 5432 -U postgres -d cryptoscan -f {output_file}")

if __name__ == "__main__":
    main()
