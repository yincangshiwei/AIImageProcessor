#!/usr/bin/env python3
"""
初始化示例数据
"""

import sqlite3
from datetime import datetime, timedelta
import json

def init_sample_data():
    """初始化示例数据"""
    conn = sqlite3.connect('admin_database.db')
    cursor = conn.cursor()
    
    # 添加示例授权码
    sample_auth_codes = [
        {
            'code': 'DEMO12345678ABCD',
            'credits': 100,
            'expire_date': (datetime.now() + timedelta(days=30)).strftime('%Y-%m-%d %H:%M:%S'),
            'status': 'active'
        },
        {
            'code': 'TEST87654321EFGH',
            'credits': 50,
            'expire_date': (datetime.now() + timedelta(days=15)).strftime('%Y-%m-%d %H:%M:%S'),
            'status': 'active'
        }
    ]
    
    for auth_code in sample_auth_codes:
        cursor.execute('''
            INSERT OR IGNORE INTO auth_codes (code, credits, expire_date, status)
            VALUES (?, ?, ?, ?)
        ''', (auth_code['code'], auth_code['credits'], auth_code['expire_date'], auth_code['status']))
    
    # 添加示例案例
    sample_cases = [
        {
            'title': '梦幻森林风景',
            'category': '风景',
            'description': '创建一个充满魔幻色彩的森林场景，适合用作背景或艺术创作',
            'prompt': '梦幻森林，阳光透过树叶，彩虹色的光芒，神秘氛围，高质量，4K分辨率',
            'mode': '拼图模式',
            'canvas_size': '1024x1024',
            'tags': '森林,梦幻,风景,自然'
        },
        {
            'title': '可爱卡通人物',
            'category': '人物',
            'description': '生成可爱的卡通风格人物形象，适合儿童插画或游戏角色',
            'prompt': '可爱卡通女孩，大眼睛，粉色头发，甜美笑容，日系动漫风格，高质量',
            'mode': '多图模式',
            'canvas_size': '512x768',
            'tags': '卡通,人物,可爱,动漫'
        },
        {
            'title': '现代建筑设计',
            'category': '建筑',
            'description': '现代简约风格的建筑设计，展现未来感和科技感',
            'prompt': '现代建筑，玻璃幕墙，简约设计，未来感，蓝天白云，建筑摄影，专业照明',
            'mode': '拼图模式',
            'canvas_size': '1024x768',
            'tags': '建筑,现代,设计,未来'
        },
        {
            'title': '抽象艺术创作',
            'category': '艺术',
            'description': '色彩丰富的抽象艺术作品，展现创意和想象力',
            'prompt': '抽象艺术，色彩斑斓，几何图形，现代艺术风格，高饱和度，艺术感',
            'mode': '拼图模式',
            'canvas_size': '1024x1024',
            'tags': '抽象,艺术,色彩,创意'
        },
        {
            'title': '萌宠动物合集',
            'category': '动物',
            'description': '各种可爱的小动物，适合制作表情包或装饰图案',
            'prompt': '可爱小猫，毛茸茸，大眼睛，呆萌表情，高清摄影，温馨氛围',
            'mode': '多图模式',
            'canvas_size': '512x512',
            'tags': '动物,可爱,萌宠,小猫'
        }
    ]
    
    for case in sample_cases:
        cursor.execute('''
            INSERT OR IGNORE INTO cases (title, category, description, prompt, mode, canvas_size, tags)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        ''', (case['title'], case['category'], case['description'], case['prompt'], 
              case['mode'], case['canvas_size'], case['tags']))
    
    # 添加示例生成记录
    sample_records = [
        {
            'auth_code': 'DEMO12345678ABCD',
            'mode': '拼图模式',
            'prompt': '美丽的日落风景，海边，温暖色调',
            'output_count': 2,
            'images_data': json.dumps({'canvas_size': '1024x1024', 'images': ['image1.jpg', 'image2.jpg']})
        },
        {
            'auth_code': 'TEST87654321EFGH',
            'mode': '多图模式',
            'prompt': '科幻城市，未来感，霓虹灯',
            'output_count': 4,
            'images_data': json.dumps({'images': ['sci1.jpg', 'sci2.jpg', 'sci3.jpg']})
        }
    ]
    
    for record in sample_records:
        cursor.execute('''
            INSERT OR IGNORE INTO generation_records (auth_code, mode, prompt, output_count, images_data)
            VALUES (?, ?, ?, ?, ?)
        ''', (record['auth_code'], record['mode'], record['prompt'], 
              record['output_count'], record['images_data']))
    
    conn.commit()
    conn.close()
    
    print("✅ 示例数据初始化完成！")
    print("📝 已添加:")
    print("   - 2个示例授权码")
    print("   - 5个示例案例")
    print("   - 2条示例生成记录")

if __name__ == "__main__":
    init_sample_data()