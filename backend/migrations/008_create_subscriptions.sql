-- 008_create_subscriptions.sql
-- 订阅相关表

-- 订阅计划
CREATE TABLE IF NOT EXISTS subscription_plans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT,
  price REAL NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'CNY',
  duration_days INTEGER NOT NULL,         -- 时长（天）
  quota INTEGER NOT NULL DEFAULT 0,       -- 包含配额
  status INTEGER NOT NULL DEFAULT 1,      -- 1:启用, 2:禁用
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- 用户订阅记录
CREATE TABLE IF NOT EXISTS user_subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  plan_id INTEGER NOT NULL,
  status INTEGER NOT NULL DEFAULT 1,      -- 1:活跃, 2:已取消, 3:已过期
  start_time INTEGER NOT NULL,
  end_time INTEGER NOT NULL,
  quota_granted INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (plan_id) REFERENCES subscription_plans(id)
);

CREATE INDEX IF NOT EXISTS idx_sub_plans_status ON subscription_plans(status);
CREATE INDEX IF NOT EXISTS idx_user_subs_user_id ON user_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_subs_status ON user_subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_user_subs_end_time ON user_subscriptions(end_time);
