-- 004_create_logs.sql
-- 日志表（消费记录）

CREATE TABLE IF NOT EXISTS logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,                        -- 用户 ID
  token_id INTEGER,                       -- 令牌 ID
  channel_id INTEGER,                     -- 渠道 ID
  token_name TEXT,                        -- 令牌名称（冗余）
  username TEXT,                          -- 用户名（冗余）
  type INTEGER NOT NULL,                  -- 1:充值, 2:消费, 3:管理, 4:惩罚
  content TEXT NOT NULL,                  -- 日志内容（JSON）
  model_name TEXT,                        -- 模型名称
  prompt_tokens INTEGER NOT NULL DEFAULT 0,
  completion_tokens INTEGER NOT NULL DEFAULT 0,
  quota INTEGER NOT NULL DEFAULT 0,       -- 消耗/充值的配额
  created_at INTEGER NOT NULL,
  channel_name TEXT,                      -- 渠道名称（冗余）
  group_name TEXT                         -- 分组（冗余）
);

CREATE INDEX IF NOT EXISTS idx_logs_user_id ON logs(user_id);
CREATE INDEX IF NOT EXISTS idx_logs_token_id ON logs(token_id);
CREATE INDEX IF NOT EXISTS idx_logs_channel_id ON logs(channel_id);
CREATE INDEX IF NOT EXISTS idx_logs_type ON logs(type);
CREATE INDEX IF NOT EXISTS idx_logs_model_name ON logs(model_name);
CREATE INDEX IF NOT EXISTS idx_logs_created_at ON logs(created_at);
