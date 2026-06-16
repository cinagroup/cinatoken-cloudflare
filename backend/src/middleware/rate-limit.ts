/**
 * 限流中间件
 * 基于 Redis 滑动窗口计数实现
 */

import { createMiddleware } from 'hono/factory';
import type { Env, HonoVariables } from '../types/index.js';
import { RedisService } from '../services/redis.js';
import { rateLimitResponse } from '../utils/response.js';

/**
 * 限流配置
 */
export interface RateLimitConfig {
  /** 最大请求数 */
  max: number;
  /** 时间窗口（秒） */
  windowSeconds: number;
  /** 限流范围标识（用于 Redis Key） */
  scope: string;
}

/**
 * 预定义限流配置
 */
export const RATE_LIMITS = {
  // 全局 IP 限流：60 次/分钟
  GLOBAL: { max: 60, windowSeconds: 60, scope: 'global' },
  // 敏感接口（登录/注册）：10 次/分钟
  CRITICAL: { max: 10, windowSeconds: 60, scope: 'critical' },
  // 搜索接口：30 次/分钟
  SEARCH: { max: 30, windowSeconds: 60, scope: 'search' },
  // AI 模型请求：120 次/分钟
  MODEL: { max: 120, windowSeconds: 60, scope: 'model' },
  // API 创建操作：20 次/分钟
  WRITE: { max: 20, windowSeconds: 60, scope: 'write' },
} as const;

/**
 * 获取客户端 IP
 */
function getClientIP(c: any): string {
  return (
    c.req.header('CF-Connecting-IP') ||
    c.req.header('X-Real-IP') ||
    c.req.header('X-Forwarded-For')?.split(',')[0]?.trim() ||
    'unknown'
  );
}

/**
 * 创建限流中间件
 *
 * @param config 限流配置
 * @param useUserId 是否使用用户 ID 作为标识（需要先经过认证中间件）
 */
export function createRateLimit(
  config: RateLimitConfig,
  useUserId: boolean = false
) {
  return createMiddleware<{ Bindings: Env; Variables: HonoVariables }>(
    async (c, next) => {
      // 开发环境不限流
      if (c.env.ENVIRONMENT === 'dev') {
        await next();
        return;
      }

      const redis = new RedisService(c.env);

      // 确定限流标识
      let identifier: string;
      if (useUserId) {
        const userId = c.get('userId');
        identifier = userId ? `user:${userId}` : `ip:${getClientIP(c)}`;
      } else {
        identifier = `ip:${getClientIP(c)}`;
      }

      // 执行限流检查
      const result = await redis.rateLimit(
        identifier,
        config.scope,
        config.max,
        config.windowSeconds
      );

      // 设置限流响应头
      c.header('X-RateLimit-Limit', String(config.max));
      c.header('X-RateLimit-Remaining', String(result.remaining));
      c.header('X-RateLimit-Reset', String(config.windowSeconds));

      if (!result.allowed) {
        return c.json(
          rateLimitResponse(
            `Rate limit exceeded. Max ${config.max} requests per ${config.windowSeconds}s. ` +
              `Retry after ${config.windowSeconds}s.`
          ),
          429
        );
      }

      await next();
    }
  );
}

/**
 * 全局 IP 限流中间件
 */
export const globalRateLimit = createRateLimit(RATE_LIMITS.GLOBAL);

/**
 * 敏感接口限流（登录/注册）
 */
export const criticalRateLimit = createRateLimit(RATE_LIMITS.CRITICAL);

/**
 * 搜索接口限流
 */
export const searchRateLimit = createRateLimit(RATE_LIMITS.SEARCH);

/**
 * AI 模型请求限流（基于用户 ID）
 */
export const modelRateLimit = createRateLimit(RATE_LIMITS.MODEL, true);

/**
 * 写操作限流
 */
export const writeRateLimit = createRateLimit(RATE_LIMITS.WRITE, true);
