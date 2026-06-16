-- 007_create_model_meta.sql
-- 模型元数据表

CREATE TABLE IF NOT EXISTS model_meta (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  model_name TEXT NOT NULL UNIQUE,        -- 模型标识（如 gpt-4o）
  display_name TEXT,                      -- 显示名称
  description TEXT,                       -- 描述
  icon TEXT,                              -- 图标 URL
  tags TEXT,                              -- 标签（JSON 数组）
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_model_meta_name ON model_meta(model_name);
CREATE INDEX IF NOT EXISTS idx_model_meta_sort ON model_meta(sort_order);
