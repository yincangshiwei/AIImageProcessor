#!/usr/bin/env python3
import sqlite3
import json
from datetime import datetime, timedelta
import os

# Ensure we're in the right directory
os.chdir('/workspace')

# Create database in /tmp or writable location  
db_path = '/workspace/app.db'
conn = sqlite3.connect(db_path)
cursor = conn.cursor()

# Create tables
cursor.execute('''
CREATE TABLE IF NOT EXISTS auth_codes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code VARCHAR(100) UNIQUE NOT NULL,
    credits INTEGER DEFAULT 0,
    expire_time DATETIME,
    status VARCHAR(20) DEFAULT 'active',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
''')

cursor.execute('''
CREATE TABLE IF NOT EXISTS generation_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    auth_code VARCHAR(100) NOT NULL,
    media_type VARCHAR(20) NOT NULL DEFAULT 'image',
    module_name VARCHAR(60) NOT NULL DEFAULT 'AI图像:多图模式',
    input_images TEXT,
    prompt_text TEXT NOT NULL,
    output_count INTEGER NOT NULL,
    output_images TEXT,
    output_videos TEXT,
    credits_used INTEGER NOT NULL,
    processing_time INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (auth_code) REFERENCES auth_codes(code)
);
''')

cursor.execute('''
CREATE TABLE IF NOT EXISTS template_cases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category VARCHAR(50) NOT NULL,
    title VARCHAR(200) NOT NULL,
    description TEXT,
    preview_image VARCHAR(500),
    input_images TEXT,
    prompt_text TEXT NOT NULL,
    tags TEXT,
    popularity INTEGER DEFAULT 0,
    mode_type VARCHAR(20) NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
''')

# Insert sample auth codes
sample_codes = [
    ('DEMO2025', 1000, (datetime.now() + timedelta(days=365)).isoformat(), 'active'),
    ('TEST001', 500, None, 'active'),
    ('VIP2025', 5000, (datetime.now() + timedelta(days=90)).isoformat(), 'active')
]

for code, credits, expire_time, status in sample_codes:
    cursor.execute(
        'INSERT OR IGNORE INTO auth_codes (code, credits, expire_time, status) VALUES (?, ?, ?, ?)',
        (code, credits, expire_time, status)
    )

# Insert sample template cases
sample_cases = [
    {
        'category': '科幻风格',
        'title': '太空战士合成',
        'description': '将人物图像与科幻背景合成，创造未来战士效果',
        'preview_image': '/static/previews/scifi_warrior.jpg',
        'input_images': json.dumps(['/static/examples/person.jpg', '/static/examples/space_bg.jpg']),
        'prompt_text': '将第一张图片中的人物与第二张太空背景合成，打造酷炫的太空战士形象，添加科幻装甲和光效',
        'tags': json.dumps(['科幻', '合成', '战士', '太空']),
        'popularity': 156,
        'mode_type': 'multi'
    },
    {
        'category': '艺术创作',
        'title': '水彩风景转换',
        'description': '将普通照片转换为水彩画风格的艺术作品',
        'preview_image': '/static/previews/watercolor.jpg',
        'input_images': json.dumps(['/static/examples/landscape.jpg']),
        'prompt_text': '将这张风景照片转换为水彩画风格，保持柔和的色调和艺术气息，强调笔触和渲染效果',
        'tags': json.dumps(['水彩', '艺术', '风景', '转换']),
        'popularity': 89,
        'mode_type': 'multi'
    },
    {
        'category': '卡通风格',
        'title': '卡通头像制作',
        'description': '将真实人像转换为可爱的卡通头像',
        'preview_image': '/static/previews/cartoon_avatar.jpg',
        'input_images': json.dumps(['/static/examples/portrait.jpg']),
        'prompt_text': '将这张人像照片转换为可爱的卡通风格，保持人物特征，增加大眼睛和柔和的色彩',
        'tags': json.dumps(['卡通', '头像', '可爱', '人像']),
        'popularity': 234,
        'mode_type': 'multi'
    },
    {
        'category': '拼图合成',
        'title': '多元素海报设计',
        'description': '将多个设计元素合成为统一的海报设计',
        'preview_image': '/static/previews/poster_design.jpg',
        'input_images': json.dumps(['/static/examples/logo.png', '/static/examples/text_element.png', '/static/examples/bg_pattern.jpg']),
        'prompt_text': '将这些设计元素合成为一张现代感强烈的海报，注重布局平衡和色彩搭配',
        'tags': json.dumps(['拼图', '海报', '设计', '合成']),
        'popularity': 178,
        'mode_type': 'puzzle'
    }
]

for case in sample_cases:
    cursor.execute(
        '''INSERT OR IGNORE INTO template_cases 
           (category, title, description, preview_image, input_images, prompt_text, tags, popularity, mode_type)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)''',
        (case['category'], case['title'], case['description'], case['preview_image'], 
         case['input_images'], case['prompt_text'], case['tags'], case['popularity'], case['mode_type'])
    )

conn.commit()
conn.close()

print('🎉 数据库初始化完成!')
print('\n示例授权码:')
print('- DEMO2025: 1000 积分')
print('- TEST001: 500 积分')
print('- VIP2025: 5000 积分')