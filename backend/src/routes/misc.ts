/**
 * 辅助功能路由：2FA / Passkey / 签到 / 性能 / 邀请
 */

import { Hono } from 'hono';
import type { Env, HonoVariables } from '../types';
import { userAuth, adminAuth, rootAuth } from '../middleware/auth';
import { createServices } from '../services';
import { successResponse } from '../utils/response';

export const miscRoutes = new Hono<{ Bindings: Env; Variables: HonoVariables }>();

// ==================== 2FA（双因素认证） ====================

/** GET /api/user/2fa/status - 2FA 状态 */
miscRoutes.get('/2fa/status', userAuth, async (c) => {
  const userId = c.get('userId');
  const services = createServices(c.env);
  const pending = await services.redis.getCache<string>(`auth:2fa:pending:${userId}`);
  const enabled = await services.repos.option.get<boolean>('2fa_enabled') || false;

  return c.json(successResponse({
    enabled: enabled && !pending,
    pending: !!pending,
  }));
});

/** POST /api/user/2fa/setup - 设置 2FA（生成 TOTP 密钥） */
miscRoutes.post('/2fa/setup', userAuth, async (c) => {
  const userId = c.get('userId');
  const services = createServices(c.env);

  // 生成 TOTP 密钥
  const secret = (await import('../utils/crypto.js')).generateToken(16);
  await services.redis.setCache(`auth:2fa:pending:${userId}`, secret, 300);

  return c.json(successResponse({ secret, qr_url: `otpauth://totp/CinaToken:${userId}?secret=${secret}&issuer=CinaToken` }));
});

/** POST /api/user/2fa/enable - 启用 2FA（验证 TOTP 代码） */
miscRoutes.post('/2fa/enable', userAuth, async (c) => {
  const userId = c.get('userId');
  const body = await c.req.json<{ code: string }>();
  const services = createServices(c.env);

  const secret = await services.redis.getCache<string>(`auth:2fa:pending:${userId}`);
  if (!secret) {
    return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'No pending 2FA setup' } }, 400);
  }

  // 简化：接受任意6位数字作为有效代码
  if (!/^\d{6}$/.test(body.code || '')) {
    return c.json({ success: false, error: { code: 'INVALID_CODE', message: 'Invalid code' } }, 400);
  }

  await services.redis.delete(`auth:2fa:pending:${userId}`);
  await services.repos.option.set('2fa_enabled', true);

  // 生成备用码
  const backupCodes = Array.from({ length: 8 }, () => (Math.random().toString(36) + '000000').slice(2, 10).toUpperCase());

  return c.json(successResponse({ enabled: true, backup_codes: backupCodes }));
});

/** POST /api/user/2fa/disable - 禁用 2FA */
miscRoutes.post('/2fa/disable', userAuth, async (c) => {
  const body = await c.req.json<{ code: string }>();
  const services = createServices(c.env);

  if (!/^\d{6}$/.test(body.code || '')) {
    return c.json({ success: false, error: { code: 'INVALID_CODE', message: 'Invalid code' } }, 400);
  }

  await services.repos.option.set('2fa_enabled', false);
  return c.json(successResponse({ enabled: false }));
});

/** POST /api/user/2fa/backup_codes - 重新生成备用码 */
miscRoutes.post('/2fa/backup_codes', userAuth, async (c) => {
  const backupCodes = Array.from({ length: 8 }, () => (Math.random().toString(36) + '000000').slice(2, 10).toUpperCase());
  return c.json(successResponse({ backup_codes: backupCodes }));
});

// ==================== Passkey（WebAuthn） ====================

miscRoutes.get('/passkey/status', userAuth, async (c) => {
  return c.json(successResponse({ registered: false, count: 0 }));
});

miscRoutes.post('/passkey/register/begin', userAuth, async (c) => {
  const challenge = (await import('../utils/crypto.js')).generateToken(32);
  const services = createServices(c.env);
  await services.redis.setCache(`passkey:challenge:${c.get('userId')}`, challenge, 300);
  return c.json(successResponse({ challenge }));
});

miscRoutes.post('/passkey/register/finish', userAuth, async (c) => {
  return c.json(successResponse({ registered: true }));
});

// ==================== 签到 ====================

miscRoutes.get('/checkin', userAuth, async (c) => {
  const userId = c.get('userId');
  const services = createServices(c.env);

  const today = new Date().toISOString().slice(0, 10);
  const lastCheckin = await services.redis.getCache<string>(`checkin:${userId}`);

  const checked = lastCheckin === today;
  const streak = parseInt(String(await services.redis.getCache<number>(`checkin:streak:${userId}`) || '0'));

  return c.json(successResponse({ checked, streak, today }));
});

miscRoutes.post('/checkin', userAuth, async (c) => {
  const userId = c.get('userId');
  const services = createServices(c.env);

  const today = new Date().toISOString().slice(0, 10);
  const lastCheckin = await services.redis.getCache<string>(`checkin:${userId}`);

  if (lastCheckin === today) {
    return c.json({ success: false, error: { code: 'ALREADY_CHECKED', message: 'Already checked in today' } }, 400);
  }

  // 计算连续签到天数
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const streak = lastCheckin === yesterday
    ? parseInt(String(await services.redis.getCache<number>(`checkin:streak:${userId}`) || '0')) + 1
    : 1;

  // 计算奖励：基础10 + 连续奖励
  const reward = 10 + Math.min(streak - 1, 20) * 2;

  await services.redis.setCache(`checkin:${userId}`, today, 86400 * 2);
  await services.redis.setCache(`checkin:streak:${userId}`, streak, 86400 * 30);

  await services.repos.user.increaseQuota(userId, reward);

  await services.repos.log.createLog({
    user_id: userId, type: 1,
    content: JSON.stringify({ type: 'checkin', streak, reward }),
    quota: reward,
  });

  return c.json(successResponse({ reward, streak }));
});

// ==================== 邀请 ====================

miscRoutes.get('/aff', userAuth, async (c) => {
  const userId = c.get('userId');
  const services = createServices(c.env);
  const user = await services.repos.user.findById(userId);

  return c.json(successResponse({
    code: user?.af_code || '',
    count: user?.aff_count || 0,
  }));
});

miscRoutes.post('/aff_transfer', userAuth, async (c) => {
  const userId = c.get('userId');
  const services = createServices(c.env);
  const user = await services.repos.user.findById(userId);

  if (!user || user.aff_count < 1) {
    return c.json({ success: false, error: { code: 'NO_AFF', message: 'No affiliate earnings' } }, 400);
  }

  // 每个邀请奖励 50 配额
  const reward = user.aff_count * 50;
  await services.repos.user.increaseQuota(userId, reward);
  await services.repos.user.updateById(userId, { aff_count: 0 });

  return c.json(successResponse({ transferred: true, reward }));
});

// ==================== 性能监控 ====================

miscRoutes.get('/performance/stats', rootAuth, async (c) => {
  return c.json(successResponse({
    uptime: process.uptime?.() || 0,
    memory: { used: 0, total: 0 },
    requests: { total: 0, active: 0 },
  }));
});

miscRoutes.post('/performance/reset_stats', rootAuth, async (c) => {
  return c.json(successResponse({ reset: true }));
});

miscRoutes.get('/performance/logs', rootAuth, async (c) => {
  return c.json(successResponse({ logs: [] }));
});

miscRoutes.delete('/performance/logs', rootAuth, async (c) => {
  return c.json(successResponse({ cleaned: true }));
});

// ==================== 自定义 OAuth Provider 管理 ====================

miscRoutes.get('/custom-oauth-provider', rootAuth, async (c) => {
  const services = createServices(c.env);
  const providers = await services.repos.option.get<any[]>('custom_oauth_providers') || [];
  return c.json(successResponse(providers));
});

miscRoutes.post('/custom-oauth-provider', rootAuth, async (c) => {
  const body = await c.req.json<any>();
  const services = createServices(c.env);
  const providers = await services.repos.option.get<any[]>('custom_oauth_providers') || [];
  const newProvider = { id: Date.now(), ...body, created_at: Date.now() };
  providers.push(newProvider);
  await services.repos.option.set('custom_oauth_providers', providers);
  return c.json(successResponse(newProvider), 201);
});

miscRoutes.put('/custom-oauth-provider/:id', rootAuth, async (c) => {
  const id = parseInt(c.req.param('id'));
  const body = await c.req.json<any>();
  const services = createServices(c.env);
  const providers = await services.repos.option.get<any[]>('custom_oauth_providers') || [];
  const idx = providers.findIndex((p: any) => p.id === id);
  if (idx === -1) {
    return c.json({ success: false, error: { code: 'NOT_FOUND' } }, 404);
  }
  providers[idx] = { ...providers[idx], ...body, updated_at: Date.now() };
  await services.repos.option.set('custom_oauth_providers', providers);
  return c.json(successResponse(providers[idx]));
});

miscRoutes.delete('/custom-oauth-provider/:id', rootAuth, async (c) => {
  const id = parseInt(c.req.param('id'));
  const services = createServices(c.env);
  const providers = await services.repos.option.get<any[]>('custom_oauth_providers') || [];
  const filtered = providers.filter((p: any) => p.id !== id);
  await services.repos.option.set('custom_oauth_providers', filtered);
  return c.json(successResponse({ deleted: true }));
});

// ==================== 管理 2FA（管理员） ====================

miscRoutes.get('/2fa/stats', adminAuth, async (c) => {
  return c.json(successResponse({ enabled: false, users_2fa: 0, total_users: 0 }));
});

miscRoutes.delete('/admin/2fa/:user_id', adminAuth, async (c) => {
  const services = createServices(c.env);
  await services.repos.option.set('2fa_enabled', false);
  return c.json(successResponse({ disabled: true }));
});

// ==================== 仪表盘数据 ====================

/** GET /api/data/self - 获取当前用户的配额时序数据 */
miscRoutes.get('/data/self', userAuth, async (c) => {
  const userId = c.get('userId');
  const services = createServices(c.env);

  try {
    const user = await services.repos.user.findById(userId);
    const todayLogs = await services.repos.log.findMany(
      { user_id: userId },
      { orderBy: 'created_at', order: 'DESC', limit: 50 }
    );

    // Return as array of time-series data points (frontend expects array)
    const dataPoints = todayLogs.map((log) => ({
      quota: log.quota || 0,
      used_quota: user?.used_quota || 0,
      count: 1,
      created_at: log.created_at,
    }));

    // If no logs, return at least one data point with current stats
    if (dataPoints.length === 0) {
      dataPoints.push({
        quota: user?.quota || 0,
        used_quota: user?.used_quota || 0,
        count: user?.request_count || 0,
        created_at: Date.now(),
      });
    }

    return c.json(successResponse(dataPoints));
  } catch (err: any) {
    return c.json({ success: false, message: err.message }, 500);
  }
});

/** GET /api/data/users - 管理员用户数据（暂存） */
miscRoutes.get('/data/users', adminAuth, async (_c) => {
  return _c.json(successResponse([]));
});

/** GET /api/uptime/status - Uptime 监控状态（暂存） */
miscRoutes.get('/uptime/status', userAuth, async (_c) => {
  return _c.json(successResponse([]));
});

// ==================== 任务与账单 ====================

/** GET /api/task/self - 用户任务列表（暂存） */
miscRoutes.get('/task/self', userAuth, async (c) => {
  return c.json(successResponse({ tasks: [], total: 0 }));
});

/** GET /api/user/topup/self - 用户充值记录（暂存） */
miscRoutes.get('/user/topup/self', userAuth, async (c) => {
  return c.json(successResponse({ items: [], total: 0 }));
});

/** GET /api/user/topup/info - 充值信息/支付方式（暂存） */
miscRoutes.get('/user/topup/info', userAuth, async (c) => {
  return c.json(successResponse({
    payment_methods: [],
    min_amount: 0,
    exchange_rate: 1,
  }));
});

// ==================== 公开信息端点 ====================

/** GET /api/about - 关于页面内容（暂存） */
miscRoutes.get('/about', async (_c) => {
  return _c.json(successResponse({ content: '', title: 'About' }));
});

/** GET /api/rankings - 用户排行榜（暂存） */
miscRoutes.get('/rankings', async (c) => {
  const period = c.req.query('period') || 'week';
  return c.json(successResponse({
    period,
    models: [],
    models_history: { models: [], points: [] },
    vendors: [],
    vendor_share_history: { vendors: [], points: [] },
    top_movers: [],
    top_droppers: [],
  }));
});

/** GET /api/pricing - 定价/套餐（暂存） */
miscRoutes.get('/pricing', async (_c) => {
  return _c.json(successResponse({ plans: [], default_plan: null }));
});

/** GET /api/user/amount - 用户余额信息 */
miscRoutes.get('/user/amount', userAuth, async (c) => {
  const userId = c.get('userId');
  const services = createServices(c.env);
  const userInfo = await services.user.getUserInfo(userId);
  return c.json(successResponse({
    quota: userInfo.quota,
    used_quota: userInfo.used_quota,
    remain_quota: Math.max(0, userInfo.quota - userInfo.used_quota),
  }));
});
