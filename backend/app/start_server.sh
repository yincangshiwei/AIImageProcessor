#!/bin/bash

# 检查环境变量
if [ -z "$GEMINI_API_KEY" ]; then
  echo "设置GEMINI_API_KEY环境变量..."
  export GEMINI_API_KEY=""
fi

if [ -z "$GEMINI_BASE_URL" ]; then
  echo "设置GEMINI_BASE_URL环境变量..."
  export GEMINI_BASE_URL="https://aihubmix.com/v1"
fi

# 创建目录
mkdir -p /workspace/backend/uploads
mkdir -p /workspace/backend/outputs
mkdir -p /workspace/static

# 运行后端服务
cd /workspace/backend
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
