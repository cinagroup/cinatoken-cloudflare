/**
 * AI 代理路由（/v1/*）
 * 核心流程：TokenAuth → ChannelDistribute → Relay → RecordUsage
 */

import { Hono } from 'hono';
import type { Env, HonoVariables } from '../types';
import { tokenAuth } from '../middleware/auth';
import { createServices, ChannelDistributor, RedisService } from '../services';
import {
  relayOpenAIChat,
  relayOpenAIImage,
  relayOpenAIEmbedding,
  relayOpenAIAudio,
  relayClaudeMessages,
  relayGemini,
  createStreamResponse,
  extractOpenAIUsage,
  extractClaudeUsage,
  calculateQuota,
} from '../relay';

export const relayRoutes = new Hono<{ Bindings: Env; Variables: HonoVariables }>();

// 所有代理路由需要 API Key 认证
relayRoutes.use('*', tokenAuth);

// ==================== OpenAI 兼容 API ====================

/**
 * POST /v1/chat/completions - 聊天完成
 */
relayRoutes.post('/chat/completions', async (c) => {
  const userId = c.get('userId');
  const tokenId = c.get('tokenId');
  const tokenGroupName = c.get('tokenGroupName') || 'default';
  const body = await c.req.json();

  const model = body.model;
  if (!model) {
    return c.json({ error: { message: 'model is required', type: 'invalid_request_error' } }, 400);
  }

  const services = createServices(c.env);
  const redis = new RedisService(c.env);
  const distributor = new ChannelDistributor(c.env.DB, redis);

  const isStream = body.stream === true;

  try {
    // 渠道分配 + 故障转移
    const relayResult = await distributor.relayWithFallback(
      model, tokenGroupName, 2,
      (channel) => relayOpenAIChat(channel, body, isStream)
    );

    if (!relayResult) {
      return c.json({
        error: { message: 'No available channel for this model', type: 'invalid_request_error' },
      }, 404);
    }

    const upstreamResponse = relayResult.result;

    if (isStream) {
      // 流式响应
      return createStreamResponse(upstreamResponse);
    } else {
      // 非流式——解析使用量并记录
      const responseBody: any = await upstreamResponse.json();
      const usage = extractOpenAIUsage(responseBody);

      // 计算配额
      const quota = calculateQuota(model, usage.promptTokens, usage.completionTokens);

      // 异步记录使用量（不阻塞响应）
      c.executionCtx.waitUntil(
        (async () => {
          await services.repos.log.createLog({
            user_id: userId,
            token_id: tokenId,
            channel_id: relayResult.channelId,
            username: '', token_name: '', channel_name: '',
            type: 2, // 消费
            content: JSON.stringify({ model, usage }),
            model_name: model,
            prompt_tokens: usage.promptTokens,
            completion_tokens: usage.completionTokens,
            quota,
          });

          // 扣减配额
          await services.repos.token.increaseUsedQuota(tokenId, quota);
          await services.repos.user.increaseUsedQuota(userId, quota);
          await services.repos.channel.increaseUsedQuota(relayResult.channelId, quota);

          // 清除令牌缓存
          const tokenKey = c.get('tokenKey');
          if (tokenKey) await redis.delete(`cache:token:${tokenKey}`);
        })()
      );

      return c.json(responseBody, upstreamResponse.status as any);
    }
  } catch (err: any) {
    return c.json({
      error: {
        message: err.message || 'Upstream request failed',
        type: 'upstream_error',
      },
    }, 502);
  }
});

/**
 * POST /v1/completions - 文本完成
 */
relayRoutes.post('/completions', async (c) => {
  // 复用 chat/completions 的逻辑
  const body = await c.req.json();
  // 转换为 chat 格式
  body.messages = [{ role: 'user', content: body.prompt || '' }];
  return relayRoutes.fetch(c.req.raw, c.env, c.executionCtx);
});

/**
 * POST /v1/embeddings - 嵌入
 */
relayRoutes.post('/embeddings', async (c) => {
  const body = await c.req.json();
  const model = body.model || 'text-embedding-ada-002';
  const tokenGroupName = c.get('tokenGroupName') || 'default';

  const services = createServices(c.env);
  const redis = new RedisService(c.env);
  const distributor = new ChannelDistributor(c.env.DB, redis);

  try {
    const relayResult = await distributor.relayWithFallback(
      model, tokenGroupName, 1,
      (channel) => relayOpenAIEmbedding(channel, body)
    );

    if (!relayResult) {
      return c.json({ error: { message: 'No available channel', type: 'invalid_request_error' } }, 404);
    }

    const responseBody: any = await relayResult.result.json();
    const usage = extractOpenAIUsage(responseBody);
    const quota = calculateQuota(model, usage.promptTokens, 0);

    c.executionCtx.waitUntil(
      services.repos.log.createLog({
        user_id: c.get('userId'), token_id: c.get('tokenId'),
        channel_id: relayResult.channelId,
        username: '', token_name: '', channel_name: '',
        type: 2, content: JSON.stringify({ model, usage }),
        model_name: model, prompt_tokens: usage.promptTokens, quota,
      })
    );

    return c.json(responseBody);
  } catch (err: any) {
    return c.json({ error: { message: err.message, type: 'upstream_error' } }, 502);
  }
});

/**
 * POST /v1/images/generations - 图片生成
 */
relayRoutes.post('/images/generations', async (c) => {
  const body = await c.req.json();
  const model = body.model || 'dall-e-3';
  const tokenGroupName = c.get('tokenGroupName') || 'default';

  const redis = new RedisService(c.env);
  const distributor = new ChannelDistributor(c.env.DB, redis);

  try {
    const relayResult = await distributor.relayWithFallback(
      model, tokenGroupName, 1,
      (channel) => relayOpenAIImage(channel, body)
    );

    if (!relayResult) {
      return c.json({ error: { message: 'No available channel', type: 'invalid_request_error' } }, 404);
    }

    const responseBody = await relayResult.result.json();

    // 图片生成配额固定消耗
    const quota = 100;
    c.executionCtx.waitUntil(
      createServices(c.env).repos.log.createLog({
        user_id: c.get('userId'), token_id: c.get('tokenId'),
        channel_id: relayResult.channelId,
        username: '', token_name: '', channel_name: '',
        type: 2, content: JSON.stringify({ model, type: 'image' }),
        model_name: model, quota,
      })
    );

    return c.json(responseBody);
  } catch (err: any) {
    return c.json({ error: { message: err.message, type: 'upstream_error' } }, 502);
  }
});

/**
 * POST /v1/audio/transcriptions - 语音转文字
 * POST /v1/audio/speech - 文字转语音
 */
relayRoutes.post('/audio/:endpoint', async (c) => {
  const endpoint = c.req.param('endpoint');
  const body = await c.req.json();
  const model = body.model || 'whisper-1';
  const tokenGroupName = c.get('tokenGroupName') || 'default';

  const redis = new RedisService(c.env);
  const distributor = new ChannelDistributor(c.env.DB, redis);

  try {
    const relayResult = await distributor.relayWithFallback(
      model, tokenGroupName, 1,
      (channel) => relayOpenAIAudio(channel, body, endpoint)
    );

    if (!relayResult) {
      return c.json({ error: { message: 'No available channel', type: 'invalid_request_error' } }, 404);
    }

    const responseBody = await relayResult.result.json();
    return c.json(responseBody);
  } catch (err: any) {
    return c.json({ error: { message: err.message, type: 'upstream_error' } }, 502);
  }
});

// ==================== Claude API ====================

/**
 * POST /v1/messages - Claude Messages
 */
relayRoutes.post('/messages', async (c) => {
  const body = await c.req.json();
  const model = body.model;
  const userId = c.get('userId');
  const tokenId = c.get('tokenId');
  const tokenGroupName = c.get('tokenGroupName') || 'default';

  if (!model) {
    return c.json({ error: { message: 'model is required', type: 'invalid_request_error' } }, 400);
  }

  const services = createServices(c.env);
  const redis = new RedisService(c.env);
  const distributor = new ChannelDistributor(c.env.DB, redis);

  const isStream = body.stream === true;

  try {
    const relayResult = await distributor.relayWithFallback(
      model, tokenGroupName, 2,
      (channel) => relayClaudeMessages(channel, body, isStream)
    );

    if (!relayResult) {
      return c.json({ error: { message: 'No available channel', type: 'invalid_request_error' } }, 404);
    }

    const upstreamResponse = relayResult.result;

    if (isStream) {
      return createStreamResponse(upstreamResponse);
    } else {
      const responseBody: any = await upstreamResponse.json();
      const usage = extractClaudeUsage(responseBody);
      const quota = calculateQuota(model, usage.promptTokens, usage.completionTokens);

      c.executionCtx.waitUntil(
        (async () => {
          await services.repos.log.createLog({
            user_id: userId, token_id: tokenId,
            channel_id: relayResult.channelId,
            username: '', token_name: '', channel_name: '',
            type: 2, content: JSON.stringify({ model, usage }),
            model_name: model, prompt_tokens: usage.promptTokens,
            completion_tokens: usage.completionTokens, quota,
          });

          await services.repos.token.increaseUsedQuota(tokenId, quota);
          await services.repos.user.increaseUsedQuota(userId, quota);

          const tokenKey = c.get('tokenKey');
          if (tokenKey) await redis.delete(`cache:token:${tokenKey}`);
        })()
      );

      return c.json(responseBody, upstreamResponse.status as any);
    }
  } catch (err: any) {
    return c.json({ error: { message: err.message, type: 'upstream_error' } }, 502);
  }
});

// ==================== Gemini API ====================

/**
 * POST /v1beta/models/:model - Gemini 请求
 */
relayRoutes.post('/:path{models/.*}', async (c) => {
  const body = await c.req.json();
  const model = body.model || c.req.path.split('/').pop()?.split(':')[0] || '';
  const userId = c.get('userId');
  const tokenId = c.get('tokenId');
  const tokenGroupName = c.get('tokenGroupName') || 'default';

  const services = createServices(c.env);
  const redis = new RedisService(c.env);
  const distributor = new ChannelDistributor(c.env.DB, redis);

  try {
    const relayResult = await distributor.relayWithFallback(
      model, tokenGroupName, 1,
      (channel) => relayGemini(channel, body)
    );

    if (!relayResult) {
      return c.json({ error: { message: 'No available channel', type: 'invalid_request_error' } }, 404);
    }

    const responseBody: any = await relayResult.result.json();

    c.executionCtx.waitUntil(
      services.repos.log.createLog({
        user_id: userId, token_id: tokenId,
        channel_id: relayResult.channelId,
        username: '', token_name: '', channel_name: '',
        type: 2, content: JSON.stringify({ model, type: 'gemini' }),
        model_name: model, quota: 1,
      })
    );

    return c.json(responseBody);
  } catch (err: any) {
    return c.json({ error: { message: err.message, type: 'upstream_error' } }, 502);
  }
});

// ==================== Midjourney API ====================

/** Generic Midjourney submit handler */
async function relayMidjourney(c: any, action: string) {
  const body = await c.req.json();
  const model = 'midjourney';
  const userId = c.get('userId');
  const tokenId = c.get('tokenId');
  const tokenGroupName = c.get('tokenGroupName') || 'default';

  const services = createServices(c.env);
  const redis = new RedisService(c.env);
  const distributor = new ChannelDistributor(c.env.DB, redis);

  try {
    const relayResult = await distributor.relayWithFallback(
      model, tokenGroupName, 1,
      (channel) => {
        const baseUrl = channel.base_url || 'https://api.midjourney.com';
        return fetch(`${baseUrl}/mj/submit/${action}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${channel.key}` },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(120000),
        });
      }
    );

    if (!relayResult) {
      return c.json({ error: { message: 'No available channel', type: 'invalid_request_error' } }, 404);
    }

    const responseBody = await relayResult.result.json();

    c.executionCtx.waitUntil(
      services.repos.log.createLog({
        user_id: userId, token_id: tokenId,
        channel_id: relayResult.channelId,
        username: '', token_name: '', channel_name: '',
        type: 2, content: JSON.stringify({ model, action }),
        model_name: model, quota: 10,
      })
    );

    return c.json(responseBody);
  } catch (err: any) {
    return c.json({ error: { message: err.message, type: 'upstream_error' } }, 502);
  }
}

// Midjourney routes
relayRoutes.post('/mj/submit/imagine', (c) => relayMidjourney(c, 'imagine'));
relayRoutes.post('/mj/submit/change', (c) => relayMidjourney(c, 'change'));
relayRoutes.post('/mj/submit/describe', (c) => relayMidjourney(c, 'describe'));
relayRoutes.post('/mj/submit/blend', (c) => relayMidjourney(c, 'blend'));
relayRoutes.post('/mj/submit/shorten', (c) => relayMidjourney(c, 'shorten'));
relayRoutes.post('/mj/submit/action', (c) => relayMidjourney(c, c.req.query('action') || 'imagine'));

relayRoutes.get('/mj/task/:id/fetch', async (c) => {
  const taskId = c.req.param('id');
  const redis = new RedisService(c.env);
  const distributor = new ChannelDistributor(c.env.DB, redis);

  try {
    const relayResult = await distributor.relayWithFallback(
      'midjourney', c.get('tokenGroupName') || 'default', 1,
      (channel) => {
        const baseUrl = channel.base_url || 'https://api.midjourney.com';
        return fetch(`${baseUrl}/mj/task/${taskId}/fetch`, {
          headers: { 'Authorization': `Bearer ${channel.key}` },
          signal: AbortSignal.timeout(15000),
        });
      }
    );

    if (!relayResult) {
      return c.json({ error: { message: 'No available channel', type: 'invalid_request_error' } }, 404);
    }

    return c.json(await relayResult.result.json());
  } catch (err: any) {
    return c.json({ error: { message: err.message, type: 'upstream_error' } }, 502);
  }
});

// ==================== Suno API ====================

relayRoutes.post('/suno/submit/:action', async (c) => {
  const action = c.req.param('action');
  const body = await c.req.json();
  const model = 'suno';
  const services = createServices(c.env);
  const redis = new RedisService(c.env);
  const distributor = new ChannelDistributor(c.env.DB, redis);

  try {
    const relayResult = await distributor.relayWithFallback(
      model, c.get('tokenGroupName') || 'default', 1,
      (channel) => {
        const baseUrl = channel.base_url || 'https://api.suno.ai';
        return fetch(`${baseUrl}/suno/submit/${action}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${channel.key}` },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(120000),
        });
      }
    );

    if (!relayResult) {
      return c.json({ error: { message: 'No available channel', type: 'invalid_request_error' } }, 404);
    }

    const responseBody = await relayResult.result.json();

    c.executionCtx.waitUntil(
      services.repos.log.createLog({
        user_id: c.get('userId'), token_id: c.get('tokenId'),
        channel_id: relayResult.channelId,
        username: '', token_name: '', channel_name: '',
        type: 2, content: JSON.stringify({ model, action }),
        model_name: model, quota: 10,
      })
    );

    return c.json(responseBody);
  } catch (err: any) {
    return c.json({ error: { message: err.message, type: 'upstream_error' } }, 502);
  }
});

relayRoutes.post('/suno/fetch', async (c) => {
  const body = await c.req.json();
  const redis = new RedisService(c.env);
  const distributor = new ChannelDistributor(c.env.DB, redis);

  try {
    const relayResult = await distributor.relayWithFallback(
      'suno', c.get('tokenGroupName') || 'default', 1,
      (channel) => {
        const baseUrl = channel.base_url || 'https://api.suno.ai';
        return fetch(`${baseUrl}/suno/fetch`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${channel.key}` },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(15000),
        });
      }
    );

    if (!relayResult) {
      return c.json({ error: { message: 'No available channel', type: 'invalid_request_error' } }, 404);
    }

    return c.json(await relayResult.result.json());
  } catch (err: any) {
    return c.json({ error: { message: err.message, type: 'upstream_error' } }, 502);
  }
});

// ==================== 模型列表 ====================

/**
 * GET /v1/models - 可用模型列表（OpenAI 格式）
 */
relayRoutes.get('/models', async (c) => {
  const services = createServices(c.env);
  const models = await services.channel.getAllModels();

  const data = models.map((name) => ({
    id: name,
    object: 'model',
    created: Math.floor(Date.now() / 1000),
    owned_by: 'cinatoken',
  }));

  return c.json({ object: 'list', data });
});
