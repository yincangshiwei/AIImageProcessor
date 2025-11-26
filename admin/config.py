"""
后台管理系统配置文件
"""

import os
from pathlib import Path

# 基础配置
BASE_DIR = Path(__file__).parent
# 使用项目根目录的共享数据库
DATABASE_PATH = BASE_DIR.parent / "app.db"

# 服务器配置
SERVER_CONFIG = {
    "host": "0.0.0.0",
    "port": 7860,
    "debug": False,
    "share": False
}

# 数据库配置
DATABASE_CONFIG = {
    "path": str(DATABASE_PATH),
    "timeout": 30,
    "check_same_thread": False
}

# 授权码配置
AUTH_CODE_CONFIG = {
    "length": 16,
    "default_credits": 100,
    "default_expire_days": 30
}

# 案例配置
CASE_CONFIG = {
    "categories": [
        "人物", "风景", "动物", "建筑", "艺术", "科幻", "卡通", "其他"
    ],
    "modes": ["拼图模式", "多图模式"],
    "default_canvas_sizes": [
        "512x512", "768x768", "1024x1024", 
        "512x768", "768x512", "1024x768", "2048x2048"
    ]
}

# 界面配置
UI_CONFIG = {
    "title": "AI图像编辑平台 - 后台管理系统",
    "theme": "soft",
    "max_file_size": 10 * 1024 * 1024,  # 10MB
    "supported_image_formats": [".jpg", ".jpeg", ".png", ".webp", ".bmp"]
}

# 分页配置
PAGINATION_CONFIG = {
    "page_size": 50,
    "max_records": 1000
}

# 日志配置
LOGGING_CONFIG = {
    "level": "INFO",
    "format": "%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    "file": BASE_DIR / "admin.log"
}

# 安全配置
SECURITY_CONFIG = {
    "max_login_attempts": 5,
    "session_timeout": 3600,  # 1小时
    "allowed_ips": [],  # 空列表表示允许所有IP
}

# 备份配置
BACKUP_CONFIG = {
    "auto_backup": True,
    "backup_interval": 24,  # 小时
    "backup_dir": BASE_DIR / "backups",
    "max_backups": 7
}