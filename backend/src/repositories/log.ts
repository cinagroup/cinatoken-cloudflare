/**
 * LogRepository - 日志数据访问层
 */

import { BaseRepository } from './base.js';
import type { Log } from '../types/index.js';

export interface LogQueryOptions {
  userId?: number;
  tokenId?: number;
  channelId?: number;
  type?: number;
  modelName?: string;
  startTime?: number;
  endTime?: number;
}

export interface LogStat {
  date: string;
  request_count: number;
  total_quota: number;
  total_tokens: number;
}

export class LogRepository extends BaseRepository<Log> {
  constructor(db: D1Database) {
    super(db, 'logs');
  }

  /**
   * 创建日志
   */
  async createLog(data: {
    user_id?: number;
    token_id?: number;
    channel_id?: number;
    token_name?: string;
    username?: string;
    type: number;
    content: string;
    model_name?: string;
    prompt_tokens?: number;
    completion_tokens?: number;
    quota?: number;
    channel_name?: string;
    group_name?: string;
  }): Promise<number> {
    return this.insert({
      user_id: data.user_id ?? null,
      token_id: data.token_id ?? null,
      channel_id: data.channel_id ?? null,
      token_name: data.token_name ?? null,
      username: data.username ?? null,
      type: data.type,
      content: data.content,
      model_name: data.model_name ?? null,
      prompt_tokens: data.prompt_tokens ?? 0,
      completion_tokens: data.completion_tokens ?? 0,
      quota: data.quota ?? 0,
      created_at: Date.now(),
      channel_name: data.channel_name ?? null,
      group_name: data.group_name ?? null,
    });
  }

  /**
   * 查询用户日志（分页）
   */
  async findByUserId(
    userId: number,
    page: number = 1,
    pageSize: number = 20,
    options?: LogQueryOptions
  ): Promise<{ items: Log[]; total: number }> {
    return this.queryLogs({ ...options, userId }, page, pageSize);
  }

  /**
   * 查询所有日志（管理员，分页）
   */
  async findAll(
    page: number = 1,
    pageSize: number = 20,
    options?: LogQueryOptions
  ): Promise<{ items: Log[]; total: number }> {
    return this.queryLogs(options, page, pageSize);
  }

  /**
   * 通用日志查询
   */
  private async queryLogs(
    options: LogQueryOptions = {},
    page: number = 1,
    pageSize: number = 20
  ): Promise<{ items: Log[]; total: number }> {
    const offset = (page - 1) * pageSize;
    const clauses: string[] = [];
    const binds: any[] = [];

    if (options.userId !== undefined) {
      clauses.push('user_id = ?');
      binds.push(options.userId);
    }
    if (options.tokenId !== undefined) {
      clauses.push('token_id = ?');
      binds.push(options.tokenId);
    }
    if (options.channelId !== undefined) {
      clauses.push('channel_id = ?');
      binds.push(options.channelId);
    }
    if (options.type !== undefined) {
      clauses.push('type = ?');
      binds.push(options.type);
    }
    if (options.modelName) {
      clauses.push('model_name = ?');
      binds.push(options.modelName);
    }
    if (options.startTime) {
      clauses.push('created_at >= ?');
      binds.push(options.startTime);
    }
    if (options.endTime) {
      clauses.push('created_at <= ?');
      binds.push(options.endTime);
    }

    const whereSql = clauses.length > 0 ? ` WHERE ${clauses.join(' AND ')}` : '';

    // 查询总数
    const countResult = await this.db
      .prepare(`SELECT COUNT(*) as total FROM logs${whereSql}`)
      .bind(...binds)
      .first<{ total: number }>();

    // 查询数据
    const { results } = await this.db
      .prepare(`${`SELECT * FROM logs${whereSql}`} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
      .bind(...binds, pageSize, offset)
      .all<Log>();

    return {
      items: results,
      total: countResult?.total ?? 0,
    };
  }

  /**
   * 搜索日志（支持模型名称、用户名模糊搜索）
   */
  async search(
    keyword: string,
    page: number = 1,
    pageSize: number = 20
  ): Promise<{ items: Log[]; total: number }> {
    const offset = (page - 1) * pageSize;
    const pattern = `%${keyword}%`;

    const countResult = await this.db
      .prepare(
        'SELECT COUNT(*) as total FROM logs WHERE model_name LIKE ? OR username LIKE ? OR token_name LIKE ?'
      )
      .bind(pattern, pattern, pattern)
      .first<{ total: number }>();

    const { results } = await this.db
      .prepare(
        'SELECT * FROM logs WHERE model_name LIKE ? OR username LIKE ? OR token_name LIKE ? ORDER BY created_at DESC LIMIT ? OFFSET ?'
      )
      .bind(pattern, pattern, pattern, pageSize, offset)
      .all<Log>();

    return {
      items: results,
      total: countResult?.total ?? 0,
    };
  }

  /**
   * 统计用户日志（按日聚合）
   */
  async getUserStats(
    userId: number,
    startTime: number,
    endTime: number
  ): Promise<LogStat[]> {
    const { results } = await this.db
      .prepare(
        `SELECT
           DATE(created_at / 1000, 'unixepoch') as date,
           COUNT(*) as request_count,
           COALESCE(SUM(quota), 0) as total_quota,
           COALESCE(SUM(prompt_tokens + completion_tokens), 0) as total_tokens
         FROM logs
         WHERE user_id = ? AND type = 2 AND created_at >= ? AND created_at <= ?
         GROUP BY DATE(created_at / 1000, 'unixepoch')
         ORDER BY date DESC`
      )
      .bind(userId, startTime, endTime)
      .all<LogStat>();

    return results;
  }

  /**
   * 统计全局日志（按日聚合，管理员用）
   */
  async getGlobalStats(startTime: number, endTime: number): Promise<LogStat[]> {
    const { results } = await this.db
      .prepare(
        `SELECT
           DATE(created_at / 1000, 'unixepoch') as date,
           COUNT(*) as request_count,
           COALESCE(SUM(quota), 0) as total_quota,
           COALESCE(SUM(prompt_tokens + completion_tokens), 0) as total_tokens
         FROM logs
         WHERE type = 2 AND created_at >= ? AND created_at <= ?
         GROUP BY DATE(created_at / 1000, 'unixepoch')
         ORDER BY date DESC`
      )
      .bind(startTime, endTime)
      .all<LogStat>();

    return results;
  }

  /**
   * 删除历史日志（早于指定时间）
   */
  async deleteBefore(timestamp: number): Promise<number> {
    const result = await this.db
      .prepare('DELETE FROM logs WHERE created_at < ?')
      .bind(timestamp)
      .run();
    return result.meta.changes ?? 0;
  }

  /**
   * 根据令牌 ID 查询日志
   */
  async findByTokenId(
    tokenId: number,
    page: number = 1,
    pageSize: number = 20
  ): Promise<{ items: Log[]; total: number }> {
    return this.queryLogs({ tokenId }, page, pageSize);
  }
}
