-- 002_create_tokens.sql
-- API 令牌表

CREATE TABLE IF NOT EXISTS tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  key TEXT NOT NULL UNIQUE,               -- API Key（sk-xxx）
  name TEXT NOT NULL,                     -- 令牌名称
  status INTEGER NOT NULL DEFAULT 1,      -- 1:启用, 2:禁用, 3:已过期
  created_time INTEGER NOT NULL,
  accessed_time INTEGER,                  -- 最后访问时间
  expired_time INTEGER,                   -- 过期时间（null 表示永不过期）
  remain_quota INTEGER NOT NULL DEFAULT -1,  -- 剩余配额（-1 表示无限）
  unlimited_quota INTEGER NOT NULL DEFAULT 0, -- 0:有限, 1:无限
  used_quota INTEGER NOT NULL DEFAULT 0,
  models TEXT,                            -- 允许的模型列表（JSON 数组）
  subnet TEXT,                            -- 允许的 IP 子网（CIDR）
  group_name TEXT,                        -- 令牌分组
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_tokens_key ON tokens(key);
CREATE INDEX IF NOT EXISTS idx_tokens_user_id ON tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_tokens_status ON tokens(status);
CREATE INDEX IF NOT EXISTS idx_tokens_created_time ON tokens(created_time);
