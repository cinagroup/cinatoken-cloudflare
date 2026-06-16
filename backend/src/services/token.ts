/**
 * TokenService - API 令牌业务逻辑层
 */

import type { Env, Token, CreateTokenInput, UpdateTokenInput } from '../types';
import { createRepositories, type Repositories } from '../repositories';
import { RedisService } from './redis';
import { generateToken, verifyPassword } from '../utils';

export interface TokenStats {
  totalRequests: number;
  totalTokens: number;
  totalQuota: number;
  promptTokens: number;
  completionTokens: number;
}

export interface TokenUsageByDay {
  date: string;
  requests: number;
  tokens: number;
}

export class TokenService {
  private repos: Repositories;

  constructor(
    repos: Repositories,
    private redis: RedisService
  ) {
    this.repos = repos;
  }

  /**
   * 创建令牌
   */
  async createToken(userId: number, input: CreateTokenInput): Promise<Token> {
    // 生成 API Key（sk- 前缀 + 随机字符串）
    const randomPart = generateToken(32);
    const key = `sk-${randomPart}`;

    const id = await this.repos.token.createToken({
      user_id: userId,
      key,
      name: input.name,
      expired_time: input.expired_time,
      remain_quota: input.remain_quota,
      unlimited_quota: (input.remain_quota ?? -1) < 0 ? 1 : 0,
      models: input.models ? JSON.stringify(input.models) : undefined,
      subnet: input.subnet,
      group_name: input.group_name,
    });

    // 清除用户令牌缓存
    await this.redis.delete(`tokens:user:${userId}`);

    // 返回创建的令牌
    const token = await this.repos.token.findById(id);
    if (!token) {
      throw new Error('Failed to create token');
    }

    return token;
  }

  /**
   * 查询用户令牌列表（分页）
   */
  async listTokens(
    userId: number,
    page: number = 1,
    pageSize: number = 20,
    status?: number
  ): Promise<{ tokens: Token[]; total: number }> {
    // 尝试从缓存获取
    const cacheKey = `tokens:user:${userId}:${page}:${pageSize}:${status ?? 'all'}`;
    const cached = await this.redis.getCache<{ tokens: Token[]; total: number }>(cacheKey);

    if (cached) {
      return cached;
    }

    const where: any = { user_id: userId };
    if (status !== undefined) {
      where.status = status;
    }

    const result = await this.repos.token.paginate(page, pageSize, where, 'created_time', 'DESC');

    // 隐藏 key 的中间部分（只显示前 8 位和后 4 位）
    const tokens = result.items.map((t) => ({
      ...t,
      key: this.maskKey(t.key),
    }));

    const data = { tokens, total: result.total };

    // 缓存 30 秒
    await this.redis.setCache(cacheKey, data, 30);

    return data;
  }

  /**
   * 查询令牌详情
   */
  async getToken(tokenId: number, userId: number): Promise<Token | null> {
    const token = await this.repos.token.findById(tokenId);
    if (!token || token.user_id !== userId) {
      return null;
    }

    // 隐藏 key 的中间部分
    return {
      ...token,
      key: this.maskKey(token.key),
    };
  }

  /**
   * 查看完整 API Key（需要密码验证）
   */
  async getTokenKey(tokenId: number, userId: number, password: string): Promise<string | null> {
    // 先验证密码
    const user = await this.repos.user.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    // 验证密码
    const isValid = await verifyPassword(password, user.password_hash);
    if (!isValid) {
      throw new Error('Invalid password');
    }

    const token = await this.repos.token.findById(tokenId);
    if (!token || token.user_id !== userId) {
      return null;
    }

    return token.key;
  }

  /**
   * 更新令牌
   */
  async updateToken(
    tokenId: number,
    userId: number,
    update: UpdateTokenInput
  ): Promise<Token | null> {
    const token = await this.repos.token.findById(tokenId);
    if (!token || token.user_id !== userId) {
      return null;
    }

    const updates: Record<string, any> = {};

    if (update.name !== undefined) {
      updates.name = update.name;
    }
    if (update.status !== undefined) {
      updates.status = update.status;
    }
    if (update.expired_time !== undefined) {
      updates.expired_time = update.expired_time;
    }
    if (update.remain_quota !== undefined) {
      updates.remain_quota = update.remain_quota;
      updates.unlimited_quota = update.remain_quota < 0 ? 1 : 0;
    }
    if (update.models !== undefined) {
      updates.models = JSON.stringify(update.models);
    }
    if (update.subnet !== undefined) {
      updates.subnet = update.subnet;
    }

    await this.repos.token.updateById(tokenId, updates);

    // 清除缓存
    await this.redis.delete(`tokens:user:${userId}`);
    await this.redis.delete(`token:${token.key}`);

    const updated = await this.repos.token.findById(tokenId);
    return updated
      ? {
          ...updated,
          key: this.maskKey(updated.key),
        }
      : null;
  }

  /**
   * 删除令牌
   */
  async deleteToken(tokenId: number, userId: number): Promise<boolean> {
    const token = await this.repos.token.findById(tokenId);
    if (!token || token.user_id !== userId) {
      return false;
    }

    await this.repos.token.deleteById(tokenId);

    // 清除缓存
    await this.redis.delete(`tokens:user:${userId}`);
    await this.redis.delete(`token:${token.key}`);

    return true;
  }

  /**
   * 批量删除令牌
   */
  async batchDeleteTokens(tokenIds: number[], userId: number): Promise<number> {
    let deleted = 0;

    for (const tokenId of tokenIds) {
      const token = await this.repos.token.findById(tokenId);
      if (token && token.user_id === userId) {
        await this.repos.token.deleteById(tokenId);
        await this.redis.delete(`token:${token.key}`);
        deleted++;
      }
    }

    // 清除用户令牌列表缓存
    await this.redis.delete(`tokens:user:${userId}`);

    return deleted;
  }

  /**
   * 获取令牌使用统计
   */
  async getTokenStats(tokenId: number, userId: number): Promise<TokenStats | null> {
    const token = await this.repos.token.findById(tokenId);
    if (!token || token.user_id !== userId) {
      return null;
    }

    // 从 logs 表查询统计（使用 raw 方法）
    const result = await this.repos.log.raw<TokenStats>(
      `SELECT
        COUNT(*) as totalRequests,
        COALESCE(SUM(prompt_tokens + completion_tokens), 0) as totalTokens,
        COALESCE(SUM(quota), 0) as totalQuota,
        COALESCE(SUM(prompt_tokens), 0) as promptTokens,
        COALESCE(SUM(completion_tokens), 0) as completionTokens
      FROM logs
      WHERE token_id = ?`,
      tokenId
    );

    return result[0] || {
      totalRequests: 0,
      totalTokens: 0,
      totalQuota: 0,
      promptTokens: 0,
      completionTokens: 0,
    };
  }

  /**
   * 获取令牌每日使用量（最近 N 天）
   */
  async getTokenUsageByDay(
    tokenId: number,
    userId: number,
    days: number = 7
  ): Promise<TokenUsageByDay[] | null> {
    const token = await this.repos.token.findById(tokenId);
    if (!token || token.user_id !== userId) {
      return null;
    }

    const startTime = Date.now() - days * 24 * 60 * 60 * 1000;

    const result = await this.repos.log.raw<TokenUsageByDay>(
      `SELECT
        DATE(created_at / 1000, 'unixepoch') as date,
        COUNT(*) as requests,
        COALESCE(SUM(prompt_tokens + completion_tokens), 0) as tokens
      FROM logs
      WHERE token_id = ? AND created_at >= ?
      GROUP BY DATE(created_at / 1000, 'unixepoch')
      ORDER BY date`,
      tokenId,
      startTime
    );

    return result;
  }

  /**
   * 掩码 API Key（只显示前 8 位和后 4 位）
   */
  private maskKey(key: string): string {
    if (key.length <= 12) {
      return key;
    }
    return key.substring(0, 8) + '***' + key.substring(key.length - 4);
  }
}

/**
 * 创建 TokenService 实例
 */
export function createTokenService(env: Env): TokenService {
  const repos = createRepositories(env.DB);
  const redis = new RedisService(env);

  return new TokenService(repos, redis);
}
