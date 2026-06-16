/**
 * 通用中间件
 * - 请求上下文初始化
 * - CORS 处理
 * - 请求日志
 */

import { createMiddleware } from 'hono/factory';
import type { Env, HonoVariables } from '../types/index.js';
import { generateToken } from '../utils/crypto.js';

/**
 * 请求上下文初始化中间件
 * 为每个请求生成唯一 ID 和时间戳
 */
export const requestContext = createMiddleware<{
  Bindings: Env;
  Variables: HonoVariables;
}>(async (c, next) => {
  const requestId = generateToken(16);
  const startTime = Date.now();

  c.set('requestId', requestId);
  c.set('startTime', startTime);

  await next();

  const duration = Date.now() - startTime;
  const status = c.res.status;
  const method = c.req.method;
  const path = c.req.path;

  if (path === '/health' || path === '/ready' || path === '/') {
    return;
  }

  const logLevel = c.env.LOG_LEVEL ?? 'info';

  if (status >= 500) {
    console.error(
      JSON.stringify({
        level: 'error', requestId, method, path, status, duration,
        timestamp: new Date().toISOString(),
      })
    );
  } else if (status >= 400 && logLevel === 'debug') {
    console.warn(
      JSON.stringify({
        level: 'warn', requestId, method, path, status, duration,
        timestamp: new Date().toISOString(),
      })
    );
  } else if (logLevel === 'debug') {
    console.log(
      JSON.stringify({
        level: 'info', requestId, method, path, status, duration,
        timestamp: new Date().toISOString(),
      })
    );
  }
});

/**
 * 允许的 CORS 来源
 */
const ALLOWED_ORIGINS = [
  'https://cinatoken.com',
  'https://app.cinatoken.com',
  'https://classic.cinatoken.com',
  // Cloudflare Pages 预览 URL（支持任意分支部署）
  // 通配符在 origin 函数中单独处理
  // 开发环境
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:5173',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:5173',
];

/**
 * CORS 中间件配置
 */
export const corsConfig = {
  origin: (origin: string, c: any) => {
    // 开发环境允许所有来源
    const env = c.env as Env;
    if (env?.ENVIRONMENT === 'dev') {
      return origin || '*';
    }
    // 生产环境检查白名单
    if (origin) {
      // 精确匹配
      if (ALLOWED_ORIGINS.includes(origin)) {
        return origin;
      }
      // Cloudflare Pages 预览 URL（如 *.cinatoken-web.pages.dev）
      if (
        origin.endsWith('.cinatoken-web.pages.dev') ||
        origin.endsWith('.cinatoken-web-classic.pages.dev')
      ) {
        return origin;
      }
    }
    return null;
  },
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowHeaders: [
    'Content-Type',
    'Authorization',
    'Cache-Control',
    'x-api-key',
    'x-request-id',
    'anthropic-version',
    'x-goog-api-key',
  ],
  exposeHeaders: [
    'Content-Length',
    'X-RateLimit-Limit',
    'X-RateLimit-Remaining',
    'X-RateLimit-Reset',
    'X-Request-Id',
  ],
  maxAge: 86400,
  credentials: true,
};

/**
 * 添加 Request-Id 到响应头
 */
export const requestIdHeader = createMiddleware<{
  Bindings: Env;
  Variables: HonoVariables;
}>(async (c, next) => {
  await next();

  const requestId = c.get('requestId');
  if (requestId) {
    c.header('X-Request-Id', String(requestId));
  }
});

/**
 * 请求体大小限制中间件
 * 防止超大请求体导致 Workers 超限
 *
 * @param maxBytes 最大字节数（默认 10MB）
 */
export function bodySizeLimit(maxBytes: number = 10 * 1024 * 1024) {
  return createMiddleware<{ Bindings: Env; Variables: HonoVariables }>(async (c, next) => {
    const contentLength = c.req.header('Content-Length');

    if (contentLength) {
      const size = parseInt(contentLength, 10);
      if (!isNaN(size) && size > maxBytes) {
        return c.json(
          {
            success: false,
            error: {
              code: 'REQUEST_TOO_LARGE',
              message: `Request body exceeds maximum size of ${maxBytes} bytes`,
            },
          },
          413
        );
      }
    }

    await next();
  });
}

/**
 * 匿名请求体大小限制（更严格，用于未认证接口）
 * 默认 1MB
 */
export const anonymousBodyLimit = bodySizeLimit(1024 * 1024);

/**
 * JSON 解析错误处理
 */
export const jsonErrorHandler = createMiddleware<{
  Bindings: Env;
  Variables: HonoVariables;
}>(async (c, next) => {
  try {
    await next();
  } catch (err) {
    // 检查是否是 JSON 解析错误
    if (err instanceof SyntaxError && err.message.includes('JSON')) {
      return c.json(
        {
          success: false,
          error: {
            code: 'INVALID_JSON',
            message: 'Request body is not valid JSON',
          },
        },
        400
      );
    }
    throw err;
  }
});
