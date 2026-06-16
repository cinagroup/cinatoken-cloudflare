/**
 * 支付 Webhook 路由
 */

import { Hono } from 'hono';
import type { Env, HonoVariables } from '../types';
import { userAuth } from '../middleware/auth';
import { createServices } from '../services';
import { successResponse } from '../utils/response';

export const webhookRoutes = new Hono<{ Bindings: Env; Variables: HonoVariables }>();

/** POST /api/stripe/webhook - Stripe 回调 */
webhookRoutes.post('/stripe', async (c) => {
  const body = await c.req.text();

  const services = createServices(c.env);
  const webhookSecret = await services.repos.option.get<string>('stripe_webhook_secret');

  if (!webhookSecret) {
    return c.json({ success: false, error: { code: 'NOT_CONFIGURED' } }, 500);
  }

  try {
    // 简化：记录事件类型
    let event: any;
    try {
      event = JSON.parse(body);
    } catch {
      return c.json({ success: false, error: { code: 'INVALID_JSON' } }, 400);
    }

    const eventType = event.type;

    if (eventType === 'checkout.session.completed') {
      const session = event.data.object;
      const userId = parseInt(session.client_reference_id || '0');
      const amount = session.amount_total ? Math.round(session.amount_total / 100) : 0;

      if (userId > 0 && amount > 0) {
        const quota = amount * 100; // $1 = 100 quota
        await services.repos.user.increaseQuota(userId, quota);

        await services.repos.log.createLog({
          user_id: userId,
          type: 1, // 充值
          content: JSON.stringify({ provider: 'stripe', sessionId: session.id, amount, quota }),
          quota,
        });
      }
    }

    return c.json(successResponse({ received: true, type: eventType }));
  } catch (err: any) {
    return c.json({ success: false, error: { code: 'WEBHOOK_ERROR', message: err.message } }, 500);
  }
});

/** POST /api/creem/webhook - Creem 回调 */
webhookRoutes.post('/creem', async (c) => {
  const body = await c.req.json<any>();
  const services = createServices(c.env);

  try {
    if (body.event === 'order.completed') {
      const userId = parseInt(body.client_reference_id || '0');
      const amount = body.amount || 0;
      if (userId > 0 && amount > 0) {
        const quota = amount * 100;
        await services.repos.user.increaseQuota(userId, quota);
        await services.repos.log.createLog({
          user_id: userId,
          type: 1,
          content: JSON.stringify({ provider: 'creem', orderId: body.order_id, amount, quota }),
          quota,
        });
      }
    }
    return c.json(successResponse({ received: true }));
  } catch (err: any) {
    return c.json({ success: false, error: { code: 'WEBHOOK_ERROR', message: err.message } }, 500);
  }
});

/** POST /api/waffo/webhook - Waffo 回调 */
webhookRoutes.post('/waffo', async (c) => {
  const body = await c.req.json<any>();
  const services = createServices(c.env);

  try {
    if (body.status === 'paid') {
      const userId = parseInt(body.metadata?.user_id || '0');
      const amount = body.amount || 0;
      if (userId > 0 && amount > 0) {
        const quota = amount * 100;
        await services.repos.user.increaseQuota(userId, quota);
        await services.repos.log.createLog({
          user_id: userId,
          type: 1,
          content: JSON.stringify({ provider: 'waffo', paymentId: body.id, amount, quota }),
          quota,
        });
      }
    }
    return c.json(successResponse({ received: true }));
  } catch (err: any) {
    return c.json({ success: false, error: { code: 'WEBHOOK_ERROR', message: err.message } }, 500);
  }
});

/** POST /api/user/epay/notify - Epay 回调 */
webhookRoutes.post('/user/epay/notify', async (c) => {
  const body = await c.req.parseBody<Record<string, string>>();
  const services = createServices(c.env);

  try {
    const tradeNo = body['out_trade_no'];
    const totalFee = parseFloat(body['total_fee'] || '0');
    const tradeStatus = body['trade_status'];

    if (tradeStatus === 'TRADE_SUCCESS' && tradeNo && totalFee > 0) {
      // 从 tradeNo 解析用户 ID（格式：userId_timestamp）
      const userId = parseInt(tradeNo.split('_')[0] || '0');
      if (userId > 0) {
        const quota = Math.round(totalFee * 100);
        await services.repos.user.increaseQuota(userId, quota);
        await services.repos.log.createLog({
          user_id: userId,
          type: 1,
          content: JSON.stringify({ provider: 'epay', tradeNo, amount: totalFee, quota }),
          quota,
        });
      }
    }

    return c.text('success');
  } catch (err: any) {
    return c.text('fail');
  }
});

/** GET /api/user/epay/notify - Epay GET 回调 */
webhookRoutes.get('/user/epay/notify', (c) => c.text('success'));

// ==================== 订阅路由 ====================

export const subscriptionRoutes = new Hono<{ Bindings: Env; Variables: HonoVariables }>();

// 订阅路由需要用户认证
subscriptionRoutes.use('*', userAuth);

/** GET /api/subscription/plans - 订阅计划列表 */
subscriptionRoutes.get('/plans', async (c) => {
  const services = createServices(c.env);
  const items = await services.repos.option.raw(
    'SELECT * FROM subscription_plans WHERE status = 1 ORDER BY sort_order'
  );
  return c.json(successResponse(items));
});

/** GET /api/subscription/self - 当前用户订阅 */
subscriptionRoutes.get('/self', async (c) => {
  const userId = c.get('userId');
  const services = createServices(c.env);
  const subs = await services.repos.option.raw(
    `SELECT s.*, p.name as plan_name, p.price, p.quota as plan_quota
     FROM user_subscriptions s
     JOIN subscription_plans p ON s.plan_id = p.id
     WHERE s.user_id = ? AND s.status = 1
     ORDER BY s.end_time DESC`,
    userId
  );
  return c.json(successResponse(subs));
});

/** POST /api/subscription/balance/pay - 余额支付 */
subscriptionRoutes.post('/balance/pay', async (c) => {
  const userId = c.get('userId');
  const body = await c.req.json<{ plan_id: number }>();
  const services = createServices(c.env);

  const plan = await services.repos.option.raw<any>(
    'SELECT * FROM subscription_plans WHERE id = ? AND status = 1', body.plan_id
  );

  if (!plan || plan.length === 0) {
    return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Plan not found' } }, 404);
  }

  const planData = plan[0];
  const user = await services.repos.user.findById(userId);

  if (!user || user.quota < planData.price) {
    return c.json({ success: false, error: { code: 'INSUFFICIENT_BALANCE', message: 'Not enough balance' } }, 400);
  }

  // 扣款 + 创建订阅
  const now = Date.now();
  await services.repos.user.increaseQuota(userId, -planData.price);

  await services.repos.option.raw(
    `INSERT INTO user_subscriptions (user_id, plan_id, status, start_time, end_time, quota_granted, created_at)
     VALUES (?, ?, 1, ?, ?, ?, ?)`,
    userId, body.plan_id, now, now + planData.duration_days * 86400000, planData.quota, now
  );

  if (planData.quota > 0) {
    await services.repos.user.increaseQuota(userId, planData.quota);
  }

  return c.json(successResponse({ paid: true }));
});
