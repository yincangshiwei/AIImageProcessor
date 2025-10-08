# 数据库设计文档

## 🗄️ 数据库概述

**数据库类型**: SQLite 3.x
**字符编码**: UTF-8
**时间格式**: ISO 8601 (YYYY-MM-DD HH:MM:SS)

## 📊 数据表设计

### 1. auth_codes (授权码表)

**表描述**: 存储用户授权码信息，控制平台访问权限

```sql
CREATE TABLE auth_codes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code VARCHAR(100) UNIQUE NOT NULL,           -- 授权码（唯一）
    credits INTEGER DEFAULT 0,                   -- 当前积分余额
    expire_time DATETIME,                        -- 过期时间
    status VARCHAR(20) DEFAULT 'active',         -- 状态：active/disabled/expired
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 索引
CREATE INDEX idx_auth_codes_code ON auth_codes(code);
CREATE INDEX idx_auth_codes_status ON auth_codes(status);
```

**字段说明**:
- `id`: 主键，自增ID
- `code`: 授权码，唯一标识符，用于用户登录验证
- `credits`: 当前剩余积分，用于消耗控制
- `expire_time`: 授权码过期时间，NULL表示永不过期
- `status`: 状态标识
  - `active`: 正常可用
  - `disabled`: 管理员禁用
  - `expired`: 已过期

**示例数据**:
```sql
INSERT INTO auth_codes (code, credits, expire_time, status) VALUES 
('AUTH001', 1000, '2025-12-31 23:59:59', 'active'),
('AUTH002', 500, NULL, 'active'),
('AUTH003', 0, '2025-09-30 23:59:59', 'expired');
```

### 2. generation_records (生成记录表)

**表描述**: 记录用户的所有图像生成历史，包含完整的生成参数

```sql
CREATE TABLE generation_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    auth_code VARCHAR(100) NOT NULL,             -- 关联授权码
    mode_type VARCHAR(20) NOT NULL,              -- 模式：multi/puzzle
    input_images TEXT,                           -- 输入图像路径（JSON格式）
    prompt_text TEXT NOT NULL,                   -- 用户提示词
    output_count INTEGER NOT NULL,               -- 输出图像数量
    output_images TEXT,                          -- 输出图像路径（JSON格式）
    credits_used INTEGER NOT NULL,               -- 消耗积分数
    processing_time INTEGER,                     -- 处理耗时（秒）
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (auth_code) REFERENCES auth_codes(code) ON DELETE CASCADE
);

-- 索引
CREATE INDEX idx_generation_auth_code ON generation_records(auth_code);
CREATE INDEX idx_generation_created_at ON generation_records(created_at);
CREATE INDEX idx_generation_mode ON generation_records(mode_type);
```

**字段说明**:
- `mode_type`: 生成模式
  - `multi`: 多图模式（默认）
  - `puzzle`: 拼图模式
- `input_images`: JSON格式存储输入图像路径列表
  ```json
  ["/uploads/user1/input1.jpg", "/uploads/user1/input2.jpg"]
  ```
- `output_images`: JSON格式存储输出图像路径列表
  ```json
  ["/outputs/user1/result1.jpg", "/outputs/user1/result2.jpg"]
  ```
- `credits_used`: 本次生成消耗的积分数
- `processing_time`: Gemini API处理时间，用于性能分析

**示例数据**:
```sql
INSERT INTO generation_records (auth_code, mode_type, input_images, prompt_text, output_count, output_images, credits_used, processing_time) VALUES 
('AUTH001', 'multi', '["/uploads/img1.jpg", "/uploads/img2.jpg"]', '将这两张图片合成一个科幻风格的海报', 2, '["/outputs/result1.jpg", "/outputs/result2.jpg"]', 20, 15);
```

### 3. template_cases (案例模板表)

**表描述**: 存储系统预设的案例模板，供用户参考和复用

```sql
CREATE TABLE template_cases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category VARCHAR(50) NOT NULL,               -- 案例分类
    title VARCHAR(200) NOT NULL,                 -- 案例标题
    description TEXT,                            -- 案例描述
    preview_image VARCHAR(500),                  -- 预览图路径
    input_images TEXT,                           -- 示例输入图（JSON格式）
    prompt_text TEXT NOT NULL,                   -- 提示词模板
    tags TEXT,                                   -- 标签（JSON格式）
    popularity INTEGER DEFAULT 0,               -- 热度分数
    mode_type VARCHAR(20) NOT NULL,              -- 适用模式
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 索引
CREATE INDEX idx_template_category ON template_cases(category);
CREATE INDEX idx_template_popularity ON template_cases(popularity DESC);
CREATE INDEX idx_template_mode ON template_cases(mode_type);
CREATE VIRTUAL TABLE template_search USING fts5(title, description, prompt_text, tags);
```

**字段说明**:
- `category`: 案例分类（如：科幻风格、卡通风格、艺术创作等）
- `preview_image`: 案例效果预览图
- `input_images`: 示例输入图像，帮助用户理解使用方法
- `tags`: 搜索标签，JSON格式存储
  ```json
  ["科幻", "合成", "海报", "酷炫"]
  ```
- `popularity`: 热度分数，基于使用频次计算
- 使用FTS5全文搜索支持案例搜索功能

**示例数据**:
```sql
INSERT INTO template_cases (category, title, description, preview_image, input_images, prompt_text, tags, popularity, mode_type) VALUES 
('科幻风格', '太空战士合成', '将人物图像与科幻背景合成，创造未来战士效果', '/previews/scifi_warrior.jpg', '["/examples/person.jpg", "/examples/space_bg.jpg"]', '将第一张图片中的人物与第二张太空背景合成，打造酷炫的太空战士形象，添加科幻装甲和光效', '["科幻", "合成", "战士", "太空"]', 156, 'multi');
```

### 4. credit_transactions (积分交易记录表)

**表描述**: 记录所有积分变动，包括消耗、充值、调整等操作

```sql
CREATE TABLE credit_transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    auth_code VARCHAR(100) NOT NULL,             -- 关联授权码
    amount INTEGER NOT NULL,                     -- 积分变动量（正数增加，负数扣除）
    transaction_type VARCHAR(30) NOT NULL,       -- 交易类型
    description TEXT,                            -- 变动描述
    related_record_id INTEGER,                   -- 关联的生成记录ID
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (auth_code) REFERENCES auth_codes(code) ON DELETE CASCADE,
    FOREIGN KEY (related_record_id) REFERENCES generation_records(id) ON DELETE SET NULL
);

-- 索引
CREATE INDEX idx_credit_auth_code ON credit_transactions(auth_code);
CREATE INDEX idx_credit_created_at ON credit_transactions(created_at);
CREATE INDEX idx_credit_type ON credit_transactions(transaction_type);
```

**字段说明**:
- `amount`: 积分变动量
  - 正数：积分增加（充值、奖励、调整）
  - 负数：积分扣除（生成消耗、惩罚）
- `transaction_type`: 交易类型
  - `generation`: 图像生成消耗
  - `adjustment`: 管理员调整
  - `refund`: 退款
  - `reward`: 奖励
  - `initial`: 初始积分
- `related_record_id`: 关联的生成记录，便于追踪消耗来源

**示例数据**:
```sql
INSERT INTO credit_transactions (auth_code, amount, transaction_type, description, related_record_id) VALUES 
('AUTH001', 1000, 'initial', '初始积分分配', NULL),
('AUTH001', -20, 'generation', '多图模式生成消耗', 1),
('AUTH001', 100, 'reward', '活动奖励积分', NULL);
```

### 5. case_usage_stats (案例使用统计表)

**表描述**: 统计案例的使用情况，用于热度计算和推荐优化

```sql
CREATE TABLE case_usage_stats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    case_id INTEGER NOT NULL,                    -- 案例ID
    auth_code VARCHAR(100) NOT NULL,             -- 使用者授权码
    usage_type VARCHAR(20) NOT NULL,             -- 使用类型
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (case_id) REFERENCES template_cases(id) ON DELETE CASCADE,
    FOREIGN KEY (auth_code) REFERENCES auth_codes(code) ON DELETE CASCADE
);

-- 索引
CREATE INDEX idx_usage_case_id ON case_usage_stats(case_id);
CREATE INDEX idx_usage_created_at ON case_usage_stats(created_at);
```

**字段说明**:
- `usage_type`: 使用类型
  - `view`: 查看案例
  - `use_all`: 复用全部内容（图片+提示词）
  - `use_prompt`: 仅复用提示词
  - `recommend_click`: 推荐点击

## 🔄 数据关系

```
auth_codes (1) ──── (N) generation_records
     │                       │
     │                       │
     └─── (N) credit_transactions
     │                       │
     │                       │
     └─── (N) case_usage_stats
                             │
                             │
template_cases (1) ────────── (N) case_usage_stats
```

## 📈 数据统计查询

### 1. 热门案例统计
```sql
-- 更新案例热度分数
UPDATE template_cases 
SET popularity = (
    SELECT COUNT(*) 
    FROM case_usage_stats 
    WHERE case_id = template_cases.id 
    AND usage_type IN ('use_all', 'use_prompt')
    AND created_at >= datetime('now', '-30 days')
);
```

### 2. 用户活跃度统计
```sql
-- 获取活跃用户统计
SELECT 
    auth_code,
    COUNT(*) as generation_count,
    SUM(credits_used) as total_credits_used,
    MAX(created_at) as last_activity
FROM generation_records 
WHERE created_at >= datetime('now', '-7 days')
GROUP BY auth_code
ORDER BY generation_count DESC;
```

### 3. 积分使用分析
```sql
-- 积分消耗统计
SELECT 
    DATE(created_at) as date,
    SUM(CASE WHEN amount < 0 THEN -amount ELSE 0 END) as credits_consumed,
    COUNT(CASE WHEN transaction_type = 'generation' THEN 1 END) as generation_count
FROM credit_transactions 
WHERE created_at >= datetime('now', '-30 days')
GROUP BY DATE(created_at)
ORDER BY date;
```

## 🔧 数据维护

### 1. 数据清理策略
```sql
-- 清理过期的生成记录（保留90天）
DELETE FROM generation_records 
WHERE created_at < datetime('now', '-90 days');

-- 清理过期的使用统计（保留180天）
DELETE FROM case_usage_stats 
WHERE created_at < datetime('now', '-180 days');
```

### 2. 数据备份
```bash
# 定期备份数据库
sqlite3 app.db ".backup backup_$(date +%Y%m%d).db"

# 压缩备份
tar -czf backup_$(date +%Y%m%d).tar.gz backup_$(date +%Y%m%d).db
```

### 3. 性能优化
```sql
-- 定期重建索引
REINDEX;

-- 分析查询性能
ANALYZE;

-- 清理碎片
VACUUM;
```

## 🛡️ 数据安全

### 1. 数据约束
- 所有时间字段使用UTC时间
- JSON字段使用有效的JSON格式
- 外键约束确保数据完整性
- 唯一约束防止重复数据

### 2. 访问控制
- 数据库文件权限设置为600（仅所有者可读写）
- API层面的数据访问权限控制
- 敏感信息不直接存储在数据库中

---

**更新时间**: 2025-08-27
**版本**: v1.0  
**状态**: 数据库设计完成 ✅