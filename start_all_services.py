#!/usr/bin/env python3
"""
启动所有服务的便捷脚本
"""

import subprocess
import sys
import os
import time
from threading import Thread

def start_backend():
    """启动Backend API服务"""
    print("🚀 启动Backend API服务...")
    os.chdir("backend")
    subprocess.run([sys.executable, "main.py"])

def start_admin():
    """启动Admin管理系统"""
    print("🎨 启动Admin管理系统...")
    time.sleep(2)  # 等待backend启动
    os.chdir("admin")
    subprocess.run([sys.executable, "start_admin.py"])

def main():
    print("=" * 60)
    print("🎯 AI图像编辑平台 - 统一数据库版本")
    print("=" * 60)
    print("📊 数据库: app.db (共享数据库)")
    print("🌐 Backend API: http://localhost:8000")
    print("⚙️  Admin管理: http://localhost:7860")
    print("=" * 60)
    
    # 验证数据库统一
    if not os.path.exists("app.db"):
        print("❌ 共享数据库不存在，请先运行初始化脚本")
        print("   python backend/init_admin_tables.py")
        return
    
    print("✅ 数据库验证通过，开始启动服务...")
    print()
    
    # 创建线程启动服务
    backend_thread = Thread(target=start_backend, daemon=True)
    admin_thread = Thread(target=start_admin, daemon=True)
    
    try:
        # 启动backend
        backend_thread.start()
        print("✅ Backend API服务启动中...")
        
        # 启动admin
        admin_thread.start()
        print("✅ Admin管理系统启动中...")
        
        print("\n🎉 所有服务已启动！")
        print("📝 按 Ctrl+C 停止所有服务")
        
        # 等待线程
        backend_thread.join()
        admin_thread.join()
        
    except KeyboardInterrupt:
        print("\n👋 正在停止所有服务...")
        sys.exit(0)

if __name__ == "__main__":
    main()