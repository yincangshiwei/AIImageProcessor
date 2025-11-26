#!/usr/bin/env python3
"""
AI图像编辑平台 - 数据库初始化脚本
统一初始化admin和backend共享的数据库
"""

import sqlite3
import os
from datetime import datetime, timedelta

def create_database():
    """创建数据库和所有表"""
    
    # 数据库文件路径
    db_path = "app.db"
    
    print("🚀 开始初始化数据库...")
    print(f"📍 数据库位置: {os.path.abspath(db_path)}")
    
    # 连接数据库（如果不存在会自动创建）
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    try:
        # 创建授权码表
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS auth_codes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                code TEXT UNIQUE NOT NULL,
                credits INTEGER NOT NULL DEFAULT 0,
                expire_date TEXT,
                expire_time TEXT,
                status TEXT NOT NULL DEFAULT 'active',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        print("✅ 创建授权码表 (auth_codes)")
        
        # 创建积分调整记录表
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS credit_adjustments (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                auth_code TEXT NOT NULL,
                adjustment INTEGER NOT NULL,
                reason TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (auth_code) REFERENCES auth_codes (code)
            )
        ''')
        print("✅ 创建积分调整记录表 (credit_adjustments)")
        
        # 创建生成记录表
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS generation_records (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                auth_code TEXT NOT NULL,
                mode TEXT NOT NULL,
                prompt TEXT,
                image_count INTEGER DEFAULT 1,
                uploaded_images TEXT,
                generated_images TEXT,
                credits_used INTEGER DEFAULT 1,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (auth_code) REFERENCES auth_codes (code)
            )
        ''')
        print("✅ 创建生成记录表 (generation_records)")
        
        # 创建案例表
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS cases (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                description TEXT,
                category TEXT,
                prompt TEXT,
                mode TEXT,
                image_url TEXT,
                tags TEXT,
                is_featured BOOLEAN DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        print("✅ 创建案例表 (cases)")
        
        # 创建模板案例表（用于快速案例导航）
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS template_cases (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                description TEXT,
                category TEXT,
                prompt TEXT,
                mode TEXT,
                preview_image TEXT,
                tags TEXT,
                usage_count INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        print("✅ 创建模板案例表 (template_cases)")
        
        # 插入默认授权码
        default_codes = [
            ('DEMO2025', 1000, (datetime.now() + timedelta(days=365)).strftime('%Y-%m-%d %H:%M:%S'), 'active'),
            ('TEST001', 500, None, 'active'),
            ('VIP2025', 5000, (datetime.now() + timedelta(days=90)).strftime('%Y-%m-%d %H:%M:%S'), 'active'),
        ]
        
        for code, credits, expire_time, status in default_codes:
            cursor.execute('''
                INSERT OR IGNORE INTO auth_codes (code, credits, expire_date, expire_time, status)
                VALUES (?, ?, ?, ?, ?)
            ''', (code, credits, expire_time, expire_time, status))
        
        print("✅ 插入默认授权码")
        
        # 插入示例案例
        sample_cases = [
            ('科幻战士', '未来科幻风格的战士角色', '人物', '一个身穿高科技装甲的未来战士，手持能量武器，背景是赛博朋克城市', 'single', '科幻,战士,未来', 1),
            ('抽象几何', '彩色抽象几何图案', '抽象', '充满活力的抽象几何形状，多彩渐变背景', 'single', '抽象,几何,彩色', 1),
            ('赛博朋克背景', '霓虹灯风格的赛博朋克背景', '背景', '黑暗的未来主义霓虹背景，网格图案，赛博朋克风格', 'single', '赛博朋克,霓虹,背景', 1),
            ('全息界面', '未来科技全息界面元素', '界面', '全息投影风格的未来界面设计元素', 'single', '全息,界面,科技', 1),
            ('低多边形背景', '彩色低多边形几何背景', '背景', '彩色抽象几何低多边形背景图案', 'single', '低多边形,几何,背景', 1),
        ]
        
        for title, desc, category, prompt, mode, tags, featured in sample_cases:
            cursor.execute('''
                INSERT OR IGNORE INTO cases (title, description, category, prompt, mode, tags, popularity)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            ''', (title, desc, category, prompt, mode, tags, featured))
        
        print("✅ 插入示例案例")
        
        # 提交事务
        conn.commit()
        
        # 显示统计信息
        cursor.execute("SELECT COUNT(*) FROM auth_codes")
        auth_count = cursor.fetchone()[0]
        
        cursor.execute("SELECT COUNT(*) FROM cases")
        case_count = cursor.fetchone()[0]
        
        print(f"\n📊 数据库初始化完成！")
        print(f"   - 授权码: {auth_count} 个")
        print(f"   - 案例: {case_count} 个")
        print(f"   - 数据库文件: {os.path.abspath(db_path)}")
        
        return True
        
    except Exception as e:
        print(f"❌ 数据库初始化失败: {e}")
        conn.rollback()
        return False
        
    finally:
        conn.close()

def verify_database():
    """验证数据库结构"""
    
    db_path = "app.db"
    
    if not os.path.exists(db_path):
        print("❌ 数据库文件不存在")
        return False
    
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        
        # 检查所有表
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
        tables = [row[0] for row in cursor.fetchall()]
        
        required_tables = ['auth_codes', 'credit_adjustments', 'generation_records', 'cases', 'template_cases']
        missing_tables = [table for table in required_tables if table not in tables]
        
        if missing_tables:
            print(f"❌ 缺少表: {', '.join(missing_tables)}")
            return False
        
        print("✅ 数据库结构验证通过")
        
        # 显示数据统计
        for table in required_tables:
            cursor.execute(f"SELECT COUNT(*) FROM {table}")
            count = cursor.fetchone()[0]
            print(f"   📊 {table}: {count} 条记录")
        
        conn.close()
        return True
        
    except Exception as e:
        print(f"❌ 数据库验证失败: {e}")
        return False

if __name__ == "__main__":
    print("=" * 60)
    print("🎯 AI图像编辑平台 - 数据库初始化")
    print("=" * 60)
    
    # 创建数据库
    if create_database():
        print("\n" + "=" * 60)
        print("🔍 验证数据库结构")
        print("=" * 60)
        
        # 验证数据库
        if verify_database():
            print("\n🎉 数据库初始化成功！")
            print("\n📝 默认授权码:")
            print("   - DEMO2025: 1000积分，1年有效期")
            print("   - TEST001: 500积分，永不过期")
            print("   - VIP2025: 5000积分，90天有效期")
            print("\n🚀 现在可以启动服务:")
            print("   - 管理后台: cd admin && python app.py")
            print("   - 后端API: cd backend && python -m app.main")
            print("   - 前端应用: cd frontend/ai-image-editor && npm run dev")
        else:
            print("\n❌ 数据库验证失败，请检查错误信息")
    else:
        print("\n❌ 数据库初始化失败，请检查错误信息")