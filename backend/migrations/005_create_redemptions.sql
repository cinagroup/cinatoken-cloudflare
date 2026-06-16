-- 005_create_redemptions.sql
-- 兑换码表

CREATE TABLE IF NOT EXISTS redemptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,                     -- 兑换码名称/备注
  key TEXT NOT NULL UNIQUE,               -- 兑换码
  status INTEGER NOT NULL DEFAULT 1,      -- 1:未使用, 2:已使用, 3:已禁用
  quota INTEGER NOT NULL,                 -- 可兑换的配额
  created_time INTEGER NOT NULL,
  redeemed_time INTEGER,                  -- 兑换时间
  user_id INTEGER,                        -- 兑换用户 ID
  redeemed_by TEXT                        -- 兑换用户名（冗余）
);

CREATE INDEX IF NOT EXISTS idx_redemptions_key ON redemptions(key);
CREATE INDEX IF NOT EXISTS idx_redemptions_status ON redemptions(status);
CREATE INDEX IF NOT EXISTS idx_redemptions_user_id ON redemptions(user_id);
