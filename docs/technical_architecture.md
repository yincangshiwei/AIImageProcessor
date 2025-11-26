# AI图像编辑平台 - 技术架构设计

## 🏗️ 整体架构

### 系统架构图
```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   前端应用      │    │    后端API      │    │   管理后台      │
│  (Next.js)     │◄──►│   (FastAPI)     │◄──►│   (Gradio)     │
│  Port: 3000    │    │   Port: 8000    │    │  Port: 7860    │
└─────────────────┘    └──────────────────┘    └─────────────────┘
        │                        │                       │
        │                        │                       │
        ▼                        ▼                       ▼
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   静态资源      │    │   数据存储       │    │  Gemini API    │
│   (Nginx)      │    │  (SQLite)       │    │ (AiHubMix)     │
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

## 📱 前端技术栈

### 1. 核心框架
- **React 18**: 用户界面框架
- **Next.js 14**: React全栈框架
- **TypeScript**: 类型安全的JavaScript

### 2. UI/UX 技术
- **TailwindCSS**: 实用优先的CSS框架
- **Shadcn/ui**: 高质量React组件库
- **Framer Motion**: 动画和过渡效果
- **Lucide React**: 现代图标库

### 3. 图像处理客户端
- **Canvas API**: 原生画布操作
- **Fabric.js**: 高级2D画布库
- **React Dropzone**: 拖拽上传组件
- **Image Cropper**: 图像裁剪功能

### 4. 状态管理
- **Zustand**: 轻量级状态管理
- **React Query**: 服务端状态管理
- **React Hook Form**: 表单状态管理

### 5. 文件结构
```
frontend/
├── app/                 # App Router (Next.js 14)
│   ├── auth/           # 授权验证页面
│   ├── dashboard/      # 主界面
│   ├── history/        # 历史记录
│   └── cases/          # 案例中心
├── components/         # 可复用组件
│   ├── ui/            # Shadcn/ui 组件
│   ├── editor/        # 图像编辑组件
│   └── common/        # 通用组件
├── lib/               # 工具库
│   ├── api.ts         # API客户端
│   ├── utils.ts       # 工具函数
│   └── types.ts       # TypeScript类型
├── styles/            # 样式文件
└── public/            # 静态资源
```

## ⚙️ 后端技术栈

### 1. API框架
- **FastAPI**: 现代Python Web框架
- **Pydantic**: 数据验证和设置管理
- **SQLAlchemy**: SQL工具包和ORM
- **Alembic**: 数据库迁移工具

### 2. 图像处理核心
- **Gemini 2.5 Flash API**: 基于提供的GeminiImage.py
- **OpenAI Client**: API客户端库
- **Pillow (PIL)**: Python图像处理库
- **Base64 Encoding**: 图像编码转换

### 3. 数据存储
- **SQLite**: 轻量级关系数据库
- **文件存储**: 本地文件系统存储图像
- **缓存机制**: 内存缓存提升性能

### 4. 安全与认证
- **JWT**: JSON Web Token认证
- **bcrypt**: 密码哈希
- **CORS**: 跨域资源共享配置
- **Rate Limiting**: 请求频率限制

### 5. 文件结构
```
backend/
├── app/
│   ├── api/           # API路由
│   │   ├── auth.py    # 认证相关
│   │   ├── images.py  # 图像处理
│   │   ├── users.py   # 用户管理
│   │   └── cases.py   # 案例管理
│   ├── core/          # 核心功能
│   │   ├── gemini.py  # Gemini API封装
│   │   ├── security.py # 安全相关
│   │   └── config.py  # 配置管理
│   ├── models/        # 数据模型
│   ├── schemas/       # Pydantic模式
│   └── utils/         # 工具函数
├── migrations/        # 数据库迁移
├── tests/            # 测试文件
└── requirements.txt  # 依赖包
```

## 🖥️ 管理后台技术栈

### 1. 界面框架
- **Gradio**: Python Web UI框架
- **Pandas**: 数据分析和处理
- **Matplotlib**: 数据可视化
- **Plotly**: 交互式图表

### 2. 数据管理
- **SQLite**: 数据库操作
- **CSV Export**: 数据导出功能
- **Backup System**: 数据备份机制

### 3. 文件结构
```
admin/
├── app.py             # Gradio主应用
├── components/        # UI组件
│   ├── auth_manager.py    # 授权码管理
│   ├── record_viewer.py   # 记录查看
│   └── case_manager.py    # 案例管理
├── utils/             # 工具函数
│   ├── database.py    # 数据库操作
│   └── exports.py     # 数据导出
└── static/           # 静态文件
```

## 🗄️ 数据库设计

### SQLite数据库架构

```sql
-- 用户授权码表
CREATE TABLE auth_codes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code VARCHAR(100) UNIQUE NOT NULL,
    credits INTEGER DEFAULT 0,
    expire_time DATETIME,
    status VARCHAR(20) DEFAULT 'active',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 用户生成记录表
CREATE TABLE generation_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    auth_code VARCHAR(100) NOT NULL,
    mode_type VARCHAR(20) NOT NULL, -- 'puzzle' or 'multi'
    input_images TEXT, -- JSON格式存储图像路径列表
    prompt_text TEXT NOT NULL,
    output_count INTEGER NOT NULL,
    output_images TEXT, -- JSON格式存储输出图像路径
    credits_used INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (auth_code) REFERENCES auth_codes(code)
);

-- 案例模板表
CREATE TABLE template_cases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category VARCHAR(50) NOT NULL,
    title VARCHAR(200) NOT NULL,
    description TEXT,
    preview_image VARCHAR(500),
    input_images TEXT, -- JSON格式存储示例图像
    prompt_text TEXT NOT NULL,
    tags TEXT, -- JSON格式存储标签数组
    popularity INTEGER DEFAULT 0,
    mode_type VARCHAR(20) NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 积分变动记录表
CREATE TABLE credit_transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    auth_code VARCHAR(100) NOT NULL,
    amount INTEGER NOT NULL, -- 正数为增加，负数为扣除
    transaction_type VARCHAR(30) NOT NULL, -- 'generation', 'adjustment', 'refund'
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (auth_code) REFERENCES auth_codes(code)
);

-- 案例使用统计表
CREATE TABLE case_usage_stats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    case_id INTEGER NOT NULL,
    auth_code VARCHAR(100) NOT NULL,
    usage_type VARCHAR(20) NOT NULL, -- 'view', 'use_all', 'use_prompt'
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (case_id) REFERENCES template_cases(id),
    FOREIGN KEY (auth_code) REFERENCES auth_codes(code)
);
```

## 🔗 API接口设计

### 1. 认证接口
```python
POST /api/auth/verify          # 授权码验证
GET  /api/auth/user-info       # 获取用户信息
POST /api/auth/refresh         # 刷新令牌
```

### 2. 积分管理接口
```python
GET  /api/credits/balance      # 获取积分余额
GET  /api/credits/history      # 积分变动历史
```

### 3. 图像处理接口
```python
POST /api/generate/multi-mode  # 多图模式生成
POST /api/generate/puzzle-mode # 拼图模式生成
POST /api/upload/images        # 图像上传
GET  /api/download/{image_id}  # 图像下载
```

### 4. 历史记录接口
```python
GET  /api/history/list         # 历史记录列表
GET  /api/history/{record_id}  # 历史记录详情
POST /api/history/reuse        # 复用历史记录
```

### 5. 案例管理接口
```python
GET  /api/cases/list           # 案例列表
GET  /api/cases/search         # 案例搜索
GET  /api/cases/recommend      # 智能推荐
POST /api/cases/use            # 使用案例
```

## 🚀 部署架构

### 1. 开发环境
```bash
# 前端开发服务器
npm run dev     # http://localhost:3000

# 后端API服务器
uvicorn app.main:app --reload --port 8000

# 管理后台
python admin/app.py  # http://localhost:7860
```

### 2. 生产环境
```bash
# 前端构建和部署
npm run build && npm run start

# 后端生产部署
gunicorn -w 4 -k uvicorn.workers.UvicornWorker app.main:app --bind 0.0.0.0:8000

# 管理后台
python admin/app.py --server-port 7860
```

### 3. Nginx配置
```nginx
server {
    listen 80;
    server_name your-domain.com;
    
    # 前端静态文件
    location / {
        proxy_pass http://localhost:3000;
    }
    
    # API接口
    location /api {
        proxy_pass http://localhost:8000;
    }
    
    # 管理后台
    location /admin {
        proxy_pass http://localhost:7860;
    }
}
```

## 🔒 安全考虑

### 1. API安全
- **授权码验证**: 所有API请求必须携带有效授权码
- **请求频率限制**: 防止API滥用
- **文件上传验证**: 严格验证上传文件类型和大小
- **输入sanitization**: 清理用户输入防止注入攻击

### 2. 数据安全
- **敏感信息加密**: API Key等敏感信息加密存储
- **定期备份**: 数据库定期自动备份
- **访问日志**: 详细的访问和操作日志

### 3. 资源管理
- **临时文件清理**: 自动清理过期临时文件
- **磁盘空间监控**: 监控存储空间使用情况
- **内存优化**: 合理管理内存使用

---

**更新时间**: 2025-08-27
**版本**: v1.0
**状态**: 架构设计完成 ✅