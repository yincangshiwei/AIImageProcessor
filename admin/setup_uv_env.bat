@echo off
chcp 65001 >nul
echo 🔧 设置uv环境 - AI图像编辑平台后台管理
echo ==========================================
echo.

set UV_ENV_PATH=I:\dev_works\python_venv\ai_image_processor

echo 📍 目标环境路径: %UV_ENV_PATH%
echo.

echo 🔍 检查uv是否已安装...
uv --version >nul 2>&1
if errorlevel 1 (
    echo ❌ uv未安装，请先安装uv:
    echo    pip install uv
    echo    或访问: https://github.com/astral-sh/uv
    pause
    exit /b 1
)

echo ✅ uv已安装
echo.

echo 🏗️  创建uv环境...
if exist "%UV_ENV_PATH%" (
    echo ⚠️  环境已存在，跳过创建
) else (
    uv venv "%UV_ENV_PATH%"
    if errorlevel 1 (
        echo ❌ 环境创建失败
        pause
        exit /b 1
    )
    echo ✅ 环境创建成功
)
echo.

echo 📦 安装依赖包...
uv pip install --python "%UV_ENV_PATH%\Scripts\python.exe" gradio pandas pillow matplotlib numpy
if errorlevel 1 (
    echo ❌ 依赖包安装失败
    pause
    exit /b 1
)

echo ✅ 依赖包安装完成
echo.

echo 🎉 uv环境设置完成！
echo.
echo 💡 现在可以使用以下方式启动后台管理：
echo    1. 双击 start_uv.bat
echo    2. 运行 python start_with_uv.py
echo.
echo 🌐 启动后访问: http://localhost:7860
echo.
pause