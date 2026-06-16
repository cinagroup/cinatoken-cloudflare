/**
 * 日志查询路由
 */

import { Hono } from 'hono';
import type { Env, HonoVariables } from '../types';
import { adminAuth, userAuth } from '../middleware/auth';
import { createServices } from '../services';
import { successResponse, paginatedResponse } from '../utils/response';

export const logRoutes = new Hono<{ Bindings: Env; Variables: HonoVariables }>();

/** GET /api/log - 管理员查看所有日志 */
logRoutes.get('/', adminAuth, async (c) => {
  const page = parseInt(c.req.query('page') || '1');
  const pageSize = parseInt(c.req.query('pageSize') || '20');
  const userId = c.req.query('userId') ? parseInt(c.req.query('userId')!) : undefined;
  const channelId = c.req.query('channelId') ? parseInt(c.req.query('channelId')!) : undefined;
  const modelName = c.req.query('modelName') || undefined;

  const services = createServices(c.env);
  const result = await services.repos.log.findAll(page, pageSize, { userId, channelId, modelName });

  return c.json(paginatedResponse(result.items, page, pageSize, result.total));
});

/** GET /api/log/search - 搜索日志 */
logRoutes.get('/search', adminAuth, async (c) => {
  const keyword = c.req.query('keyword') || '';
  const page = parseInt(c.req.query('page') || '1');
  const pageSize = parseInt(c.req.query('pageSize') || '20');

  const services = createServices(c.env);
  const result = await services.repos.log.search(keyword, page, pageSize);

  return c.json(paginatedResponse(result.items, page, pageSize, result.total));
});

/** GET /api/log/stat - 日志统计 */
logRoutes.get('/stat', adminAuth, async (c) => {
  const now = Date.now();
  const start = parseInt(c.req.query('start') || String(now - 7 * 86400000));
  const end = parseInt(c.req.query('end') || String(now));

  const services = createServices(c.env);
  const stats = await services.repos.log.getGlobalStats(start, end);

  return c.json(successResponse(stats));
});

/** GET /api/log/self - 用户自己的日志 */
logRoutes.get('/self', userAuth, async (c) => {
  const userId = c.get('userId');
  const page = parseInt(c.req.query('page') || '1');
  const pageSize = parseInt(c.req.query('pageSize') || '20');

  const services = createServices(c.env);
  const result = await services.repos.log.findByUserId(userId, page, pageSize);

  return c.json(paginatedResponse(result.items, page, pageSize, result.total));
});

/** GET /api/log/self/search - 搜索自己的日志 */
logRoutes.get('/self/search', userAuth, async (c) => {
  const keyword = c.req.query('keyword') || '';
  const page = parseInt(c.req.query('page') || '1');
  const pageSize = parseInt(c.req.query('pageSize') || '20');

  const services = createServices(c.env);
  const result = await services.repos.log.search(keyword, page, pageSize);

  return c.json(paginatedResponse(result.items, page, pageSize, result.total));
});

/** GET /api/log/self/stat - 用户日志统计 */
logRoutes.get('/self/stat', userAuth, async (c) => {
  const userId = c.get('userId');
  const now = Date.now();
  const start = parseInt(c.req.query('start') || String(now - 7 * 86400000));
  const end = parseInt(c.req.query('end') || String(now));

  const services = createServices(c.env);
  const stats = await services.repos.log.getUserStats(userId, start, end);

  return c.json(successResponse(stats));
});

/** DELETE /api/log - 清理历史日志 */
logRoutes.delete('/', adminAuth, async (c) => {
  const before = parseInt(c.req.query('before') || String(Date.now() - 30 * 86400000));
  const services = createServices(c.env);
  const deleted = await services.repos.log.deleteBefore(before);

  return c.json(successResponse({ deleted }));
});
