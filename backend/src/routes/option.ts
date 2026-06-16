/**
 * 系统配置路由
 */

import { Hono } from 'hono';
import type { Env, HonoVariables } from '../types';
import { rootAuth, adminAuth } from '../middleware/auth';
import { createServices } from '../services';
import { successResponse } from '../utils/response';

export const optionRoutes = new Hono<{ Bindings: Env; Variables: HonoVariables }>();

/** GET /api/option - 获取所有配置（返回数组格式，兼容前端） */
optionRoutes.get('/', rootAuth, async (c) => {
  const services = createServices(c.env);
  const config = await services.repos.option.getAllAsObject();
  // Convert object to array of {key, value} pairs for frontend compatibility
  const items = Object.entries(config).map(([key, value]) => ({ key, value }));
  return c.json(successResponse(items));
});

/** PUT /api/option - 更新配置 */
optionRoutes.put('/', rootAuth, async (c) => {
  const body = await c.req.json<Record<string, any>>();
  const services = createServices(c.env);
  await services.repos.option.setMany(body);

  // 清除系统配置缓存
  await services.redis.delete('cache:config:system');

  return c.json(successResponse({ updated: true }));
});

/** GET /api/option/:key - 获取单个配置 */
optionRoutes.get('/:key', rootAuth, async (c) => {
  const key = c.req.param('key');
  const services = createServices(c.env);
  const value = await services.repos.option.get(key);

  return c.json(successResponse({ key, value }));
});

// 公开的系统信息路由
/** GET /api/notice - 系统公告 */
const publicRoutes = new Hono<{ Bindings: Env; Variables: HonoVariables }>();
publicRoutes.get('/', async (c) => {
  const services = createServices(c.env);
  const notice = await services.repos.option.get('notice');
  return c.json(successResponse(notice || ''));
});

/** GET /api/home_page_content - 首页内容 */
publicRoutes.get('/', async (c) => {
  const services = createServices(c.env);
  const content = await services.repos.option.get('home_page_content');
  return c.json(successResponse(content || ''));
});

export const optionPublicRoutes = new Hono<{ Bindings: Env; Variables: HonoVariables }>();
optionPublicRoutes.get('/notice', async (c) => {
  const services = createServices(c.env);
  return c.json(successResponse(await services.repos.option.get('notice') || ''));
});
optionPublicRoutes.get('/home_page_content', async (c) => {
  const services = createServices(c.env);
  return c.json(successResponse(await services.repos.option.get('home_page_content') || ''));
});

/** 模型元数据路由 */
export const modelMetaRoutes = new Hono<{ Bindings: Env; Variables: HonoVariables }>();

modelMetaRoutes.get('/', adminAuth, async (c) => {
  const page = parseInt(c.req.query('page') || '1');
  const pageSize = parseInt(c.req.query('pageSize') || '20');

  const services = createServices(c.env);
  const items = await services.repos.option.raw(
    'SELECT * FROM model_meta ORDER BY sort_order, id LIMIT ? OFFSET ?', pageSize, (page - 1) * pageSize
  );
  const countRet = await services.repos.option.raw<{ total: number }>('SELECT COUNT(*) as total FROM model_meta');

  return c.json({
    success: true,
    data: items,
    meta: { page, pageSize, total: countRet[0]?.total ?? 0 },
  });
});

modelMetaRoutes.post('/', adminAuth, async (c) => {
  const body = await c.req.json<any>();
  const now = Date.now();

  const services = createServices(c.env);
  await services.repos.option.raw(
    'INSERT INTO model_meta (model_name, display_name, description, icon, tags, sort_order, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)',
    body.model_name, body.display_name || null, body.description || null,
    body.icon || null, body.tags ? JSON.stringify(body.tags) : null,
    body.sort_order || 0, now, now
  );

  return c.json(successResponse({ created: true }), 201);
});

modelMetaRoutes.put('/', adminAuth, async (c) => {
  const body = await c.req.json<any>();
  if (!body.id) {
    return c.json({ success: false, error: { code: 'INVALID_INPUT', message: 'id required' } }, 400);
  }

  const services = createServices(c.env);
  await services.repos.option.raw(
    `UPDATE model_meta SET display_name=?, description=?, icon=?, tags=?, sort_order=?, updated_at=?
     WHERE id=?`,
    body.display_name || null, body.description || null, body.icon || null,
    body.tags ? JSON.stringify(body.tags) : null, body.sort_order || 0, Date.now(), body.id
  );

  return c.json(successResponse({ updated: true }));
});

modelMetaRoutes.delete('/:id', adminAuth, async (c) => {
  const id = parseInt(c.req.param('id'));
  const services = createServices(c.env);
  await services.repos.option.raw('DELETE FROM model_meta WHERE id=?', id);
  return c.json(successResponse({ deleted: true }));
});
