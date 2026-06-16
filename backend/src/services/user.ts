/**
 * UserService - 用户业务逻辑层
 * 处理注册、登录、个人信息管理、配额等业务
 */

import type { Env, User } from '../types/index.js';
import { UserRepository } from '../repositories/user.js';
import { RedisService } from './redis.js';
import { signJWT } from '../utils/jwt.js';
import { hashPassword, verifyPassword } from '../utils/password.js';
import { generateInvitationCode } from '../utils/crypto.js';
import {
  isValidEmail,
  isValidUsername,
  isValidPassword,
  createValidator,
} from '../utils/validator.js';

export interface RegisterInput {
  username: string;
  password: string;
  email?: string;
  invitationCode?: string;
}

export interface LoginInput {
  username: string;
  password: string;
}

export interface LoginResult {
  token: string;
  user: UserInfo;
}

export interface UserInfo {
  id: number;
  username: string;
  email: string | null;
  role: number;
  status: number;
  quota: number;
  used_quota: number;
  request_count: number;
  group_name: string;
  created_at: number;
  af_code?: string | null;
  aff_count?: number;
}

export class UserService {
  constructor(
    private env: Env,
    private userRepo: UserRepository,
    private redis: RedisService
  ) {}

  /**
   * 用户注册
   */
  async register(input: RegisterInput): Promise<UserInfo> {
    // 验证输入
    const validator = createValidator()
      .required(input.username, 'Username')
      .required(input.password, 'Password')
      .username(input.username)
      .password(input.password);

    if (input.email) {
      validator.email(input.email);
    }

    const validation = validator.validate();
    if (!validation.valid) {
      throw new ValidationError(validation.errors.join('; '));
    }

    // 检查用户名是否已存在
    const existingUser = await this.userRepo.findByUsername(input.username);
    if (existingUser) {
      throw new BusinessError('USERNAME_EXISTS', 'Username already exists', 409);
    }

    // 检查邮箱是否已存在
    if (input.email) {
      const existingEmail = await this.userRepo.findByEmail(input.email);
      if (existingEmail) {
        throw new BusinessError('EMAIL_EXISTS', 'Email already registered', 409);
      }
    }

    // 处理邀请码
    let inviterId: number | undefined;
    if (input.invitationCode) {
      const inviter = await this.userRepo.findByAffCode(input.invitationCode);
      if (inviter) {
        inviterId = inviter.id;
      }
    }

    // 生成邀请码
    const afCode = generateInvitationCode();

    // 哈希密码
    const passwordHash = await hashPassword(input.password);

    // 创建用户
    const userId = await this.userRepo.createUser({
      username: input.username,
      password_hash: passwordHash,
      email: input.email,
      af_code: afCode,
      inviter_id: inviterId,
      quota: 100, // 初始赠送配额
    });

    // 增加邀请人计数
    if (inviterId) {
      await this.userRepo.incrementAffCount(inviterId);
    }

    // 获取完整用户信息
    const user = await this.userRepo.findById(userId);
    if (!user) {
      throw new BusinessError('INTERNAL_ERROR', 'Failed to create user', 500);
    }

    return this.toUserInfo(user);
  }

  /**
   * 用户登录
   */
  async login(input: LoginInput): Promise<LoginResult> {
    if (!input.username || !input.password) {
      throw new ValidationError('Username and password are required');
    }

    // 查找用户
    const user = await this.userRepo.findByUsername(input.username);
    if (!user) {
      throw new BusinessError('INVALID_CREDENTIALS', 'Invalid username or password', 401);
    }

    // 检查状态
    if (user.status !== 1) {
      throw new BusinessError('ACCOUNT_DISABLED', 'Account has been disabled', 403);
    }

    // 验证密码
    const valid = await verifyPassword(input.password, user.password_hash);
    if (!valid) {
      throw new BusinessError('INVALID_CREDENTIALS', 'Invalid username or password', 401);
    }

    // 生成 JWT（7天有效期）
    const token = await signJWT(
      {
        sub: String(user.id),
        role: user.role,
        username: user.username,
      },
      this.env.JWT_SECRET,
      '7d'
    );

    // 记录会话到 Redis
    const ip = ''; // IP 由中间件获取，这里留空
    await this.redis.setUserSession(user.id, {
      lastLogin: Date.now(),
      ip,
    });

    return {
      token,
      user: this.toUserInfo(user),
    };
  }

  /**
   * 获取用户信息
   */
  async getUserInfo(userId: number): Promise<UserInfo> {
    const user = await this.userRepo.findById(userId);
    if (!user) {
      throw new BusinessError('USER_NOT_FOUND', 'User not found', 404);
    }
    return this.toUserInfo(user);
  }

  /**
   * 更新个人信息
   */
  async updateSelf(
    userId: number,
    data: { email?: string }
  ): Promise<UserInfo> {
    const updates: Record<string, any> = { updated_at: Date.now() };

    if (data.email !== undefined) {
      if (data.email && !isValidEmail(data.email)) {
        throw new ValidationError('Invalid email format');
      }
      // 检查邮箱唯一性
      if (data.email) {
        const existing = await this.userRepo.findByEmail(data.email);
        if (existing && existing.id !== userId) {
          throw new BusinessError('EMAIL_EXISTS', 'Email already registered', 409);
        }
      }
      updates.email = data.email || null;
    }

    await this.userRepo.updateById(userId, updates);

    return this.getUserInfo(userId);
  }

  /**
   * 修改密码
   */
  async changePassword(
    userId: number,
    oldPassword: string,
    newPassword: string
  ): Promise<void> {
    if (!isValidPassword(newPassword)) {
      throw new ValidationError(
        'Password must be at least 8 characters with uppercase, lowercase, and numbers'
      );
    }

    const user = await this.userRepo.findById(userId);
    if (!user) {
      throw new BusinessError('USER_NOT_FOUND', 'User not found', 404);
    }

    const valid = await verifyPassword(oldPassword, user.password_hash);
    if (!valid) {
      throw new BusinessError('INVALID_CREDENTIALS', 'Old password is incorrect', 401);
    }

    const newHash = await hashPassword(newPassword);
    await this.userRepo.updateById(userId, {
      password_hash: newHash,
      updated_at: Date.now(),
    });

    // 清除会话（强制重新登录）
    await this.redis.clearUserSession(userId);
  }

  /**
   * 用户登出
   */
  async logout(userId: number): Promise<void> {
    await this.redis.clearUserSession(userId);
  }

  // ==================== 管理员操作 ====================

  /**
   * 获取用户列表（管理员）
   */
  async listUsers(page: number = 1, pageSize: number = 20) {
    return this.userRepo.listUsers(page, pageSize);
  }

  /**
   * 搜索用户（管理员）
   */
  async searchUsers(keyword: string, page: number = 1, pageSize: number = 20) {
    if (!keyword || keyword.trim().length === 0) {
      throw new ValidationError('Search keyword is required');
    }
    return this.userRepo.search(keyword.trim(), page, pageSize);
  }

  /**
   * 获取用户详情（管理员）
   */
  async getUserById(id: number): Promise<UserInfo> {
    const user = await this.userRepo.findById(id);
    if (!user) {
      throw new BusinessError('USER_NOT_FOUND', 'User not found', 404);
    }
    return this.toUserInfo(user);
  }

  /**
   * 创建用户（管理员）
   */
  async createUser(data: {
    username: string;
    password: string;
    email?: string;
    role?: number;
    quota?: number;
  }): Promise<UserInfo> {
    if (!isValidUsername(data.username)) {
      throw new ValidationError('Invalid username format');
    }
    if (!isValidPassword(data.password)) {
      throw new ValidationError('Invalid password format');
    }

    const existing = await this.userRepo.findByUsername(data.username);
    if (existing) {
      throw new BusinessError('USERNAME_EXISTS', 'Username already exists', 409);
    }

    const passwordHash = await hashPassword(data.password);
    const afCode = generateInvitationCode();

    const userId = await this.userRepo.createUser({
      username: data.username,
      password_hash: passwordHash,
      email: data.email,
      role: data.role ?? 1,
      quota: data.quota ?? 0,
      af_code: afCode,
    });

    const user = await this.userRepo.findById(userId);
    return this.toUserInfo(user!);
  }

  /**
   * 管理用户（修改配额/状态/角色）
   */
  async manageUser(
    id: number,
    data: {
      quota?: number;
      status?: number;
      role?: number;
    }
  ): Promise<UserInfo> {
    const user = await this.userRepo.findById(id);
    if (!user) {
      throw new BusinessError('USER_NOT_FOUND', 'User not found', 404);
    }

    const updates: Record<string, any> = { updated_at: Date.now() };

    if (data.quota !== undefined) {
      updates.quota = data.quota;
    }
    if (data.status !== undefined) {
      updates.status = data.status;
    }
    if (data.role !== undefined) {
      updates.role = data.role;
    }

    await this.userRepo.updateById(id, updates);

    // 如果禁用用户，清除会话
    if (data.status === 2) {
      await this.redis.clearUserSession(id);
    }

    return this.getUserInfo(id);
  }

  /**
   * 删除用户（软删除：标记为禁用）
   */
  async deleteUser(id: number): Promise<void> {
    const user = await this.userRepo.findById(id);
    if (!user) {
      throw new BusinessError('USER_NOT_FOUND', 'User not found', 404);
    }

    if (user.role >= 100) {
      throw new BusinessError('FORBIDDEN', 'Cannot delete root user', 403);
    }

    await this.userRepo.updateById(id, {
      status: 2,
      updated_at: Date.now(),
    });
    await this.redis.clearUserSession(id);
  }

  /**
   * 增加用户配额（管理员/兑换码核销）
   */
  async addQuota(userId: number, amount: number): Promise<void> {
    if (amount <= 0) {
      throw new ValidationError('Quota amount must be positive');
    }
    await this.userRepo.increaseQuota(userId, amount);
  }

  // ==================== 工具方法 ====================

  /**
   * 转换为用户信息（排除敏感字段）
   */
  private toUserInfo(user: User): UserInfo {
    return {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      status: user.status,
      quota: user.quota,
      used_quota: user.used_quota,
      request_count: user.request_count,
      group_name: user.group_name,
      created_at: user.created_at,
      af_code: user.af_code,
      aff_count: user.aff_count,
    };
  }
}

/**
 * 业务错误
 */
export class BusinessError extends Error {
  constructor(
    public code: string,
    message: string,
    public statusCode: number = 400
  ) {
    super(message);
    this.name = 'BusinessError';
  }
}

/**
 * 验证错误
 */
export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
    this.code = 'VALIDATION_ERROR';
  }
  code: string;
}
