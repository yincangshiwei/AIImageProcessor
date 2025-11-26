#!/usr/bin/env python3
"""
验证admin和backend是否使用同一个数据库
"""

import sqlite3
import os
from datetime import datetime

def check_database_connection():
    """检查数据库连接和表结构"""
    
    admin_db_config = "admin/config.py"
    backend_db_path = "app.db"
    
    print("数据库统一验证")
    print("=" * 50)
    
    # 检查admin配置
    if os.path.exists(admin_db_config):
        with open(admin_db_config, 'r', encoding='utf-8') as f:
            content = f.read()
            if 'app.db' in content and ('parent' in content or '..' in content):
                print("✅ Admin配置已更新为使用共享数据库")
            else:
                print("❌ Admin配置未正确更新")
                print("   当前配置内容片段:")
                lines = content.split('\n')
                for i, line in enumerate(lines):
                    if 'DATABASE_PATH' in line:
                        print(f"   第{i+1}行: {line.strip()}")
    
    # 检查共享数据库
    if os.path.exists(backend_db_path):
        print(f"✅ 共享数据库存在: {backend_db_path}")
        
        # 连接数据库检查表结构
        conn = sqlite3.connect(backend_db_path)
        cursor = conn.cursor()
        
        # 获取所有表
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
        tables = [row[0] for row in cursor.fetchall()]
        
        print(f"\n数据库包含的表: {len(tables)} 个")
        for table in sorted(tables):
            cursor.execute(f"SELECT COUNT(*) FROM {table}")
            count = cursor.fetchone()[0]
            print(f"  📊 {table}: {count} 条记录")
        
        # 检查admin需要的表
        admin_tables = ['auth_codes', 'credit_adjustments', 'generation_records', 'cases']
        missing_tables = [table for table in admin_tables if table not in tables]
        
        if missing_tables:
            print(f"\n❌ 缺少admin表: {', '.join(missing_tables)}")
        else:
            print(f"\n✅ 所有admin表都存在")
        
        conn.close()
    else:
        print(f"❌ 共享数据库不存在: {backend_db_path}")
    
    # 检查旧的admin数据库
    old_admin_db = "admin/admin_database.db"
    if os.path.exists(old_admin_db):
        print(f"\n⚠️  旧的admin数据库仍然存在: {old_admin_db}")
        print("   建议备份后删除，避免混淆")
    else:
        print(f"\n✅ 旧的admin数据库已清理")
    
    # 检查backend目录下是否还有旧数据库文件
    old_backend_db = "backend/app.db"
    if os.path.exists(old_backend_db):
        print(f"\n⚠️  backend目录存在旧数据库: {old_backend_db}")
        print("   建议删除，现在已统一使用项目根目录/app.db")
    else:
        print(f"\n✅ backend目录旧数据库已清理")

def test_admin_database_operations():
    """测试admin数据库操作"""
    print("\n测试数据库操作")
    print("-" * 30)
    
    backend_db_path = "app.db"
    
    try:
        conn = sqlite3.connect(backend_db_path)
        cursor = conn.cursor()
        
        # 测试插入一个测试授权码
        test_code = f"TEST{datetime.now().strftime('%Y%m%d%H%M%S')}"
        cursor.execute('''
            INSERT INTO auth_codes (code, credits, expire_date, expire_time, status)
            VALUES (?, ?, ?, ?, ?)
        ''', (test_code, 100, '2024-12-31 23:59:59', '2024-12-31 23:59:59', 'active'))
        
        # 查询刚插入的记录
        cursor.execute('SELECT * FROM auth_codes WHERE code = ?', (test_code,))
        result = cursor.fetchone()
        
        if result:
            print(f"✅ 数据库写入测试成功: {test_code}")
            
            # 删除测试记录
            cursor.execute('DELETE FROM auth_codes WHERE code = ?', (test_code,))
            conn.commit()
            print("✅ 数据库删除测试成功")
        else:
            print("❌ 数据库写入测试失败")
        
        conn.close()
        
    except Exception as e:
        print(f"❌ 数据库操作测试失败: {e}")

if __name__ == "__main__":
    check_database_connection()
    test_admin_database_operations()
    
    print("\n" + "=" * 50)
    print("验证完成！")
    print("\n如果所有检查都通过，说明admin和backend已成功使用统一数据库。")
    print("现在可以启动admin系统: cd admin && python start_admin.py")
    print("同时启动backend系统: cd backend && python -m app.main")