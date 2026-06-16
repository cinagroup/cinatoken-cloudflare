/**
 * TokenRepository - API 令牌数据访问层
 */

import { BaseRepository } from './base.js';
import type { Token } from '../types/index.js';

export class TokenRepository extends BaseRepository<Token> {
  constructor(db: D1Database) {
    super(db, 'tokens');
  }

  /**
   * 根据 API Key 查找令牌
   */
  async findByKey(key: string): Promise<Token | null> {
    return this.findOne({ key });
  }

  /**
   * 根据用户 ID 查找所有令牌
   */
  async findByUserId(userId: number): Promise<Token[]> {
    return this.findMany(
      { user_id: userId },
      { orderBy: 'created_time', order: 'DESC' }
    );
  }

  /**
   * 创建令牌
   */
  async createToken(data: {
    user_id: number;
    key: string;
    name: string;
    expired_time?: number;
    remain_quota?: number;
    unlimited_quota?: number;
    models?: string;
    subnet?: string;
    group_name?: string;
  }): Promise<number> {
    return this.insert({
      user_id: data.user_id,
      key: data.key,
      name: data.name,
      status: 1,
      created_time: Date.now(),
      expired_time: data.expired_time ?? null,
      remain_quota: data.remain_quota ?? -1,
      unlimited_quota: data.unlimited_quota ?? 0,
      used_quota: 0,
      models: data.models ?? null,
      subnet: data.subnet ?? null,
      group_name: data.group_name ?? null,
    });
  }

  /**
   * 更新最后访问时间
   */
  async updateAccessedTime(tokenId: number): Promise<void> {
    await this.updateById(tokenId, { accessed_time: Date.now() });
  }

  /**
   * 扣减令牌配额（原子操作）
   */
  async increaseUsedQuota(tokenId: number, amount: number): Promise<void> {
    await this.db
      .prepare(
        `UPDATE tokens SET used_quota = used_quota + ?,
         remain_quota = CASE WHEN remain_quota > 0 THEN remain_quota - ? ELSE remain_quota END
         WHERE id = ?`
      )
      .bind(amount, amount, tokenId)
      .run();
  }

  /**
   * 检查令牌是否有效（未过期、有配额）
   */
  async isValid(tokenId: number): Promise<boolean> {
    const token = await this.findById(tokenId);
    if (!token || token.status !== 1) return false;

    // 检查过期
    if (token.expired_time && token.expired_time < Date.now()) {
      return false;
    }

    // 检查配额
    if (token.unlimited_quota === 0 && token.remain_quota === 0) {
      return false;
    }

    return true;
  }

  /**
   * 将过期令牌标记为已过期
   */
  async markExpiredTokens(): Promise<number> {
    const result = await this.db
      .prepare(
        `UPDATE tokens SET status = 3
         WHERE status = 1 AND expired_time IS NOT NULL AND expired_time < ?`
      )
      .bind(Date.now())
      .run();

    return result.meta.changes ?? 0;
  }

  /**
   * 分页查询用户的令牌
   */
  async paginateByUserId(
    userId: number,
    page: number = 1,
    pageSize: number = 20
  ): Promise<{ items: Token[]; total: number }> {
    return this.paginate(page, pageSize, { user_id: userId }, 'created_time', 'DESC');
  }
}
