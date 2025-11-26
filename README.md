# AI图像编辑平台

一个功能完整的AI图像编辑平台，支持多种图像处理模式，包含前端界面、后端API和管理后台。

## 🏗️ 项目架构

```
AIImageProcessor/
├── app.db                    # 统一数据库
├── frontend/                 # 前端应用 (React + Next.js)
├── backend/                  # 后端API (FastAPI)
├── admin/                    # 管理后台 (Gradio)
└── README.md                # 项目说明
└── app.db                  # 数据库
```

## 🚀 快速启动

### 方式一：一键启动所有服务

```bash
python start_all_services.py
```

### 方式二：分别启动各服务

**1. 初始化数据库（首次运行必须执行）**
```bash
python init_db.py
```

**2. 启动后端API服务**
```bash
cd backend
pip install -r requirements.txt
python -m app.main
```
访问地址：http://localhost:8000
API文档：http://localhost:8000/docs

**3. 启动管理后台**
```bash
cd admin
pip install -r requirements.txt
python app.py
```
访问地址：http://localhost:7860

**4. 启动前端应用**
```bash
cd frontend/ai-image-editor
npm install
npm run dev
```
访问地址：http://localhost:3000

## 📋 功能特性

### 前端功能
- 🎨 **图像编辑**：支持拼图模式和多图模式
- 💰 **积分系统**：显示用户积分余额
- 📚 **历史记录**：查看和复用历史生成记录
- 🎯 **案例库**：丰富的案例模板供参考
- 🔍 **智能搜索**：快速定位相关案例
- 📱 **响应式设计**：适配手机、平板、电脑

### 后台管理
- 🔑 **授权码管理**：新增、修改、删除授权码
- 💳 **积分管理**：积分调整和记录查询
- 📊 **生成记录**：查看所有用户生成历史
- 🎨 **案例管理**：管理案例库内容

### API接口
- 🔐 **授权验证**：基于授权码的用户认证
- 🖼️ **图像处理**：支持多种AI图像生成
- 📁 **文件管理**：图片上传和下载
- 💾 **数据存储**：统一的数据库管理

## 🔧 环境要求

- Python 3.8+
- Node.js 16+
- SQLite 3
- Gemini API密钥

## ⚙️ 配置说明

### 后端配置
在 `backend/app/core/config.py` 中配置：
- Gemini API密钥
- 数据库路径
- 文件上传路径

### 前端配置
在 `frontend/ai-image-editor/.env.local` 中配置：
- API服务地址
- 其他环境变量

## 🗄️ 数据库

项目使用统一的SQLite数据库 `app.db`，包含以下表：
- `auth_codes`: 授权码管理
- `credit_adjustments`: 积分调整记录
- `generation_records`: 图像生成记录
- `cases`: 案例库数据

### 数据库初始化

**首次运行必须初始化数据库：**
```bash
python init_db.py
```

**验证数据库统一性：**
```bash
python verify_unified_database.py
```

**数据库位置：**
- 统一数据库文件：`app.db`（项目根目录）
- 后端和管理后台共享同一数据库
- 自动创建默认授权码和案例数据

## 🔑 默认授权码

系统初始化后包含以下测试授权码：
- `DEMO2025`: 1000积分，1年有效期
- `TEST001`: 500积分，永不过期
- `VIP2025`: 5000积分，90天有效期

## 🚀 生产部署

### 使用PM2管理进程
```bash
# 安装PM2
npm install -g pm2

# 启动所有服务
pm2 start ecosystem.config.js
```

### Nginx反向代理
```nginx
server {
    listen 80;
    server_name your-domain.com;
    
    location / {
        proxy_pass http://localhost:3000;
    }
    
    location /api {
        proxy_pass http://localhost:8000;
    }
    
    location /admin {
        proxy_pass http://localhost:7860;
    }
}
```

## 🛠️ 开发工具

- `verify_unified_database.py`: 验证数据库统一性
- `start_all_services.py`: 一键启动所有服务
- `migrate_database.py`: 数据库迁移工具

## 📝 更新日志

### v1.0.0
- ✅ 完成前端界面开发
- ✅ 完成后端API开发
- ✅ 完成管理后台开发
- ✅ 统一数据库架构
- ✅ 完善部署文档

## 🤝 技术支持

如有问题，请检查：
1. 数据库连接是否正常
2. API密钥配置是否正确
3. 端口是否被占用
4. 依赖包是否完整安装

## 📄 许可证

本项目仅供学习和研究使用。