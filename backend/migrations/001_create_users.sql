-- 001_create_users.sql
-- 用户表

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  email TEXT,
  role INTEGER NOT NULL DEFAULT 1,        -- 1:普通用户, 10:管理员, 100:超级管理员
  status INTEGER NOT NULL DEFAULT 1,      -- 1:正常, 2:禁用
  quota INTEGER NOT NULL DEFAULT 0,       -- 总配额
  used_quota INTEGER NOT NULL DEFAULT 0,  -- 已用配额
  request_count INTEGER NOT NULL DEFAULT 0,
  group_name TEXT NOT NULL DEFAULT 'default',
  af_code TEXT,                           -- 邀请码
  aff_count INTEGER NOT NULL DEFAULT 0,   -- 邀请人数
  inviter_id INTEGER,                     -- 邀请人 ID
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_af_code ON users(af_code);
CREATE INDEX IF NOT EXISTS idx_users_inviter_id ON users(inviter_id);
CREATE INDEX IF NOT EXISTS idx_users_created_at ON users(created_at);
