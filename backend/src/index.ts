/**
 * CinaToken Backend - Cloudflare Workers 入口
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import type { Env, HonoVariables } from './types/index.js';
import { successResponse, logError } from './utils/response.js';
import {
  requestContext,
  corsConfig,
  requestIdHeader,
  globalRateLimit,
  jsonErrorHandler,
} from './middleware/index.js';
import { userRoutes, tokenRoutes, channelRoutes, relayRoutes, logRoutes, redemptionRoutes, optionRoutes, optionPublicRoutes, modelMetaRoutes, oauthRoutes, webhookRoutes, subscriptionRoutes, miscRoutes } from './routes/index.js';

// 创建 Hono 应用
const app = new Hono<{ Bindings: Env; Variables: HonoVariables }>();

// ==================== 全局中间件 ====================

// 请求上下文初始化（必须在最前面）
app.use('*', requestContext);

// CORS
app.use('*', cors(corsConfig));

// 请求日志（Hono 内置）
app.use('*', logger());

// Request-Id 响应头
app.use('*', requestIdHeader);

// JSON 错误处理
app.use('*', jsonErrorHandler);

// 全局 IP 限流（排除健康检查）
app.use('*', async (c, next) => {
  const path = c.req.path;
  // 健康检查和静态资源不限流
  if (path === '/' || path === '/health' || path === '/ready' || path === '/api/status') {
    await next();
    return;
  }
  return globalRateLimit(c, next);
});

// ==================== 健康检查路由 ====================

app.get('/', (c) => {
  return c.json(
    successResponse({
      service: 'CinaToken API',
      version: '1.0.0',
      status: 'healthy',
      timestamp: new Date().toISOString(),
    })
  );
});

app.get('/health', (c) => {
  return c.json(
    successResponse({
      status: 'ok',
      service: 'CinaToken',
      timestamp: Date.now(),
    })
  );
});

app.get('/ready', async (c) => {
  // 检查数据库连接
  try {
    await c.env.DB.prepare('SELECT 1 as ok').first();
    return c.json(
      successResponse({
        ready: true,
        checks: {
          database: 'ok',
          kv: 'ok',
        },
      })
    );
  } catch (err) {
    return c.json(
      {
        success: false,
        data: {
          ready: false,
          checks: {
            database: 'error',
            error: err instanceof Error ? err.message : 'Unknown error',
          },
        },
      },
      503
    );
  }
});

// ==================== API 路由 ====================

// 自动去掉尾部斜杠重定向（兼容前端 /api/option/ 等请求）
app.use('*', async (c, next) => {
  const path = c.req.path;
  if (path.length > 1 && path.endsWith('/')) {
    const url = new URL(c.req.url);
    url.pathname = path.slice(0, -1);
    return c.redirect(url.toString(), 308);
  }
  await next();
});

// 公开状态接口
app.get('/api/status', (c) => {
  return c.json(
    successResponse({
      initialized: true,
      version: '1.0.0',
      serverName: 'CinaToken',
    })
  );
});

// 用户管理路由
app.route('/api/user', userRoutes);

// 令牌管理路由
app.route('/api/token', tokenRoutes);

// 渠道管理路由
app.route('/api/channel', channelRoutes);

// AI 代理路由（OpenAI 兼容 /v1）
app.route('/v1', relayRoutes);

// Gemini 代理路由
app.route('/v1beta', relayRoutes);

// Midjourney 代理路由
app.route('/mj', relayRoutes);

// Suno 代理路由
app.route('/suno', relayRoutes);

// 日志查询路由
app.route('/api/log', logRoutes);

// 兑换码路由
app.route('/api/redemption', redemptionRoutes);

// 系统配置路由
app.route('/api/option', optionRoutes);

// 公开信息路由
app.route('/api', optionPublicRoutes);

// 模型元数据路由
app.route('/api/models', modelMetaRoutes);

// OAuth 路由
app.route('/api/oauth', oauthRoutes);

// 支付 Webhook 路由
app.route('/api', webhookRoutes);

// 订阅路由
app.route('/api/subscription', subscriptionRoutes);

// 辅助功能路由（2FA / Passkey / 签到 / 性能 / 邀请等）
app.route('/api/user', miscRoutes);
app.route('/api', miscRoutes);

// ==================== 404 处理 ====================

app.notFound((c) => {
  const requestId = c.get('requestId');
  return c.json(
    {
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: `Route ${c.req.method} ${c.req.path} not found`,
      },
      meta: requestId ? { requestId } : undefined,
    },
    404
  );
});

// ==================== 错误处理 ====================

app.onError((err, c) => {
  const requestId = c.get('requestId');

  logError('Unhandled error', err, String(requestId));

  if (c.env.ENVIRONMENT === 'dev') {
    return c.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: err.message,
          stack: err.stack,
        },
        meta: requestId ? { requestId } : undefined,
      },
      500
    );
  }

  return c.json(
    {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Internal server error',
      },
      meta: requestId ? { requestId } : undefined,
    },
    500
  );
});

// ==================== 导出 ====================

export default app;
