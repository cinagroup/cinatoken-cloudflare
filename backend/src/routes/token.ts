import { Hono } from 'hono';
import { userAuth } from '../middleware/auth';
import { createServices } from '../services';
import type { Env, HonoVariables } from '../types';
import { HTTPException } from 'hono/http-exception';

export const tokenRoutes = new Hono<{ Bindings: Env; Variables: HonoVariables }>();

// 所有令牌路由都需要用户认证
tokenRoutes.use('*', userAuth);

/**
 * GET /api/token
 * 获取令牌列表（分页）
 */
tokenRoutes.get('/', async (c) => {
  const userId = c.get('userId');
  // Accept both p/page and size/pageSize for frontend compatibility
  const page = parseInt(c.req.query('p') || c.req.query('page') || '1');
  const pageSize = parseInt(c.req.query('size') || c.req.query('pageSize') || '20');
  const status = c.req.query('status') ? parseInt(c.req.query('status')!) : undefined;

  const tokenService = createServices(c.env).token;
  const result = await tokenService.listTokens(userId, page, pageSize, status);

  return c.json({
    success: true,
    data: result.tokens,
    meta: {
      page,
      pageSize,
      total: result.total,
    },
  });
});

/**
 * GET /api/token/:id
 * 获取单个令牌详情
 */
tokenRoutes.get('/:id', async (c) => {
  const userId = c.get('userId');
  const tokenId = parseInt(c.req.param('id'));

  const services = createServices(c.env);
  const token = await services.token.getToken(userId, tokenId);

  if (!token) {
    throw new HTTPException(404, { message: 'Token not found' });
  }

  return c.json({
    success: true,
    data: token,
  });
});

/**
 * POST /api/token
 * 创建令牌
 */
tokenRoutes.post('/', async (c) => {
  const userId = c.get('userId');
  const body = await c.req.json();

  const services = createServices(c.env);
  const token = await services.token.createToken(userId, {
    user_id: userId,
    name: body.name,
    expired_time: body.expired_time,
    remain_quota: body.remain_quota,
    models: body.models,
    subnet: body.subnet,
    group_name: body.group_name,
  });

  return c.json({
    success: true,
    data: token,
  }, 201);
});

/**
 * PUT /api/token/:id
 * 更新令牌
 */
tokenRoutes.put('/:id', async (c) => {
  const userId = c.get('userId');
  const tokenId = parseInt(c.req.param('id'));
  const body = await c.req.json();

  const services = createServices(c.env);
  const updated = await services.token.updateToken(tokenId, userId, {
    name: body.name,
    status: body.status,
    expired_time: body.expired_time,
    remain_quota: body.remain_quota,
    models: body.models,
    subnet: body.subnet,
  });

  if (!updated) {
    throw new HTTPException(404, { message: 'Token not found or unauthorized' });
  }

  return c.json({
    success: true,
    data: updated,
  });
});

/**
 * DELETE /api/token/:id
 * 删除令牌
 */
tokenRoutes.delete('/:id', async (c) => {
  const userId = c.get('userId');
  const tokenId = parseInt(c.req.param('id'));

  const services = createServices(c.env);
  const deleted = await services.token.deleteToken(tokenId, userId);

  if (!deleted) {
    throw new HTTPException(404, { message: 'Token not found or unauthorized' });
  }

  return c.json({
    success: true,
    data: { message: 'Token deleted successfully' },
  });
});

/**
 * POST /api/token/:id/key
 * 查看完整 API Key（需要密码验证）
 */
tokenRoutes.post('/:id/key', async (c) => {
  const userId = c.get('userId');
  const tokenId = parseInt(c.req.param('id'));
  const body = await c.req.json();

  if (!body.password) {
    throw new HTTPException(400, { message: 'Password is required' });
  }

  const services = createServices(c.env);
  const key = await services.token.getTokenKey(tokenId, userId, body.password);

  if (key === null) {
    throw new HTTPException(404, { message: 'Token not found or unauthorized' });
  }

  return c.json({
    success: true,
    data: { key },
  });
});

/**
 * GET /api/token/:id/stats
 * 获取令牌使用统计
 */
tokenRoutes.get('/:id/stats', async (c) => {
  const userId = c.get('userId');
  const tokenId = parseInt(c.req.param('id'));

  const services = createServices(c.env);
  const stats = await services.token.getTokenStats(tokenId, userId);

  if (!stats) {
    throw new HTTPException(404, { message: 'Token not found or unauthorized' });
  }

  return c.json({
    success: true,
    data: stats,
  });
});

/**
 * GET /api/token/:id/usage
 * 获取令牌每日使用量（最近 N 天）
 */
tokenRoutes.get('/:id/usage', async (c) => {
  const userId = c.get('userId');
  const tokenId = parseInt(c.req.param('id'));
  const days = parseInt(c.req.query('days') || '7');

  const services = createServices(c.env);
  const usage = await services.token.getTokenUsageByDay(tokenId, userId, days);

  if (!usage) {
    throw new HTTPException(404, { message: 'Token not found or unauthorized' });
  }

  return c.json({
    success: true,
    data: usage,
  });
});

