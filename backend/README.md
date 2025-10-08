# AI图像编辑平台 - 后端API

基于FastAPI构建的后端API服务，提供图像处理、用户认证、数据管理等核心功能。

## 🚀 快速启动

### 安装依赖
```bash
pip install -r requirements.txt
```

### 初始化数据库
```bash
# 在项目根目录执行
cd ..
python init_db.py
```

### 启动服务
```bash
python main.py
```

访问地址：
- API服务：http://localhost:8000
- API文档：http://localhost:8000/docs
- 交互式文档：http://localhost:8000/redoc

## 📋 API接口

### 认证相关
- `POST /auth/verify` - 验证授权码
- `GET /auth/credits/{code}` - 查询积分余额

### 图像处理
- `POST /images/generate` - 生成AI图像
- `POST /images/upload` - 上传图片
- `GET /images/download/{filename}` - 下载图片

### 用户数据
- `GET /users/history/{code}` - 获取历史记录
- `POST /users/save-generation` - 保存生成记录

### 案例库
- `GET /cases/list` - 获取案例列表
- `GET /cases/{id}` - 获取案例详情
- `GET /cases/search` - 搜索案例

## ⚙️ 配置说明

### 环境配置
在 `app/core/config.py` 中配置：

```python
# Gemini API配置
GEMINI_API_KEY = "your-gemini-api-key"

# 数据库配置
DATABASE_URL = "sqlite:///./app.db"

# 文件上传配置
UPLOAD_DIR = "uploads"
OUTPUT_DIR = "outputs"
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB
```

### 环境变量
创建 `.env` 文件：
```env
GEMINI_API_KEY=your-gemini-api-key-here
DEBUG=True
```

## 🗄️ 数据库初始化

### 自动初始化
在项目根目录运行初始化脚本：
```bash
cd ..
python init_db.py
```

### 手动初始化
如果需要手动创建数据库：
```bash
python init_db_direct.py
```

### 数据库表结构
- **auth_codes**: 授权码管理
- **generation_records**: 生成记录
- **cases**: 案例数据
- **credit_adjustments**: 积分调整记录

## 🏗️ 项目结构

```
backend/
├── main.py                 # 主应用入口
├── requirements.txt        # 依赖包
├── app/
│   ├── __init__.py
│   ├── init_db.py         # 数据库初始化
│   ├── models.py          # 数据模型
│   ├── schemas.py         # Pydantic模型
│   ├── crud.py            # 数据库操作
│   ├── database.py        # 数据库连接
│   ├── api/               # API路由
│   │   ├── auth.py        # 认证接口
│   │   ├── images.py      # 图像处理接口
│   │   ├── users.py       # 用户接口
│   │   └── cases.py       # 案例接口
│   └── core/              # 核心模块
│       ├── config.py      # 配置文件
│       └── gemini.py      # Gemini API集成
├── uploads/               # 上传文件目录
├── outputs/               # 输出文件目录
└── static/                # 静态文件目录
```

## 🔧 开发说明

### 主要依赖
- `fastapi`: Web框架
- `uvicorn`: ASGI服务器
- `sqlalchemy`: ORM框架
- `pydantic`: 数据验证
- `pillow`: 图像处理
- `google-generativeai`: Gemini API

### 开发模式启动
```bash
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

### 生产模式部署
```bash
gunicorn -w 4 -k uvicorn.workers.UvicornWorker main:app --bind 0.0.0.0:8000
```

## 🔍 API使用示例

### 验证授权码
```bash
curl -X POST "http://localhost:8000/auth/verify" \
     -H "Content-Type: application/json" \
     -d '{"code": "DEMO2025"}'
```

### 生成图像
```bash
curl -X POST "http://localhost:8000/images/generate" \
     -H "Content-Type: application/json" \
     -d '{
       "auth_code": "DEMO2025",
       "prompt": "一只可爱的小猫",
       "mode": "single",
       "count": 1
     }'
```

## 🚨 注意事项

1. **API密钥**: 确保Gemini API密钥配置正确
2. **文件权限**: 确保uploads和outputs目录有写权限
3. **数据库**: 首次运行前必须初始化数据库
4. **端口**: 默认端口8000，确保未被占用
5. **CORS**: 生产环境需要配置正确的CORS策略

## 🔍 故障排除

### 常见问题

**数据库连接失败**
```bash
# 检查数据库文件
ls -la app.db

# 重新初始化数据库
python app/init_db.py
```

**API密钥错误**
- 检查 `.env` 文件中的 `GEMINI_API_KEY`
- 确认API密钥有效且有足够配额

**文件上传失败**
```bash
# 检查目录权限
chmod 755 uploads outputs

# 创建缺失目录
mkdir -p uploads outputs
```

**服务启动失败**
- 检查端口8000是否被占用
- 确认所有依赖包已正确安装

## 📊 性能优化

### 数据库优化
- 定期清理过期的生成记录
- 为常用查询字段添加索引

### 文件管理
- 定期清理临时文件
- 配置文件大小限制

### API优化
- 使用异步处理长时间任务
- 实现请求限流和缓存

## 📞 技术支持

如遇问题，请检查：
1. Python版本是否为3.8+
2. 所有依赖包是否正确安装
3. 数据库是否正确初始化
4. API密钥配置是否正确
5. 文件目录权限是否正确