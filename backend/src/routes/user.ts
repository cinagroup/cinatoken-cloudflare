/**
 * 用户路由
 * - 注册 / 登录 / 登出
 * - 个人信息管理
 * - 管理员用户管理
 * - 密码重置
 */

import { Hono } from 'hono';
import type { Env, HonoVariables } from '../types/index.js';
import { createServices, BusinessError, ValidationError } from '../services/index.js';
import { successResponse, paginatedResponse } from '../utils/response.js';
import { userAuth, adminAuth, criticalRateLimit, searchRateLimit } from '../middleware/index.js';

export const userRoutes = new Hono<{ Bindings: Env; Variables: HonoVariables }>();

// ==================== 公开路由（无需认证） ====================

/**
 * POST /api/user/register - 用户注册
 */
userRoutes.post('/register', criticalRateLimit, async (c) => {
  const body = await c.req.json<{
    username: string;
    password: string;
    email?: string;
    invitation_code?: string;
  }>();

  const services = createServices(c.env);

  try {
    const userInfo = await services.user.register({
      username: body.username,
      password: body.password,
      email: body.email,
      invitationCode: body.invitation_code,
    });

    return c.json(successResponse(userInfo), 201);
  } catch (err) {
    return handleError(err, c);
  }
});

/**
 * POST /api/user/login - 用户登录
 */
userRoutes.post('/login', criticalRateLimit, async (c) => {
  const body = await c.req.json<{ username: string; password: string }>();

  const services = createServices(c.env);

  try {
    const result = await services.user.login({
      username: body.username,
      password: body.password,
    });

    return c.json(successResponse(result));
  } catch (err) {
    return handleError(err, c);
  }
});

/**
   * POST /api/user/logout - 用户登出
   */
userRoutes.post('/logout', userAuth, async (c) => {
  const userId = c.get('userId');
  const services = createServices(c.env);

  await services.user.logout(userId);

  return c.json(successResponse({ loggedOut: true }));
});

// ==================== 个人信息管理（需要用户认证） ====================

/**
 * GET /api/user/self - 获取当前用户信息
 */
userRoutes.get('/self', userAuth, async (c) => {
  const userId = c.get('userId');
  const services = createServices(c.env);

  try {
    const userInfo = await services.user.getUserInfo(userId);
    return c.json(successResponse(userInfo));
  } catch (err) {
    return handleError(err, c);
  }
});

/**
 * PUT /api/user/self - 更新个人信息
 */
userRoutes.put('/self', userAuth, async (c) => {
  const userId = c.get('userId');
  const body = await c.req.json<{ email?: string }>();

  const services = createServices(c.env);

  try {
    const userInfo = await services.user.updateSelf(userId, body);
    return c.json(successResponse(userInfo));
  } catch (err) {
    return handleError(err, c);
  }
});

/**
 * POST /api/user/self/password - 修改密码
 */
userRoutes.post('/self/password', userAuth, async (c) => {
  const userId = c.get('userId');
  const body = await c.req.json<{
    old_password: string;
    new_password: string;
  }>();

  const services = createServices(c.env);

  try {
    await services.user.changePassword(
      userId,
      body.old_password,
      body.new_password
    );

    return c.json(successResponse({ changed: true }));
  } catch (err) {
    return handleError(err, c);
  }
});

/**
 * GET /api/user/self/groups - 获取用户可用分组
 */
userRoutes.get('/self/groups', userAuth, async (c) => {
  const userId = c.get('userId');
  const services = createServices(c.env);
  const userInfo = await services.user.getUserInfo(userId);

  return c.json(
    successResponse({
      groups: [userInfo.group_name, 'default'].filter((v, i, a) => a.indexOf(v) === i),
      current: userInfo.group_name,
    })
  );
});

// ==================== 管理员路由 ====================

/**
 * GET /api/user/ - 用户列表（管理员）
 */
userRoutes.get('/', adminAuth, async (c) => {
  const page = parseInt(c.req.query('page') || '1', 10);
  const pageSize = parseInt(c.req.query('pageSize') || '20', 10);

  const services = createServices(c.env);
  const result = await services.user.listUsers(page, pageSize);

  return c.json(paginatedResponse(result.items, page, pageSize, result.total));
});

/**
 * GET /api/user/search - 搜索用户（管理员）
 */
userRoutes.get('/search', adminAuth, searchRateLimit, async (c) => {
  const keyword = c.req.query('keyword') || '';
  const page = parseInt(c.req.query('page') || '1', 10);
  const pageSize = parseInt(c.req.query('pageSize') || '20', 10);

  const services = createServices(c.env);

  try {
    const result = await services.user.searchUsers(keyword, page, pageSize);
    return c.json(paginatedResponse(result.items, page, pageSize, result.total));
  } catch (err) {
    return handleError(err, c);
  }
});

/** GET /api/user/models - 获取用户可用的模型列表 */
userRoutes.get('/models', userAuth, async (c) => {
  try {
    const services = createServices(c.env);
    const models = await services.repos.channel.getAllModels();
    return c.json(successResponse(models));
  } catch (err: any) {
    return c.json({ success: false, message: err.message }, 500);
  }
});

/**
 * GET /api/user/:id - 用户详情（管理员）
 */
userRoutes.get('/:id', adminAuth, async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  if (isNaN(id)) {
    return c.json(
      { success: false, error: { code: 'INVALID_INPUT', message: 'Invalid user ID' } },
      400
    );
  }

  const services = createServices(c.env);

  try {
    const userInfo = await services.user.getUserById(id);
    return c.json(successResponse(userInfo));
  } catch (err) {
    return handleError(err, c);
  }
});

/**
 * POST /api/user/ - 创建用户（管理员）
 */
userRoutes.post('/', adminAuth, async (c) => {
  const body = await c.req.json<{
    username: string;
    password: string;
    email?: string;
    role?: number;
    quota?: number;
  }>();

  const services = createServices(c.env);

  try {
    const userInfo = await services.user.createUser(body);
    return c.json(successResponse(userInfo), 201);
  } catch (err) {
    return handleError(err, c);
  }
});

/**
 * PUT /api/user/manage - 管理用户（配额/状态/角色）
 */
userRoutes.put('/manage', adminAuth, async (c) => {
  const body = await c.req.json<{
    id: number;
    quota?: number;
    status?: number;
    role?: number;
  }>();

  const services = createServices(c.env);

  try {
    const userInfo = await services.user.manageUser(body.id, {
      quota: body.quota,
      status: body.status,
      role: body.role,
    });
    return c.json(successResponse(userInfo));
  } catch (err) {
    return handleError(err, c);
  }
});

/**
 * DELETE /api/user/:id - 删除用户（管理员，软删除）
 */
userRoutes.delete('/:id', adminAuth, async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  if (isNaN(id)) {
    return c.json(
      { success: false, error: { code: 'INVALID_INPUT', message: 'Invalid user ID' } },
      400
    );
  }

  const services = createServices(c.env);

  try {
    await services.user.deleteUser(id);
    return c.json(successResponse({ deleted: true }));
  } catch (err) {
    return handleError(err, c);
  }
});

// ==================== 密码重置（公开接口） ====================

/**
 * POST /api/user/reset - 通过重置令牌重置密码
 */
userRoutes.post('/reset', criticalRateLimit, async (c) => {
  const body = await c.req.json<{
    token: string;
    new_password: string;
  }>();

  if (!body.token || !body.new_password) {
    return c.json(
      {
        success: false,
        error: { code: 'INVALID_INPUT', message: 'Token and new password are required' },
      },
      400
    );
  }

  const services = createServices(c.env);
  const redis = services.redis;

  // 从 Redis 获取重置令牌对应的用户 ID
  const userId = await redis.getCache<number>(`auth:reset:${body.token}`);

  if (!userId) {
    return c.json(
      {
        success: false,
        error: { code: 'INVALID_TOKEN', message: 'Invalid or expired reset token' },
      },
      400
    );
  }

  try {
    // 直接更新密码
    const { hashPassword } = await import('../utils/password.js');
    const newHash = await hashPassword(body.new_password);

    await services.repos.user.updateById(userId, {
      password_hash: newHash,
      updated_at: Date.now(),
    });

    // 删除重置令牌
    await redis.delete(`auth:reset:${body.token}`);

    // 清除会话
    await redis.clearUserSession(userId);

    return c.json(successResponse({ reset: true }));
  } catch (err) {
    return handleError(err, c);
  }
});

// ==================== 错误处理辅助 ====================

function handleError(err: unknown, c: any) {
  if (err instanceof ValidationError) {
    return c.json(
      {
        success: false,
        error: { code: 'VALIDATION_ERROR', message: err.message },
      },
      400
    );
  }

  if (err instanceof BusinessError) {
    return c.json(
      {
        success: false,
        error: { code: err.code, message: err.message },
      },
      err.statusCode
    );
  }

  console.error('Unexpected error:', err);
  return c.json(
    {
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
    },
    500
  );
}
