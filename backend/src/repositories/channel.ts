/**
 * ChannelRepository - 渠道数据访问层
 */

import { BaseRepository } from './base.js';
import type { Channel } from '../types/index.js';

export class ChannelRepository extends BaseRepository<Channel> {
  constructor(db: D1Database) {
    super(db, 'channels');
  }

  /**
   * 获取所有启用的渠道
   */
  async findEnabled(): Promise<Channel[]> {
    return this.findMany({ status: 1 }, { orderBy: 'priority', order: 'DESC' });
  }

  /**
   * 根据模型查找可用渠道（通过 channel_abilities 表）
   * 按优先级降序、权重降序排列
   */
  async findByModel(model: string, groupName?: string): Promise<Channel[]> {
    let sql = `
      SELECT c.* FROM channels c
      INNER JOIN channel_abilities ca ON c.id = ca.channel_id
      WHERE ca.model = ? AND ca.enabled = 1 AND c.status = 1
    `;
    const binds: any[] = [model];

    if (groupName && groupName !== 'default') {
      sql += ` AND (c.group_name = 'default' OR c.group_name = ?)`;
      binds.push(groupName);
    }

    sql += ` ORDER BY c.priority DESC, c.weight DESC`;

    const { results } = await this.db.prepare(sql).bind(...binds).all<Channel>();
    return results;
  }

  /**
   * 创建渠道
   */
  async createChannel(data: {
    type: number;
    key: string;
    name: string;
    weight?: number;
    models?: string;
    group_name?: string;
    base_url?: string;
    other?: string;
    model_mapping?: string;
    priority?: number;
    auto_balance?: number;
    setting?: string;
    tag?: string;
  }): Promise<number> {
    return this.insert({
      type: data.type,
      key: data.key,
      status: 1,
      name: data.name,
      weight: data.weight ?? 0,
      created_time: Date.now(),
      balance: 0,
      models: data.models ?? null,
      group_name: data.group_name ?? 'default',
      base_url: data.base_url ?? null,
      other: data.other ?? null,
      model_mapping: data.model_mapping ?? null,
      priority: data.priority ?? 0,
      auto_balance: data.auto_balance ?? 1,
      setting: data.setting ?? null,
      tag: data.tag ?? null,
      used_quota: 0,
    });
  }

  /**
   * 更新渠道测试结果
   */
  async updateTestResult(
    channelId: number,
    responseTime: number,
    success: boolean
  ): Promise<void> {
    await this.updateById(channelId, {
      test_time: Date.now(),
      response_time: responseTime,
      status: success ? 1 : 3, // 失败则自动禁用
    });
  }

  /**
   * 更新渠道余额
   */
  async updateBalance(channelId: number, balance: number): Promise<void> {
    await this.updateById(channelId, { balance });
  }

  /**
   * 增加渠道已用配额
   */
  async increaseUsedQuota(channelId: number, amount: number): Promise<void> {
    await this.db
      .prepare('UPDATE channels SET used_quota = used_quota + ? WHERE id = ?')
      .bind(amount, channelId)
      .run();
  }

  /**
   * 获取所有渠道支持的模型列表（去重）
   */
  async getAllModels(): Promise<string[]> {
    const { results } = await this.db
      .prepare(
        `SELECT DISTINCT model FROM channel_abilities WHERE enabled = 1
         AND channel_id IN (SELECT id FROM channels WHERE status = 1)`
      )
      .all<{ model: string }>();

    return results.map((r) => r.model);
  }

  /**
   * 根据标签查找渠道
   */
  async findByTag(tag: string): Promise<Channel[]> {
    return this.findMany({ tag });
  }

  /**
   * 批量启用/禁用标签下渠道
   */
  async updateStatusByTag(tag: string, status: number): Promise<void> {
    await this.db
      .prepare('UPDATE channels SET status = ? WHERE tag = ?')
      .bind(status, tag)
      .run();
  }

  /**
   * 删除所有禁用渠道
   */
  async deleteDisabled(): Promise<number> {
    const result = await this.db
      .prepare('DELETE FROM channels WHERE status = 2')
      .run();
    return result.meta.changes ?? 0;
  }

  /**
   * 同步渠道模型到 channel_abilities 表
   */
  async syncAbilities(channelId: number, models: string[]): Promise<void> {
    // 先删除旧的能力记录
    await this.db
      .prepare('DELETE FROM channel_abilities WHERE channel_id = ?')
      .bind(channelId)
      .run();

    // 批量插入新的能力记录
    for (const model of models) {
      await this.db
      .prepare(
        'INSERT INTO channel_abilities (channel_id, model, enabled, priority) VALUES (?, ?, 1, 0)'
      )
      .bind(channelId, model)
      .run();
    }
  }
}
