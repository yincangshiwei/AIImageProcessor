@echo off
chcp 65001 >nul
echo 🎨 AI图像编辑平台后台管理系统
echo ================================
echo.

cd /d "%~dp0"

echo 📂 当前目录: %CD%
echo.

echo 🔍 检查Python环境...
python --version >nul 2>&1
if errorlevel 1 (
    echo ❌ 未找到Python，请先安装Python 3.8+
    pause
    exit /b 1
)

echo ✅ Python环境正常
echo.

echo 📦 检查依赖包...
python -c "import gradio, pandas" >nul 2>&1
if errorlevel 1 (
    echo ⚠️  正在安装依赖包...
    pip install -r requirements.txt
    if errorlevel 1 (
        echo ❌ 依赖包安装失败
        pause
        exit /b 1
    )
)

echo ✅ 依赖包检查完成
echo.

echo 🚀 启动后台管理系统...
echo 🌐 访问地址: http://localhost:7860
echo 💡 按 Ctrl+C 停止服务
echo ================================
echo.

python start_admin.py

echo.
echo 👋 后台管理系统已停止
pause