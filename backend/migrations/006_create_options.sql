-- 006_create_options.sql
-- 系统配置表（key-value）

CREATE TABLE IF NOT EXISTS options (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,                    -- JSON 格式值
  updated_at INTEGER NOT NULL
);
