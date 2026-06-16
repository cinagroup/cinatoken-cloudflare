-- 003_create_channels.sql
-- 渠道表（上游 AI 服务商）

CREATE TABLE IF NOT EXISTS channels (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type INTEGER NOT NULL,                  -- 渠道类型（1:OpenAI, 2:Claude, 3:Gemini...）
  key TEXT NOT NULL,                      -- 上游 API Key
  status INTEGER NOT NULL DEFAULT 1,      -- 1:启用, 2:禁用, 3:自动禁用
  name TEXT NOT NULL,                     -- 渠道名称
  weight INTEGER NOT NULL DEFAULT 0,      -- 负载均衡权重
  created_time INTEGER NOT NULL,
  test_time INTEGER,                      -- 最后测试时间
  response_time INTEGER,                  -- 响应时间（ms）
  balance REAL NOT NULL DEFAULT 0,        -- 余额
  models TEXT,                            -- 支持的模型列表（JSON 数组）
  group_name TEXT NOT NULL DEFAULT 'default',
  base_url TEXT,                          -- 基础 URL（自定义代理）
  other TEXT,                             -- 其他配置（JSON）
  model_mapping TEXT,                     -- 模型名称映射（JSON）
  priority INTEGER NOT NULL DEFAULT 0,    -- 优先级（越大越优先）
  auto_balance INTEGER NOT NULL DEFAULT 1,-- 自动更新余额 0:否 1:是
  setting TEXT,                           -- 渠道设置（JSON）
  tag TEXT,                               -- 渠道标签
  used_quota INTEGER NOT NULL DEFAULT 0   -- 已消耗配额
);

CREATE INDEX IF NOT EXISTS idx_channels_status ON channels(status);
CREATE INDEX IF NOT EXISTS idx_channels_type ON channels(type);
CREATE INDEX IF NOT EXISTS idx_channels_group ON channels(group_name);
CREATE INDEX IF NOT EXISTS idx_channels_priority ON channels(priority);
CREATE INDEX IF NOT EXISTS idx_channels_tag ON channels(tag);
