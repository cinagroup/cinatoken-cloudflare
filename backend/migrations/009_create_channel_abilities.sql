-- 009_create_channel_abilities.sql
-- 渠道能力表（渠道 <-> 模型多对多映射，用于快速查找）

CREATE TABLE IF NOT EXISTS channel_abilities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  channel_id INTEGER NOT NULL,
  model TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,     -- 0:禁用, 1:启用
  priority INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_abilities_model ON channel_abilities(model);
CREATE INDEX IF NOT EXISTS idx_abilities_channel ON channel_abilities(channel_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_abilities_unique ON channel_abilities(channel_id, model);
