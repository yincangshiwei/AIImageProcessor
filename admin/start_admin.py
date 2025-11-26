#!/usr/bin/env python3
"""
AI图像编辑平台后台管理系统启动脚本
"""

import os
import sys
import subprocess
from pathlib import Path

def check_requirements():
    """检查依赖包"""
    try:
        import gradio
        import pandas
        from PIL import Image
        print("✅ 所有依赖包已安装")
        return True
    except ImportError as e:
        print(f"❌ 缺少依赖包: {e}")
        print("请运行: pip install -r requirements.txt")
        return False

def main():
    """主函数"""
    print("🎨 AI图像编辑平台后台管理系统")
    print("=" * 50)
    
    # 检查依赖
    if not check_requirements():
        sys.exit(1)
    
    # 设置工作目录
    admin_dir = Path(__file__).parent
    os.chdir(admin_dir)
    
    print("📂 工作目录:", admin_dir)
    print("📊 使用统一数据库:", os.path.abspath("../backend/app.db"))
    print("🚀 启动后台管理系统...")
    print("🌐 访问地址: http://localhost:7860")
    print("=" * 50)
    
    # 启动应用
    try:
        from app import create_admin_interface
        app = create_admin_interface()
        app.launch(
            server_name="0.0.0.0",
            server_port=7860,
            share=False,
            debug=False,
            show_error=True
        )
    except KeyboardInterrupt:
        print("\n👋 后台管理系统已停止")
    except Exception as e:
        print(f"❌ 启动失败: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()