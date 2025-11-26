# AI图像编辑平台 - 后端API

基于FastAPI构建的后端API服务，提供图像处理、用户认证、数据管理等核心功能。

## 🚀 快速启动

### 安装依赖
```bash
pip install -r requirements.txt
```

### 初始化数据库
在启动服务前，确保 Postgres 中已经创建 `AIImageProcessor` 数据库并且 `backend/conf/database.json` 填写了正确的连接信息，然后在 `backend` 目录执行：

```bash
python app/init_db.py
```

### 启动服务
```bash
python -m app.main
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
- `app/core/config.py` 仍用于配置 API Key、文件目录等通用参数。
- 数据库连接信息现在存放在 `backend/conf/database.json`，示例：

```json
{
  "driver": "postgresql+psycopg2",
  "host": "127.0.0.1",
  "port": 5432,
  "user": "dmspg",
  "password": "pg_DMS2025",
  "database": "AIImageProcessor"
}
```

如需在不同环境中自定义，可通过环境变量 `DATABASE_URL` 覆盖 JSON 中的配置。

```python
# Gemini API配置
GEMINI_API_KEY = "your-gemini-api-key"

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
确保 Postgres 服务已启动且 `backend/conf/database.json` 配置正确：
```bash
cd backend
python app/init_db.py
```

### 手动初始化
如需手动创建数据库与账号，可在 `psql` 中执行：
```sql
CREATE DATABASE "AIImageProcessor";
CREATE USER dmspg WITH PASSWORD 'pg_DMS2025';
GRANT ALL PRIVILEGES ON DATABASE "AIImageProcessor" TO dmspg;
```
然后再次执行 `python app/init_db.py` 以创建表结构和示例数据。

### 数据库表结构
- **auth_codes**: 授权码管理
- **generation_records**: 生成记录
- **cases**: 案例数据
- **credit_adjustments**: 积分调整记录

## 🏗️ 项目结构

```
backend/
├── requirements.txt        # 依赖包
├── app/
│   ├── __init__.py
│   ├── main.py             # 主应用入口
│   ├── crud.py / database.py / schemas.py / models.py
│   ├── init_db.py / init_db_direct.py
│   ├── globalvar.py / SuccessObj.py
│   ├── run_server.py / start_server.sh
│   ├── api/                # 业务 API 路由
│   ├── core/               # 配置、Gemini、图像处理等核心模块
│   ├── routers/            # v1 图像生成路由
│   ├── tool/               # 通用工具集
│   └── examples/           # 示例脚本
├── conf/                   # 数据库等配置文件
├── uploads/                # 上传目录
├── outputs/                # 输出目录
└── static/                 # 静态资源
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
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### 生产模式部署
```bash
gunicorn -w 4 -k uvicorn.workers.UvicornWorker app.main:app --bind 0.0.0.0:8000
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
# 检查 Postgres 服务状态
pg_isready -h 127.0.0.1 -p 5432 -d AIImageProcessor -U dmspg

# 使用配置文件中的连接信息尝试登录
psql "postgresql://dmspg:pg_DMS2025@127.0.0.1:5432/AIImageProcessor"
```
若命令无法连接，请确认 `backend/conf/database.json` 中的主机、端口和凭据与实际环境一致，并确保数据库已创建。

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