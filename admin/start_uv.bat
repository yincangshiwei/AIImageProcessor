@echo off
chcp 65001 >nul
echo 🎨 AI图像编辑平台后台管理系统 (uv环境)
echo ========================================
echo.

cd /d "%~dp0"

echo 📂 当前目录: %CD%
echo.

set UV_ENV_PATH=I:\dev_works\python_venv\ai_image_processor
set PYTHON_EXE=%UV_ENV_PATH%\Scripts\python.exe

echo 🔍 检查uv环境...
if not exist "%UV_ENV_PATH%" (
    echo ❌ uv环境不存在: %UV_ENV_PATH%
    echo.
    echo 💡 请先创建uv环境:
    echo    uv venv %UV_ENV_PATH%
    echo    uv pip install gradio pandas pillow matplotlib numpy
    pause
    exit /b 1
)

if not exist "%PYTHON_EXE%" (
    echo ❌ Python可执行文件不存在: %PYTHON_EXE%
    pause
    exit /b 1
)

echo ✅ uv环境检查通过
echo.

echo 📦 安装/检查依赖包...
"%PYTHON_EXE%" -m pip install -r requirements.txt
if errorlevel 1 (
    echo ❌ 依赖包安装失败
    pause
    exit /b 1
)

echo ✅ 依赖包检查完成
echo.

echo 🚀 启动后台管理系统...
echo 🌐 访问地址: http://localhost:7860
echo 💡 按 Ctrl+C 停止服务
echo ========================================
echo.

"%PYTHON_EXE%" app.py

echo.
echo 👋 后台管理系统已停止
pause