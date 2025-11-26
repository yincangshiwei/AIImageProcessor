#!/usr/bin/env python3
"""
使用uv环境启动AI图像编辑平台后台管理系统
"""

import os
import sys
import subprocess
from pathlib import Path

def check_uv_environment():
    """检查uv环境"""
    uv_env_path = Path("I:/dev_works/python_venv/ai_image_processor")
    
    if not uv_env_path.exists():
        print(f"❌ uv环境不存在: {uv_env_path}")
        return False
    
    # 检查Python可执行文件
    if os.name == 'nt':  # Windows
        python_exe = uv_env_path / "Scripts" / "python.exe"
    else:  # Unix/Linux/macOS
        python_exe = uv_env_path / "bin" / "python"
    
    if not python_exe.exists():
        print(f"❌ Python可执行文件不存在: {python_exe}")
        return False
    
    print(f"✅ 找到uv环境: {uv_env_path}")
    print(f"✅ Python路径: {python_exe}")
    return str(python_exe)

def install_dependencies(python_exe):
    """安装依赖包"""
    print("📦 检查并安装依赖包...")
    
    try:
        # 使用uv环境的Python安装依赖
        result = subprocess.run([
            python_exe, "-m", "pip", "install", "-r", "requirements.txt"
        ], capture_output=True, text=True, cwd=Path(__file__).parent)
        
        if result.returncode == 0:
            print("✅ 依赖包安装/检查完成")
            return True
        else:
            print(f"❌ 依赖包安装失败: {result.stderr}")
            return False
    except Exception as e:
        print(f"❌ 安装依赖时出错: {e}")
        return False

def main():
    """主函数"""
    print("🎨 AI图像编辑平台后台管理系统 (uv环境)")
    print("=" * 60)
    
    # 检查uv环境
    python_exe = check_uv_environment()
    if not python_exe:
        print("\n💡 请确保uv环境已正确创建:")
        print("   uv venv I:/dev_works/python_venv/ai_image_processor")
        print("   uv pip install gradio pandas pillow matplotlib numpy")
        sys.exit(1)
    
    # 安装依赖
    if not install_dependencies(python_exe):
        sys.exit(1)
    
    # 设置工作目录
    admin_dir = Path(__file__).parent
    os.chdir(admin_dir)
    
    print(f"📂 工作目录: {admin_dir}")
    print("🚀 启动后台管理系统...")
    print("🌐 访问地址: http://localhost:7860")
    print("=" * 60)
    
    # 使用uv环境的Python启动应用
    try:
        subprocess.run([python_exe, "app.py"], cwd=admin_dir)
    except KeyboardInterrupt:
        print("\n👋 后台管理系统已停止")
    except Exception as e:
        print(f"❌ 启动失败: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()