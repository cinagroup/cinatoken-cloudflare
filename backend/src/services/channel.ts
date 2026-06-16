/**
 * ChannelService - 渠道业务逻辑层
 */

import type { Channel, CreateChannelInput, UpdateChannelInput } from '../types';
import type { Repositories } from '../repositories';
import { RedisService } from './redis';

interface ChannelTestResult {
  channelId: number;
  name: string;
  type: number;
  success: boolean;
  responseTime: number;
  error?: string;
  balance?: number;
}

interface ChannelBalanceResult {
  channelId: number;
  name: string;
  balance: number;
  error?: string;
}

export class ChannelService {
  private repos: Repositories;

  constructor(
    repos: Repositories,
    private redis: RedisService
  ) {
    this.repos = repos;
  }

  /** 创建渠道 */
  async create(input: CreateChannelInput): Promise<Channel> {
    const now = Date.now();
    const id = await this.repos.channel.insert({
      type: input.type,
      key: input.key,
      status: 1,
      name: input.name,
      weight: input.weight ?? 0,
      created_time: now,
      balance: 0,
      models: input.models ? JSON.stringify(input.models) : null,
      group_name: input.group_name ?? 'default',
      base_url: input.base_url ?? null,
      other: input.other ? JSON.stringify(input.other) : null,
      model_mapping: input.model_mapping ? JSON.stringify(input.model_mapping) : null,
      priority: input.priority ?? 0,
      auto_balance: input.auto_balance ?? 1,
      setting: input.setting ? JSON.stringify(input.setting) : null,
      tag: null as any,
      used_quota: 0,
    });

    // 同步模型能力
    if (input.models && input.models.length > 0) {
      await this.repos.channel.syncAbilities(id, input.models);
    }

    const channel = await this.repos.channel.findById(id);
    if (!channel) throw new Error('Failed to create channel');
    return channel;
  }

  /** 列出渠道（分页） */
  async list(
    page: number = 1,
    pageSize: number = 20,
    status?: number
  ): Promise<{ items: Channel[]; total: number }> {
    const where: any = {};
    if (status !== undefined) where.status = status;
    return this.repos.channel.paginate(page, pageSize, Object.keys(where).length ? where : undefined, 'created_time');
  }

  /** 搜索渠道 */
  async search(keyword: string, page: number = 1, pageSize: number = 20): Promise<{ items: Channel[]; total: number }> {
    const offset = (page - 1) * pageSize;
    const pattern = `%${keyword}%`;

    const countRet = await this.repos.channel.raw<{ total: number }>(
      'SELECT COUNT(*) as total FROM channels WHERE name LIKE ?', pattern
    );
    const items = await this.repos.channel.raw<Channel>(
      'SELECT * FROM channels WHERE name LIKE ? ORDER BY created_time DESC LIMIT ? OFFSET ?',
      pattern, pageSize, offset
    );
    return { items, total: countRet[0]?.total ?? 0 };
  }

  /** 获取渠道详情 */
  async getById(id: number): Promise<Channel | null> {
    return this.repos.channel.findById(id);
  }

  /** 更新渠道 */
  async update(id: number, input: UpdateChannelInput): Promise<Channel | null> {
    const existing = await this.repos.channel.findById(id);
    if (!existing) return null;

    const updates: Record<string, any> = {};

    if (input.type !== undefined) updates.type = input.type;
    if (input.key !== undefined) updates.key = input.key;
    if (input.status !== undefined) updates.status = input.status;
    if (input.name !== undefined) updates.name = input.name;
    if (input.weight !== undefined) updates.weight = input.weight;
    if (input.models !== undefined) {
      updates.models = JSON.stringify(input.models);
      // 重新同步模型能力
      await this.repos.channel.syncAbilities(id, input.models);
    }
    if (input.group_name !== undefined) updates.group_name = input.group_name;
    if (input.base_url !== undefined) updates.base_url = input.base_url;
    if (input.other !== undefined) updates.other = JSON.stringify(input.other);
    if (input.model_mapping !== undefined) updates.model_mapping = JSON.stringify(input.model_mapping);
    if (input.priority !== undefined) updates.priority = input.priority;
    if (input.auto_balance !== undefined) updates.auto_balance = input.auto_balance;
    if (input.setting !== undefined) updates.setting = JSON.stringify(input.setting);

    await this.repos.channel.updateById(id, updates);

    // 清除模型缓存
    await this.redis.delete('cache:models:list');

    return this.repos.channel.findById(id);
  }

  /** 删除渠道 */
  async delete(id: number): Promise<boolean> {
    const channel = await this.repos.channel.findById(id);
    if (!channel) return false;

    await this.repos.channel.deleteById(id);
    await this.redis.delete('cache:models:list');

    return true;
  }

  /** 批量删除 */
  async batchDelete(ids: number[]): Promise<number> {
    let count = 0;
    for (const id of ids) {
      if (await this.delete(id)) count++;
    }
    return count;
  }

  /** 删除所有已禁用渠道 */
  async deleteDisabled(): Promise<number> {
    return this.repos.channel.deleteDisabled();
  }

  /** 测试单个渠道 */
  async testChannel(id: number): Promise<ChannelTestResult> {
    const channel = await this.repos.channel.findById(id);
    if (!channel) {
      return { channelId: id, name: '', type: 0, success: false, responseTime: 0, error: 'Channel not found' };
    }

    const baseUrl = channel.base_url || getDefaultBaseUrl(channel.type);
    const model = channel.models ? JSON.parse(channel.models)[0] || 'gpt-3.5-turbo' : 'gpt-3.5-turbo';

    const startTime = Date.now();
    try {
      const response = await fetch(`${baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${channel.key}`,
        },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: 'Hi' }],
          max_tokens: 1,
        }),
        signal: AbortSignal.timeout(10000),
      });

      const responseTime = Date.now() - startTime;
      const success = response.ok;

      await this.repos.channel.updateById(id, {
        test_time: Date.now(),
        response_time: responseTime,
        status: success ? 1 : 1, // 不影响现有状态
      });

      return {
        channelId: id,
        name: channel.name,
        type: channel.type,
        success,
        responseTime,
        error: success ? undefined : `HTTP ${response.status}`,
      };
    } catch (err) {
      const responseTime = Date.now() - startTime;
      await this.repos.channel.updateById(id, {
        test_time: Date.now(),
        response_time: responseTime,
      });
      return {
        channelId: id,
        name: channel.name,
        type: channel.type,
        success: false,
        responseTime,
        error: err instanceof Error ? err.message : 'Unknown error',
      };
    }
  }

  /** 测试所有启用的渠道 */
  async testAllChannels(): Promise<ChannelTestResult[]> {
    const channels = await this.repos.channel.findEnabled();
    const results: ChannelTestResult[] = [];
    for (const ch of channels) {
      results.push(await this.testChannel(ch.id));
    }
    return results;
  }

  /** 更新单个渠道余额 */
  async updateBalance(id: number): Promise<ChannelBalanceResult> {
    const channel = await this.repos.channel.findById(id);
    if (!channel) {
      return { channelId: id, name: '', balance: 0, error: 'Not found' };
    }

    // 余额查询需要根据渠道类型调用不同 API
    // 这里先返回当前余额作为占位
    return { channelId: id, name: channel.name, balance: channel.balance || 0 };
  }

  /** 更新所有启用渠道的余额 */
  async updateAllBalances(): Promise<ChannelBalanceResult[]> {
    const channels = await this.repos.channel.findEnabled();
    const results: ChannelBalanceResult[] = [];
    for (const ch of channels) {
      results.push(await this.updateBalance(ch.id));
    }
    return results;
  }

  /** 复制渠道 */
  async copy(sourceId: number): Promise<Channel | null> {
    const source = await this.repos.channel.findById(sourceId);
    if (!source) return null;

    const newChannel: CreateChannelInput = {
      type: source.type,
      key: source.key,
      name: `${source.name} (Copy)`,
      weight: source.weight,
      models: source.models ? JSON.parse(source.models) : undefined,
      group_name: source.group_name,
      base_url: source.base_url || undefined,
      other: source.other ? JSON.parse(source.other) : undefined,
      model_mapping: source.model_mapping ? JSON.parse(source.model_mapping) : undefined,
      priority: source.priority,
      auto_balance: source.auto_balance,
      setting: source.setting ? JSON.parse(source.setting) : undefined,
    };

    return this.create(newChannel);
  }

  /** 批量设置标签 */
  async batchSetTag(channelIds: number[], tag: string): Promise<number> {
    let count = 0;
    for (const id of channelIds) {
      await this.repos.channel.updateById(id, { tag: tag || null });
      count++;
    }
    return count;
  }

  /** 标签管理 */
  async updateStatusByTag(tag: string, status: number): Promise<void> {
    await this.repos.channel.updateStatusByTag(tag, status);
  }

  /** 获取所有可用模型 */
  async getAllModels(): Promise<string[]> {
    const cached = await this.redis.getCache<string[]>('cache:models:list');
    if (cached) return cached;

    const models = await this.repos.channel.getAllModels();
    await this.redis.setCache('cache:models:list', models, 300);
    return models;
  }
}

/** 默认 Base URL 映射 */
function getDefaultBaseUrl(type: number): string {
  const map: Record<number, string> = {
    1: 'https://api.openai.com',
    2: 'https://api.anthropic.com',
    3: 'https://generativelanguage.googleapis.com',
    4: 'https://api.moonshot.cn',
    5: 'https://api.deepseek.com',
    6: 'https://api.mistral.ai',
    7: 'https://api.cohere.ai',
    8: 'http://localhost:11434', // Ollama
    9: '', // Azure - 需要自定义
    10: '', // Cloudflare - 需要自定义
    11: 'https://api.midjourney.com',
    12: 'https://api.suno.ai',
  };
  return map[type] || 'https://api.openai.com';
}
