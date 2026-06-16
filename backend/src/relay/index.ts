/**
 * AI 代理实现
 * 将请求转发到上游 AI 提供商
 */

import type { Channel } from '../types';

/** 默认 Base URL 映射 */
function getDefaultBaseUrl(type: number): string {
  const map: Record<number, string> = {
    1: 'https://api.openai.com',
    2: 'https://api.anthropic.com',
    3: 'https://generativelanguage.googleapis.com',
    5: 'https://api.deepseek.com',
    4: 'https://api.moonshot.cn',
    6: 'https://api.mistral.ai',
    7: 'https://api.cohere.ai',
  };
  return map[type] || 'https://api.openai.com';
}

/** 构建请求头 */
function buildHeaders(channel: Channel, extraHeaders: Record<string, string> = {}): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${channel.key}`,
    ...extraHeaders,
  };
}

/** 解析渠道配置 */
function parseChannelConfig(channel: Channel): {
  baseUrl: string;
  modelMapping: Record<string, string>;
} {
  const baseUrl = channel.base_url || getDefaultBaseUrl(channel.type);
  let modelMapping: Record<string, string> = {};

  if (channel.model_mapping) {
    try { modelMapping = JSON.parse(channel.model_mapping); } catch { /* ignore */ }
  }

  return { baseUrl, modelMapping };
}

// ==================== OpenAI 代理 ====================

export interface OpenAIResponse {
  status: number;
  body: any;
  headers: Record<string, string>;
  stream?: ReadableStream<Uint8Array>;
}

/**
 * 代理 OpenAI Chat Completion 请求
 */
export async function relayOpenAIChat(
  channel: Channel,
  body: any,
  stream: boolean = false
): Promise<Response> {
  const { baseUrl, modelMapping } = parseChannelConfig(channel);

  // 应用模型映射
  const mappedModel = modelMapping[body.model] || body.model;

  const requestBody = {
    ...body,
    model: mappedModel,
    stream,
  };

  const response = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: buildHeaders(channel),
    body: JSON.stringify(requestBody),
    signal: AbortSignal.timeout(15000),
  });

  return response;
}

/**
 * 代理 OpenAI Image Generation 请求
 */
export async function relayOpenAIImage(
  channel: Channel,
  body: any
): Promise<Response> {
  const { baseUrl } = parseChannelConfig(channel);

  const response = await fetch(`${baseUrl}/v1/images/generations`, {
    method: 'POST',
    headers: buildHeaders(channel),
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(180000),
  });

  return response;
}

/**
 * 代理 OpenAI Embedding 请求
 */
export async function relayOpenAIEmbedding(
  channel: Channel,
  body: any
): Promise<Response> {
  const { baseUrl } = parseChannelConfig(channel);

  const response = await fetch(`${baseUrl}/v1/embeddings`, {
    method: 'POST',
    headers: buildHeaders(channel),
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60000),
  });

  return response;
}

/**
 * 代理 OpenAI Audio 请求
 */
export async function relayOpenAIAudio(
  channel: Channel,
  body: any,
  endpoint: string
): Promise<Response> {
  const { baseUrl } = parseChannelConfig(channel);

  const response = await fetch(`${baseUrl}/v1/audio/${endpoint}`, {
    method: 'POST',
    headers: buildHeaders(channel),
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });

  return response;
}

// ==================== Claude 代理 ====================

/**
 * 代理 Claude Messages 请求
 */
export async function relayClaudeMessages(
  channel: Channel,
  body: any,
  stream: boolean = false
): Promise<Response> {
  const { baseUrl, modelMapping } = parseChannelConfig(channel);
  const mappedModel = modelMapping[body.model] || body.model;

  const requestBody = {
    ...body,
    model: mappedModel,
    stream,
  };

  const response = await fetch(`${baseUrl}/v1/messages`, {
    method: 'POST',
    headers: buildHeaders(channel, {
      'anthropic-version': '2023-06-01',
    }),
    body: JSON.stringify(requestBody),
    signal: AbortSignal.timeout(15000),
  });

  return response;
}

// ==================== Gemini 代理 ====================

/**
 * 代理 Gemini 请求
 */
export async function relayGemini(
  channel: Channel,
  body: any,
  action: string = 'generateContent'
): Promise<Response> {
  const { baseUrl, modelMapping } = parseChannelConfig(channel);
  const mappedModel = modelMapping[body.model] || body.model;

  // Gemini API Key 通过 query string 传递
  const apiKey = channel.key;
  const url = `${baseUrl}/v1beta/models/${mappedModel}:${action}?key=${apiKey}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });

  return response;
}

// ==================== 流式响应处理 ====================

/**
 * 创建 SSE 流式响应
 * 直接将上游流式响应透传给客户端
 */
export function createStreamResponse(upstreamResponse: Response): Response {
  return new Response(upstreamResponse.body, {
    status: upstreamResponse.status,
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}

// ==================== 使用量记录工具 ====================

/**
 * 从 OpenAI 格式响应中提取使用量
 */
export function extractOpenAIUsage(body: any): {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
} {
  const usage = body?.usage || {};
  return {
    promptTokens: usage.prompt_tokens || 0,
    completionTokens: usage.completion_tokens || 0,
    totalTokens: usage.total_tokens || 0,
  };
}

/**
 * 从 Claude 格式响应中提取使用量
 */
export function extractClaudeUsage(body: any): {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
} {
  const usage = body?.usage || {};
  return {
    promptTokens: usage.input_tokens || 0,
    completionTokens: usage.output_tokens || 0,
    totalTokens: (usage.input_tokens || 0) + (usage.output_tokens || 0),
  };
}

/** 模型倍率表（简化版，实际从 options 表读取） */
const MODEL_RATIOS: Record<string, number> = {
  'gpt-4o': 15,
  'gpt-4o-mini': 1,
  'gpt-4': 30,
  'gpt-4-turbo': 10,
  'gpt-3.5-turbo': 0.5,
  'claude-sonnet-4-20250514': 15,
  'claude-3-opus': 75,
  'claude-3-haiku': 0.25,
  'deepseek-chat': 1,
  'deepseek-reasoner': 4,
  'gemini-2.5-pro': 5,
  'gemini-2.5-flash': 0.3,
};

/**
 * 计算消耗的配额
 */
export function calculateQuota(
  model: string,
  promptTokens: number,
  completionTokens: number
): number {
  const ratio = MODEL_RATIOS[model] || 1;

  // 配额 = (总 Token / 1000) * 模型倍率
  const totalTokens = promptTokens + completionTokens;
  const quotaUnits = totalTokens / 1000;

  // 最小消耗 1 配额
  return Math.max(1, Math.ceil(quotaUnits * ratio));
}
