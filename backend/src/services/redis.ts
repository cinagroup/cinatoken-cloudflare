/**
 * Redis 服务封装（基于 Upstash Redis）
 * 用于：限流计数、会话缓存、令牌缓存
 * 在 Redis 不可用时自动降级（操作静默失败，不阻塞核心流程）
 */

import { Redis } from '@upstash/redis/cloudflare';
import type { Env } from '../types/index.js';

/**
 * 创建 Redis 客户端（从环境变量初始化）
 */
export function createRedis(env: Env): Redis {
  return new Redis({
    url: env.UPSTASH_REDIS_REST_URL,
    token: env.UPSTASH_REDIS_REST_TOKEN,
  });
}

/**
 * Redis Key 前缀规范
 */
export const REDIS_KEYS = {
  // 限流
  rateLimit: (identifier: string, scope: string) => `rl:${scope}:${identifier}`,
  // 用户会话
  userSession: (userId: number) => `session:user:${userId}`,
  // API 令牌缓存
  tokenCache: (apiKey: string) => `cache:token:${apiKey}`,
  // 渠道列表缓存（按模型）
  channelByModel: (model: string, groupName: string) =>
    `cache:channels:${model}:${groupName}`,
  // 模型列表缓存
  modelList: 'cache:models:list',
  // 系统配置缓存
  systemConfig: 'cache:config:system',
  // 渠道测试结果
  channelTest: (channelId: number) => `cache:channel:test:${channelId}`,
  // 2FA 临时数据
  twoFactorPending: (userId: number) => `auth:2fa:pending:${userId}`,
  // 密码重置令牌
  passwordReset: (token: string) => `auth:reset:${token}`,
  // OAuth state
  oauthState: (state: string) => `oauth:state:${state}`,
} as const;

/**
 * 缓存默认 TTL（秒）
 */
export const CACHE_TTL = {
  TOKEN: 3600, // 令牌缓存 1 小时
  SESSION: 604800, // 会话 7 天
  CHANNELS: 30, // 渠道缓存 30 秒
  MODELS: 300, // 模型列表 5 分钟
  CONFIG: 3600, // 系统配置 1 小时
  RATE_LIMIT: 60, // 限流 1 分钟窗口
  PASSWORD_RESET: 900, // 密码重置 15 分钟
  OAUTH_STATE: 600, // OAuth state 10 分钟
  TWO_FACTOR: 300, // 2FA 5 分钟
} as const;

/**
 * Redis 服务类 - 提供常用缓存操作
 * 所有操作在 Redis 不可用时静默降级（返回 null/默认值），不抛异常
 */
export class RedisService {
  private redis: Redis;
  private disabled: boolean;

  constructor(env: Env) {
    this.disabled = env.UPSTASH_REDIS_REST_URL.includes('localhost') ||
                    env.UPSTASH_REDIS_REST_URL.includes('127.0.0.1');
    this.redis = createRedis(env);
  }

  /**
   * 获取原始 Redis 客户端
   */
  get client(): Redis {
    return this.redis;
  }

  /**
   * 安全执行 Redis 操作，失败时返回默认值
   * 设置 3 秒超时上限，防止连接不上时阻塞
   */
  private async safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
    if (this.disabled) return fallback;
    try {
      const timeout = new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error('Redis operation timeout')), 3000)
      );
      return await Promise.race([fn(), timeout]);
    } catch (err) {
      console.warn('[Redis] Operation failed, using fallback:', err instanceof Error ? err.message : err);
      return fallback;
    }
  }

  /**
   * 缓存获取（带 JSON 解析）
   */
  async getCache<T>(key: string): Promise<T | null> {
    return this.safe(() => this.redis.get<T>(key), null);
  }

  /**
   * 缓存设置（带 TTL）
   */
  async setCache<T>(key: string, value: T, ttl: number): Promise<void> {
    await this.safe(() => this.redis.set(key, value, { ex: ttl }), undefined as any);
  }

  /**
   * 删除缓存
   */
  async delete(key: string): Promise<void> {
    await this.safe(() => this.redis.del(key), 0 as any);
  }

  /**
   * 批量删除（按前缀模式）
   * 注意：Upstash 不支持 KEYS 命令，使用时需谨慎
   * Redis 不可用时返回 0（静默降级）
   */
  async deleteByPattern(pattern: string): Promise<number> {
    return this.safe(async () => {
      // Upstash 支持 SCAN
      let cursor = '0';
      let deleted = 0;

      do {
        const result = await this.redis.scan(cursor, { match: pattern, count: 100 });
        cursor = result[0];
        const keys = result[1];

        if (keys.length > 0) {
          await this.redis.del(...keys);
          deleted += keys.length;
        }
      } while (cursor !== '0');

      return deleted;
    }, 0);
  }

  // ==================== 限流相关 ====================

  /**
   * 滑动窗口限流（固定窗口近似）
   * 返回当前计数，调用方判断是否超限
   * Redis 不可用时默认放行
   */
  async rateLimit(
    identifier: string,
    scope: string,
    maxRequests: number,
    windowSeconds: number
  ): Promise<{ allowed: boolean; current: number; remaining: number }> {
    const key = REDIS_KEYS.rateLimit(identifier, scope);

    return this.safe(
      async () => {
        const current = await this.redis.incr(key);
        if (current === 1) {
          await this.redis.expire(key, windowSeconds);
        }
        const remaining = Math.max(0, maxRequests - current);
        const allowed = current <= maxRequests;
        return { allowed, current, remaining };
      },
      { allowed: true, current: 0, remaining: maxRequests }
    );
  }

  // ==================== 令牌缓存 ====================

  /**
   * 缓存 API 令牌信息
   */
  async cacheToken(
    apiKey: string,
    data: {
      id: number;
      user_id: number;
      name: string;
      status: number;
      remain_quota: number;
      unlimited_quota: number;
      models: string[] | null;
      group_name: string | null;
    }
  ): Promise<void> {
    await this.setCache(REDIS_KEYS.tokenCache(apiKey), data, CACHE_TTL.TOKEN);
  }

  /**
   * 获取缓存的令牌信息
   */
  async getCachedToken(apiKey: string): Promise<{
    id: number;
    user_id: number;
    name: string;
    status: number;
    remain_quota: number;
    unlimited_quota: number;
    models: string[] | null;
    group_name: string | null;
  } | null> {
    return this.getCache(REDIS_KEYS.tokenCache(apiKey));
  }

  /**
   * 清除令牌缓存
   */
  async invalidateToken(apiKey: string): Promise<void> {
    await this.delete(REDIS_KEYS.tokenCache(apiKey));
  }

  // ==================== 用户会话 ====================

  /**
   * 设置用户会话
   */
  async setUserSession(
    userId: number,
    data: { lastLogin: number; ip: string }
  ): Promise<void> {
    await this.setCache(REDIS_KEYS.userSession(userId), data, CACHE_TTL.SESSION);
  }

  /**
   * 获取用户会话
   */
  async getUserSession(userId: number): Promise<{ lastLogin: number; ip: string } | null> {
    return this.getCache(REDIS_KEYS.userSession(userId));
  }

  /**
   * 清除用户所有会话
   */
  async clearUserSession(userId: number): Promise<void> {
    await this.delete(REDIS_KEYS.userSession(userId));
  }
}
