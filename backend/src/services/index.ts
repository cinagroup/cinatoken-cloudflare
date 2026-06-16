/**
 * 服务层统一导出
 */

export { RedisService, createRedis, REDIS_KEYS, CACHE_TTL } from './redis.js';
export { UserService, type RegisterInput, type LoginInput, type LoginResult, type UserInfo, BusinessError, ValidationError } from './user.js';
export { TokenService, type TokenStats, type TokenUsageByDay } from './token.js';
export { ChannelService } from './channel.js';
export { ChannelDistributor } from './distributor.js';

/**
 * Service 工厂 - 创建所有 Service 实例
 */
import { UserRepository } from '../repositories/user.js';
import { TokenRepository } from '../repositories/token.js';
import { ChannelRepository } from '../repositories/channel.js';
import { LogRepository } from '../repositories/log.js';
import { OptionRepository } from '../repositories/option.js';
import { RedemptionRepository } from '../repositories/redemption.js';
import { RedisService } from './redis.js';
import { UserService } from './user.js';
import { TokenService } from './token.js';
import { ChannelService } from './channel.js';
import type { Env } from '../types/index.js';

export function createServices(env: Env) {
  const db = env.DB;
  const redis = new RedisService(env);

  const repos = {
    user: new UserRepository(db),
    token: new TokenRepository(db),
    channel: new ChannelRepository(db),
    log: new LogRepository(db),
    option: new OptionRepository(db),
    redemption: new RedemptionRepository(db),
  };

  return {
    repos,
    redis,
    user: new UserService(env, repos.user, redis),
    token: new TokenService(repos, redis),
    channel: new ChannelService(repos, redis),
  };
}

export type Services = ReturnType<typeof createServices>;
