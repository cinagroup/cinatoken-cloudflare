/**
 * ChannelDistributor - 渠道分配器
 * 根据模型和用户组选择最优渠道，支持加权随机与故障转移
 */

import type { Channel } from '../types';
import { ChannelRepository } from '../repositories/channel';
import { RedisService } from './redis';
import { CACHE_TTL } from './redis';

export class ChannelDistributor {
  private channelRepo: ChannelRepository;
  private redis: RedisService;

  constructor(db: D1Database, redis: RedisService) {
    this.channelRepo = new ChannelRepository(db);
    this.redis = redis;
  }

  /**
   * 为指定模型选择最优渠道
   * 策略：优先级 > 权重 > 随机
   */
  async distribute(
    model: string,
    groupName: string = 'default',
    excludeIds: number[] = []
  ): Promise<Channel | null> {
    const cacheKey = `cache:channels:${model}:${groupName}`;

    // 1. 尝试从缓存获取
    let channels = await this.redis.getCache<Channel[]>(cacheKey);

    if (!channels) {
      // 2. 缓存未命中，查询数据库（JOIN channel_abilities）
      channels = await this.channelRepo.findByModel(model, groupName);
      await this.redis.setCache(cacheKey, channels, CACHE_TTL.CHANNELS);
    }

    // 3. 过滤掉故障渠道
    const available = channels.filter((ch) => !excludeIds.includes(ch.id));

    if (available.length === 0) {
      // 所有渠道都被排除（故障），放宽到不排除任何渠道
      if (channels.length > 0 && excludeIds.length > 0) {
        return this.selectByWeight(channels);
      }
      return null;
    }

    return this.selectByWeight(available);
  }

  /**
   * 加权随机选择
   */
  private selectByWeight(channels: Channel[]): Channel {
    if (channels.length === 1) return channels[0];

    const totalWeight = channels.reduce((sum, ch) => sum + Math.max(ch.weight || 1, 1), 0);

    let random = Math.random() * totalWeight;

    for (const channel of channels) {
      random -= Math.max(channel.weight || 1, 1);
      if (random <= 0) {
        return channel;
      }
    }

    // fallback: 返回第一个
    return channels[0];
  }

  /**
   * 记录渠道测试结果，自动处理故障
   */
  async recordResult(
    channelId: number,
    success: boolean,
    responseTime: number
  ): Promise<void> {
    await this.channelRepo.updateById(channelId, {
      test_time: Date.now(),
      response_time: responseTime,
    });

    // 连续失败超过阈值则自动禁用
    if (!success) {
      // 简化为单次失败不自动禁用，避免误杀
      // 生产环境可通过维护失败计数器来实现
    }

    // 清除相关缓存
    await this.redis.deleteByPattern('cache:channels:*');
  }

  /**
   * 带故障转移的请求代理
   * 最多重试 maxRetries 次，每次切换到不同渠道
   */
  async relayWithFallback<T>(
    model: string,
    groupName: string,
    maxRetries: number,
    fn: (channel: Channel) => Promise<T>
  ): Promise<{ result: T; channelId: number } | null> {
    const failedIds: number[] = [];

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const channel = await this.distribute(model, groupName, failedIds);

      if (!channel) {
        break;
      }

      try {
        const startTime = Date.now();
        const result = await fn(channel);
        const elapsed = Date.now() - startTime;

        // 记录成功
        await this.recordResult(channel.id, true, elapsed);

        return { result, channelId: channel.id };
      } catch (err) {
        // 记录失败，排除此渠道
        failedIds.push(channel.id);
        await this.recordResult(channel.id, false, 0);

        if (attempt >= maxRetries) {
          throw err;
        }
      }
    }

    return null;
  }
}
