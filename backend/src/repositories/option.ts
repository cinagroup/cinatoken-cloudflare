/**
 * OptionRepository - 系统配置数据访问层
 */

import { BaseRepository } from './base.js';
import type { Option } from '../types/index.js';

export class OptionRepository extends BaseRepository<Option> {
  constructor(db: D1Database) {
    super(db, 'options');
  }

  /**
   * 获取配置值
   */
  async get<T = any>(key: string): Promise<T | null> {
    const option = await this.findOne({ key });
    if (!option) return null;

    try {
      return JSON.parse(option.value) as T;
    } catch {
      return option.value as unknown as T;
    }
  }

  /**
   * 设置配置值（upsert）
   */
  async set(key: string, value: any): Promise<void> {
    const valueStr = typeof value === 'string' ? value : JSON.stringify(value);
    const now = Date.now();

    await this.db
      .prepare(
        `INSERT INTO options (key, value, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = ?`
      )
      .bind(key, valueStr, now, valueStr, now)
      .run();
  }

  /**
   * 批量设置配置
   */
  async setMany(items: Record<string, any>): Promise<void> {
    const now = Date.now();

    for (const [key, value] of Object.entries(items)) {
      const valueStr = typeof value === 'string' ? value : JSON.stringify(value);
      await this.db
        .prepare(
          `INSERT INTO options (key, value, updated_at) VALUES (?, ?, ?)
           ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = ?`
        )
        .bind(key, valueStr, now, valueStr, now)
        .run();
    }
  }

  /**
   * 获取所有配置（返回对象）
   */
  async getAllAsObject(): Promise<Record<string, any>> {
    const { results } = await this.db
      .prepare('SELECT key, value FROM options')
      .all<{ key: string; value: string }>();

    const config: Record<string, any> = {};
    for (const row of results) {
      try {
        config[row.key] = JSON.parse(row.value);
      } catch {
        config[row.key] = row.value;
      }
    }

    return config;
  }

  /**
   * 删除配置
   */
  async delete(key: string): Promise<void> {
    await this.db.prepare('DELETE FROM options WHERE key = ?').bind(key).run();
  }
}
