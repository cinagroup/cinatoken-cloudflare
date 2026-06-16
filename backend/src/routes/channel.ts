/**
 * 渠道路由
 */

import { Hono } from 'hono';
import { adminAuth } from '../middleware/auth';
import { createServices } from '../services';
import type { Env, HonoVariables } from '../types';
import { successResponse, paginatedResponse } from '../utils/response';

export const channelRoutes = new Hono<{ Bindings: Env; Variables: HonoVariables }>();

// 所有渠道路由都需要管理员认证
channelRoutes.use('*', adminAuth);

// ==================== CRUD ====================

/** GET /api/channel - 渠道列表 */
channelRoutes.get('/', async (c) => {
  const page = parseInt(c.req.query('page') || '1');
  const pageSize = parseInt(c.req.query('pageSize') || '20');
  const status = c.req.query('status') ? parseInt(c.req.query('status')!) : undefined;

  const services = createServices(c.env);
  const result = await services.channel.list(page, pageSize, status);

  return c.json(paginatedResponse(result.items, page, pageSize, result.total));
});

/** GET /api/channel/search - 搜索渠道 */
channelRoutes.get('/search', async (c) => {
  const keyword = c.req.query('keyword') || '';
  const page = parseInt(c.req.query('page') || '1');
  const pageSize = parseInt(c.req.query('pageSize') || '20');

  const services = createServices(c.env);
  const result = await services.channel.search(keyword, page, pageSize);

  return c.json(paginatedResponse(result.items, page, pageSize, result.total));
});

/** GET /api/channel/models - 所有可用模型 */
channelRoutes.get('/models', async (c) => {
  const services = createServices(c.env);
  const models = await services.channel.getAllModels();
  return c.json(successResponse({ models, count: models.length }));
});

/** GET /api/channel/:id - 渠道详情 */
channelRoutes.get('/:id', async (c) => {
  const id = parseInt(c.req.param('id'));
  const services = createServices(c.env);
  const channel = await services.channel.getById(id);

  if (!channel) {
    return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Channel not found' } }, 404);
  }

  return c.json(successResponse(channel));
});

/** POST /api/channel - 创建渠道 */
channelRoutes.post('/', async (c) => {
  const body = await c.req.json<any>();

  const services = createServices(c.env);
  try {
    const channel = await services.channel.create({
      type: body.type,
      key: body.key,
      name: body.name,
      weight: body.weight,
      models: body.models,
      group_name: body.groupName || body.group_name,
      base_url: body.baseUrl || body.base_url,
      other: body.other,
      model_mapping: body.modelMapping || body.model_mapping,
      priority: body.priority,
      auto_balance: body.autoBalance ?? body.auto_balance,
      setting: body.setting,
    });

    return c.json(successResponse(channel), 201);
  } catch (err: any) {
    return c.json({ success: false, error: { code: 'INTERNAL_ERROR', message: err.message } }, 500);
  }
});

/** PUT /api/channel - 更新渠道 */
channelRoutes.put('/', async (c) => {
  const body = await c.req.json<any>();
  if (!body.id) {
    return c.json({ success: false, error: { code: 'INVALID_INPUT', message: 'Channel ID required' } }, 400);
  }

  const services = createServices(c.env);
  const updated = await services.channel.update(body.id, {
    type: body.type,
    key: body.key,
    status: body.status,
    name: body.name,
    weight: body.weight,
    models: body.models,
    group_name: body.groupName || body.group_name,
    base_url: body.baseUrl || body.base_url,
    other: body.other,
    model_mapping: body.modelMapping || body.model_mapping,
    priority: body.priority,
    auto_balance: body.autoBalance ?? body.auto_balance,
    setting: body.setting,
  });

  if (!updated) {
    return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Channel not found' } }, 404);
  }

  return c.json(successResponse(updated));
});

/** DELETE /api/channel/:id - 删除渠道 */
channelRoutes.delete('/:id', async (c) => {
  const id = parseInt(c.req.param('id'));
  const services = createServices(c.env);
  const deleted = await services.channel.delete(id);

  if (!deleted) {
    return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Channel not found' } }, 404);
  }

  return c.json(successResponse({ deleted: true }));
});

/** POST /api/channel/batch - 批量删除 */
channelRoutes.post('/batch', async (c) => {
  const body = await c.req.json<{ ids: number[] }>();
  const services = createServices(c.env);
  const count = await services.channel.batchDelete(body.ids);
  return c.json(successResponse({ deleted: count }));
});

/** DELETE /api/channel/disabled - 删除禁用渠道 */
channelRoutes.delete('/disabled', async (c) => {
  const services = createServices(c.env);
  const count = await services.channel.deleteDisabled();
  return c.json(successResponse({ deleted: count }));
});

/** POST /api/channel/copy/:id - 复制渠道 */
channelRoutes.post('/copy/:id', async (c) => {
  const id = parseInt(c.req.param('id'));
  const services = createServices(c.env);
  const copied = await services.channel.copy(id);

  if (!copied) {
    return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Source channel not found' } }, 404);
  }

  return c.json(successResponse(copied), 201);
});

// ==================== 测试与余额 ====================

/** GET /api/channel/test - 测试所有渠道 */
channelRoutes.get('/test', async (c) => {
  const services = createServices(c.env);
  const results = await services.channel.testAllChannels();
  return c.json(successResponse(results));
});

/** GET /api/channel/test/:id - 测试单个渠道 */
channelRoutes.get('/test/:id', async (c) => {
  const id = parseInt(c.req.param('id'));
  const services = createServices(c.env);
  const result = await services.channel.testChannel(id);
  return c.json(successResponse(result));
});

/** GET /api/channel/update_balance - 更新所有渠道余额 */
channelRoutes.get('/update_balance', async (c) => {
  const services = createServices(c.env);
  const results = await services.channel.updateAllBalances();
  return c.json(successResponse(results));
});

/** GET /api/channel/update_balance/:id - 更新单个渠道余额 */
channelRoutes.get('/update_balance/:id', async (c) => {
  const id = parseInt(c.req.param('id'));
  const services = createServices(c.env);
  const result = await services.channel.updateBalance(id);
  return c.json(successResponse(result));
});

// ==================== 标签管理 ====================

/** POST /api/channel/batch/tag - 批量设置标签 */
channelRoutes.post('/batch/tag', async (c) => {
  const body = await c.req.json<{ ids: number[]; tag: string }>();
  const services = createServices(c.env);
  const count = await services.channel.batchSetTag(body.ids, body.tag);
  return c.json(successResponse({ updated: count }));
});

/** POST /api/channel/tag/disabled - 禁用标签下所有渠道 */
channelRoutes.post('/tag/disabled', async (c) => {
  const body = await c.req.json<{ tag: string }>();
  const services = createServices(c.env);
  await services.channel.updateStatusByTag(body.tag, 2);
  return c.json(successResponse({ ok: true }));
});

/** POST /api/channel/tag/enabled - 启用标签下所有渠道 */
channelRoutes.post('/tag/enabled', async (c) => {
  const body = await c.req.json<{ tag: string }>();
  const services = createServices(c.env);
  await services.channel.updateStatusByTag(body.tag, 1);
  return c.json(successResponse({ ok: true }));
});
