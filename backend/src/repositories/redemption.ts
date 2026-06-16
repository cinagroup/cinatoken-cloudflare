/**
 * RedemptionRepository - 兑换码数据访问层
 */

import { BaseRepository } from './base.js';
import type { Redemption } from '../types/index.js';

export class RedemptionRepository extends BaseRepository<Redemption> {
  constructor(db: D1Database) {
    super(db, 'redemptions');
  }

  /**
   * 根据兑换码查找
   */
  async findByKey(key: string): Promise<Redemption | null> {
    return this.findOne({ key });
  }

  /**
   * 创建兑换码
   */
  async create(data: {
    name: string;
    key: string;
    quota: number;
  }): Promise<number> {
    return this.insert({
      name: data.name,
      key: data.key,
      status: 1,
      quota: data.quota,
      created_time: Date.now(),
      redeemed_time: null,
      user_id: null,
      redeemed_by: null,
    });
  }

  /**
   * 兑换码核销（原子操作，防并发）
   * 返回兑换码信息（如已被使用返回 null）
   */
  async redeem(
    key: string,
    userId: number,
    username: string
  ): Promise<Redemption | null> {
    // 先查询兑换码
    const redemption = await this.findByKey(key);
    if (!redemption || redemption.status !== 1) {
      return null;
    }

    // 原子更新：只有 status=1 时才更新
    const result = await this.db
      .prepare(
        `UPDATE redemptions
         SET status = 2, redeemed_time = ?, user_id = ?, redeemed_by = ?
         WHERE id = ? AND status = 1`
      )
      .bind(Date.now(), userId, username, redemption.id)
      .run();

    if (result.meta.changes === 0) {
      // 并发竞争失败
      return null;
    }

    return redemption;
  }

  /**
   * 批量创建兑换码
   */
  async createBatch(
    items: Array<{ name: string; key: string; quota: number }>
  ): Promise<number[]> {
    const ids: number[] = [];

    for (const item of items) {
      const id = await this.create(item);
      ids.push(id);
    }

    return ids;
  }

  /**
   * 删除无效兑换码（已使用超过指定时间）
   */
  async deleteInvalid(beforeTime: number): Promise<number> {
    const result = await this.db
      .prepare('DELETE FROM redemptions WHERE status = 2 AND redeemed_time < ?')
      .bind(beforeTime)
      .run();
    return result.meta.changes ?? 0;
  }

  /**
   * 分页查询（兼容基类签名）
   */
  async listPaginated(
    page: number = 1,
    pageSize: number = 20
  ): Promise<{ items: Redemption[]; total: number; page: number; pageSize: number }> {
    const result = await super.paginate(page, pageSize, undefined, 'created_time', 'DESC');
    return result;
  }
}
