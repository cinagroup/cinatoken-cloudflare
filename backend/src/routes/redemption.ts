/**
 * 兑换码路由
 */

import { Hono } from 'hono';
import type { Env, HonoVariables } from '../types';
import { adminAuth } from '../middleware/auth';
import { createServices } from '../services';
import { successResponse, paginatedResponse } from '../utils/response';
import { generateRedemptionCode } from '../utils/crypto';

export const redemptionRoutes = new Hono<{ Bindings: Env; Variables: HonoVariables }>();

/** GET /api/redemption - 兑换码列表 */
redemptionRoutes.get('/', adminAuth, async (c) => {
  const page = parseInt(c.req.query('page') || '1');
  const pageSize = parseInt(c.req.query('pageSize') || '20');

  const services = createServices(c.env);
  const result = await services.repos.redemption.paginate(page, pageSize);

  return c.json(paginatedResponse(result.items, page, pageSize, result.total));
});

/** GET /api/redemption/search - 搜索兑换码 */
redemptionRoutes.get('/search', adminAuth, async (c) => {
  const keyword = c.req.query('keyword') || '';
  const page = parseInt(c.req.query('page') || '1');
  const pageSize = parseInt(c.req.query('pageSize') || '20');

  const services = createServices(c.env);
  const pattern = `%${keyword}%`;
  const items = await services.repos.redemption.raw(
    'SELECT * FROM redemptions WHERE key LIKE ? OR name LIKE ? ORDER BY created_time DESC LIMIT ? OFFSET ?',
    pattern, pattern, pageSize, (page - 1) * pageSize
  );
  const countRet = await services.repos.redemption.raw<{ total: number }>(
    'SELECT COUNT(*) as total FROM redemptions WHERE key LIKE ? OR name LIKE ?', pattern, pattern
  );

  return c.json(paginatedResponse(items, page, pageSize, countRet[0]?.total ?? 0));
});

/** GET /api/redemption/:id - 兑换码详情 */
redemptionRoutes.get('/:id', adminAuth, async (c) => {
  const id = parseInt(c.req.param('id'));
  const services = createServices(c.env);
  const item = await services.repos.redemption.findById(id);

  if (!item) {
    return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Not found' } }, 404);
  }
  return c.json(successResponse(item));
});

/** POST /api/redemption - 创建兑换码 */
redemptionRoutes.post('/', adminAuth, async (c) => {
  const body = await c.req.json<{ name: string; quota: number; count?: number }>();
  if (!body.name || !body.quota) {
    return c.json({ success: false, error: { code: 'INVALID_INPUT', message: 'name and quota required' } }, 400);
  }

  const services = createServices(c.env);
  const count = body.count || 1;
  const items: Array<{ name: string; key: string; quota: number }> = [];

  for (let i = 0; i < count; i++) {
    items.push({ name: body.name, key: generateRedemptionCode(), quota: body.quota });
  }

  const ids = await services.repos.redemption.createBatch(items);

  return c.json(successResponse({ created: ids.length, keys: items.map((it, i) => ({ id: ids[i], key: it.key })) }), 201);
});

/** PUT /api/redemption - 更新兑换码 */
redemptionRoutes.put('/', adminAuth, async (c) => {
  const body = await c.req.json<{ id: number; name?: string; status?: number; quota?: number }>();
  if (!body.id) {
    return c.json({ success: false, error: { code: 'INVALID_INPUT', message: 'id required' } }, 400);
  }

  const services = createServices(c.env);
  const updates: Record<string, any> = {};
  if (body.name !== undefined) updates.name = body.name;
  if (body.status !== undefined) updates.status = body.status;
  if (body.quota !== undefined) updates.quota = body.quota;

  await services.repos.redemption.updateById(body.id, updates);

  const updated = await services.repos.redemption.findById(body.id);
  return c.json(successResponse(updated));
});

/** DELETE /api/redemption/:id - 删除兑换码 */
redemptionRoutes.delete('/:id', adminAuth, async (c) => {
  const id = parseInt(c.req.param('id'));
  const services = createServices(c.env);
  await services.repos.redemption.deleteById(id);
  return c.json(successResponse({ deleted: true }));
});
