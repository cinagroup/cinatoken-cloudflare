/**
 * 认证中间件 - 扁平变量模式
 * - userAuth: 普通用户认证（JWT）
 * - adminAuth: 管理员认证（role >= 10）
 * - rootAuth: 超级管理员认证（role >= 100）
 * - tokenAuth: API Key 认证（用于 AI 代理）
 */

import { createMiddleware } from 'hono/factory';
import type { Env, HonoVariables } from '../types/index.js';
import { verifyJWT } from '../utils/jwt.js';
import { RedisService } from '../services/redis.js';
import { TokenRepository } from '../repositories/token.js';
import { unauthorizedResponse, forbiddenResponse } from '../utils/response.js';

function extractBearerToken(authHeader: string | undefined | null): string | null {
  if (!authHeader) return null;
  if (!authHeader.startsWith('Bearer ')) return null;
  return authHeader.slice(7);
}

export const userAuth = createMiddleware<{ Bindings: Env; Variables: HonoVariables }>(
  async (c, next) => {
    const token = extractBearerToken(c.req.header('Authorization'));

    if (!token) {
      return c.json(unauthorizedResponse('Missing or invalid Authorization header'), 401);
    }

    try {
      const payload = await verifyJWT(token, c.env.JWT_SECRET);

      if (!payload.sub) {
        return c.json(unauthorizedResponse('Invalid token payload'), 401);
      }

      const userId = parseInt(payload.sub, 10);
      if (isNaN(userId)) {
        return c.json(unauthorizedResponse('Invalid user ID in token'), 401);
      }

      c.set('userId', userId);
      c.set('userRole', payload.role ?? 1);

      await next();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Token verification failed';
      return c.json(unauthorizedResponse(message), 401);
    }
  }
);

export const adminAuth = createMiddleware<{ Bindings: Env; Variables: HonoVariables }>(
  async (c, next) => {
    const token = extractBearerToken(c.req.header('Authorization'));

    if (!token) {
      return c.json(unauthorizedResponse('Missing or invalid Authorization header'), 401);
    }

    try {
      const payload = await verifyJWT(token, c.env.JWT_SECRET);
      const userId = parseInt(payload.sub, 10);

      if (isNaN(userId)) {
        return c.json(unauthorizedResponse('Invalid user ID in token'), 401);
      }

      if ((payload.role ?? 0) < 10) {
        return c.json(forbiddenResponse('Admin access required'), 403);
      }

      c.set('userId', userId);
      c.set('userRole', payload.role);

      await next();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Token verification failed';
      return c.json(unauthorizedResponse(message), 401);
    }
  }
);

export const rootAuth = createMiddleware<{ Bindings: Env; Variables: HonoVariables }>(
  async (c, next) => {
    const token = extractBearerToken(c.req.header('Authorization'));

    if (!token) {
      return c.json(unauthorizedResponse('Missing or invalid Authorization header'), 401);
    }

    try {
      const payload = await verifyJWT(token, c.env.JWT_SECRET);
      const userId = parseInt(payload.sub, 10);

      if (isNaN(userId)) {
        return c.json(unauthorizedResponse('Invalid user ID in token'), 401);
      }

      if ((payload.role ?? 0) < 100) {
        return c.json(forbiddenResponse('Root access required'), 403);
      }

      c.set('userId', userId);
      c.set('userRole', payload.role);

      await next();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Token verification failed';
      return c.json(unauthorizedResponse(message), 401);
    }
  }
);

export const tokenAuth = createMiddleware<{ Bindings: Env; Variables: HonoVariables }>(
  async (c, next) => {
    let apiKey: string | null = null;

    const authHeader = c.req.header('Authorization');
    if (authHeader?.startsWith('Bearer ')) {
      apiKey = authHeader.slice(7);
    }

    if (!apiKey) {
      apiKey = c.req.header('x-api-key') ?? null;
    }

    if (!apiKey) {
      return c.json(
        {
          error: {
            message: 'Missing API key.',
            type: 'authentication_error',
            code: 'missing_api_key',
          },
        },
        401
      );
    }

	    const tokenRepo = new TokenRepository(c.env.DB);

	    // 先尝试 Redis 缓存（失败静默降级）
	    let tokenData = null;
	    try {
	      const redis = new RedisService(c.env);
	      tokenData = await redis.getCachedToken(apiKey);
	    } catch {
	      // Redis 不可用，直接查数据库
	    }

	    if (!tokenData) {
      const token = await tokenRepo.findByKey(apiKey);

      if (!token) {
        return c.json(
          { error: { message: 'Invalid API key.', type: 'authentication_error', code: 'invalid_api_key' } },
          401
        );
      }

      if (token.status !== 1) {
        return c.json(
          { error: { message: 'This API key has been disabled.', type: 'authentication_error', code: 'key_disabled' } },
          401
        );
      }

      if (token.expired_time && token.expired_time < Date.now()) {
        return c.json(
          { error: { message: 'This API key has expired.', type: 'authentication_error', code: 'key_expired' } },
          401
        );
      }

      let models: string[] | null = null;
      if (token.models) {
        try { models = JSON.parse(token.models); } catch { models = null; }
      }

      tokenData = {
        id: token.id,
        user_id: token.user_id,
        name: token.name,
        status: token.status,
        remain_quota: token.remain_quota,
        unlimited_quota: token.unlimited_quota,
        models,
        group_name: token.group_name,
      };

      // 尝试缓存（静默失败）
      try {
        const redisCache = new RedisService(c.env);
        await redisCache.cacheToken(apiKey, tokenData);
      } catch { /* ignore */ }
    }

    if (tokenData.status !== 1) {
      return c.json(
        { error: { message: 'This API key has been disabled.', type: 'authentication_error', code: 'key_disabled' } },
        401
      );
    }

    if (
      tokenData.unlimited_quota === 0 &&
      tokenData.remain_quota >= 0 &&
      tokenData.remain_quota < 1
    ) {
      return c.json(
        { error: { message: 'Insufficient quota.', type: 'insufficient_quota', code: 'quota_exceeded' } },
        429
      );
    }

    c.set('tokenId', tokenData.id);
    c.set('userId', tokenData.user_id);
    c.set('tokenKey', apiKey);
    c.set('tokenModels', tokenData.models);
    c.set('tokenGroupName', tokenData.group_name ?? 'default');

    await next();
  }
);
