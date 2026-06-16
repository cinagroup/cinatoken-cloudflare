/**
 * UserRepository - 用户数据访问层
 */

import { BaseRepository } from './base.js';
import type { User } from '../types/index.js';

export class UserRepository extends BaseRepository<User> {
  constructor(db: D1Database) {
    super(db, 'users');
  }

  /**
   * 根据用户名查找用户
   */
  async findByUsername(username: string): Promise<User | null> {
    return this.findOne({ username });
  }

  /**
   * 根据邮箱查找用户
   */
  async findByEmail(email: string): Promise<User | null> {
    return this.findOne({ email });
  }

  /**
   * 根据邀请码查找用户
   */
  async findByAffCode(afCode: string): Promise<User | null> {
    return this.findOne({ af_code: afCode });
  }

  /**
   * 创建用户
   */
  async createUser(data: {
    username: string;
    password_hash: string;
    email?: string;
    role?: number;
    quota?: number;
    group_name?: string;
    af_code?: string;
    inviter_id?: number;
  }): Promise<number> {
    const now = Date.now();
    return this.insert({
      username: data.username,
      password_hash: data.password_hash,
      email: data.email ?? null,
      role: data.role ?? 1,
      status: 1,
      quota: data.quota ?? 0,
      used_quota: 0,
      request_count: 0,
      group_name: data.group_name ?? 'default',
      af_code: data.af_code ?? null,
      aff_count: 0,
      inviter_id: data.inviter_id ?? null,
      created_at: now,
      updated_at: now,
    });
  }

  /**
   * 更新用户配额（增量）
   */
  async increaseQuota(userId: number, amount: number): Promise<void> {
    await this.db
      .prepare('UPDATE users SET quota = quota + ?, updated_at = ? WHERE id = ?')
      .bind(amount, Date.now(), userId)
      .run();
  }

  /**
   * 扣减已用配额（增量）
   */
  async increaseUsedQuota(userId: number, amount: number): Promise<void> {
    await this.db
      .prepare(
        'UPDATE users SET used_quota = used_quota + ?, request_count = request_count + 1, updated_at = ? WHERE id = ?'
      )
      .bind(amount, Date.now(), userId)
      .run();
  }

  /**
   * 搜索用户（用户名或邮箱）
   */
  async search(
    keyword: string,
    page: number = 1,
    pageSize: number = 20
  ): Promise<{ items: User[]; total: number }> {
    const offset = (page - 1) * pageSize;
    const pattern = `%${keyword}%`;

    const countResult = await this.db
      .prepare('SELECT COUNT(*) as total FROM users WHERE username LIKE ? OR email LIKE ?')
      .bind(pattern, pattern)
      .first<{ total: number }>();

    const { results } = await this.db
      .prepare(
        `SELECT id, username, email, role, status, quota, used_quota, request_count,
                group_name, af_code, aff_count, inviter_id, created_at, updated_at
         FROM users WHERE username LIKE ? OR email LIKE ? ORDER BY created_at DESC LIMIT ? OFFSET ?`
      )
      .bind(pattern, pattern, pageSize, offset)
      .all<User>();

    return {
      items: results,
      total: countResult?.total ?? 0,
    };
  }

  /**
   * 增加邀请人数
   */
  async incrementAffCount(userId: number): Promise<void> {
    await this.db
      .prepare('UPDATE users SET aff_count = aff_count + 1 WHERE id = ?')
      .bind(userId)
      .run();
  }

  /**
   * 获取用户列表（排除密码哈希）
   */
  async listUsers(page: number = 1, pageSize: number = 20): Promise<{ items: any[]; total: number }> {
    const offset = (page - 1) * pageSize;

    const countResult = await this.db
      .prepare('SELECT COUNT(*) as total FROM users')
      .first<{ total: number }>();

    const { results } = await this.db
      .prepare(
        `SELECT id, username, email, role, status, quota, used_quota, request_count,
                group_name, af_code, aff_count, inviter_id, created_at, updated_at
         FROM users ORDER BY created_at DESC LIMIT ? OFFSET ?`
      )
      .bind(pageSize, offset)
      .all();

    return {
      items: results,
      total: countResult?.total ?? 0,
    };
  }
}
