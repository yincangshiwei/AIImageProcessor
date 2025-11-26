#!/bin/bash

# 颜色定义
GREEN="\033[0;32m"
YELLOW="\033[0;33m"
BLUE="\033[0;34m"
PURPLE="\033[0;35m"
RESET="\033[0m"

echo -e "${BLUE}====================================${RESET}"
echo -e "${PURPLE}       AI 图片编辑器启动脚本${RESET}"
echo -e "${BLUE}====================================${RESET}"

# 检查端口占用情况
check_port() {
  local port=$1
  if lsof -Pi :$port -sTCP:LISTEN -t >/dev/null ; then
    echo -e "${YELLOW}警告: 端口 $port 已被占用${RESET}"
    echo -e "可能需要先关闭占用该端口的进程"
    read -p "是否继续启动? (y/n): " continue_launch
    if [[ $continue_launch != "y" && $continue_launch != "Y" ]]; then
      exit 1
    fi
  fi
}

# 检查端口
check_port 3000  # 前端
check_port 8000  # 后端
check_port 7860  # 管理后台

# 创建必要的目录
echo -e "${GREEN}正在检查并创建必要目录...${RESET}"
mkdir -p backend/uploads
mkdir -p backend/outputs

# 启动后端
echo -e "${GREEN}正在启动后端服务...${RESET}"
cd backend && python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload &
backend_pid=$!
echo -e "${GREEN}后端服务已启动 (PID: $backend_pid)${RESET}"

# 启动前端
echo -e "${GREEN}正在启动前端服务...${RESET}"
cd ../frontend/ai-image-editor-frontend && pnpm dev --port 3000 &
frontend_pid=$!
echo -e "${GREEN}前端服务已启动 (PID: $frontend_pid)${RESET}"

# 启动管理后台
echo -e "${GREEN}正在启动管理后台...${RESET}"
cd ../../admin && python app.py &
admin_pid=$!
echo -e "${GREEN}管理后台已启动 (PID: $admin_pid)${RESET}"

echo -e "${BLUE}====================================${RESET}"
echo -e "${PURPLE}服务已全部启动:${RESET}"
echo -e "${GREEN}- 前端: http://localhost:3000${RESET}"
echo -e "${GREEN}- 后端 API: http://localhost:8000${RESET}"
echo -e "${GREEN}- 管理后台: http://localhost:7860${RESET}"
echo -e "${BLUE}====================================${RESET}"

echo -e "按 Ctrl+C 停止所有服务..."

# 捕获中断信号，优雅地关闭所有服务
trap "echo -e '${YELLOW}正在停止所有服务...${RESET}'; kill $backend_pid $frontend_pid $admin_pid 2>/dev/null; exit 0" INT

# 等待用户中断
wait
