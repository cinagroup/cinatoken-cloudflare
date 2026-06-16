/**
 * 数据访问层统一导出
 */

import { UserRepository } from './user.js';
import { TokenRepository } from './token.js';
import { ChannelRepository } from './channel.js';
import { LogRepository } from './log.js';
import { OptionRepository } from './option.js';
import { RedemptionRepository } from './redemption.js';

export { BaseRepository, type PaginationResult } from './base.js';
export { UserRepository } from './user.js';
export { TokenRepository } from './token.js';
export { ChannelRepository } from './channel.js';
export { LogRepository, type LogQueryOptions, type LogStat } from './log.js';
export { OptionRepository } from './option.js';
export { RedemptionRepository } from './redemption.js';

/**
 * Repository 工厂 - 创建所有 Repository 实例
 */
export function createRepositories(db: D1Database) {
  return {
    user: new UserRepository(db),
    token: new TokenRepository(db),
    channel: new ChannelRepository(db),
    log: new LogRepository(db),
    option: new OptionRepository(db),
    redemption: new RedemptionRepository(db),
  };
}

export type Repositories = ReturnType<typeof createRepositories>;
