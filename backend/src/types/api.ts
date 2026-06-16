/**
 * API 请求/响应类型定义
 */

// ==================== 通用响应 ====================

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: ApiError;
  meta?: ResponseMeta;
}

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, any>;
}

export interface ResponseMeta {
  page?: number;
  pageSize?: number;
  total?: number;
  requestId?: string;
}

// ==================== 分页请求 ====================

export interface PaginationQuery {
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

// ==================== 用户相关 ====================

export interface RegisterRequest {
  username: string;
  password: string;
  email?: string;
  invitationCode?: string;
}

export interface LoginRequest {
  username: string;
  password: string;
  twoFactorCode?: string;
}

export interface LoginResponse {
  token: string;
  user: UserResponse;
}

export interface UserResponse {
  id: number;
  username: string;
  email: string | null;
  role: number;
  status: number;
  quota: number;
  usedQuota: number;
  requestCount: number;
  groupName: string;
  createdAt: number;
}

export interface UpdateUserRequest {
  email?: string;
  password?: string;
  oldPassword?: string;
}

// ==================== 令牌相关 ====================

export interface CreateTokenRequest {
  name: string;
  expiredTime?: number;
  remainQuota?: number;
  models?: string[];
  subnet?: string;
}

export interface UpdateTokenRequest {
  name?: string;
  status?: number;
  expiredTime?: number;
  remainQuota?: number;
  models?: string[];
}

export interface TokenResponse {
  id: number;
  key: string;
  name: string;
  status: number;
  createdTime: number;
  accessedTime: number | null;
  expiredTime: number | null;
  remainQuota: number;
  usedQuota: number;
  models: string[] | null;
  subnet: string | null;
}

// ==================== 渠道相关 ====================

export interface CreateChannelRequest {
  type: number;
  key: string;
  name: string;
  weight?: number;
  models?: string[];
  groupName?: string;
  baseUrl?: string;
  other?: Record<string, any>;
  modelMapping?: Record<string, string>;
  priority?: number;
  autoBalance?: boolean;
  setting?: Record<string, any>;
}

export interface UpdateChannelRequest {
  type?: number;
  key?: string;
  status?: number;
  name?: string;
  weight?: number;
  models?: string[];
  groupName?: string;
  baseUrl?: string;
  other?: Record<string, any>;
  modelMapping?: Record<string, string>;
  priority?: number;
  autoBalance?: boolean;
  setting?: Record<string, any>;
}

export interface ChannelResponse {
  id: number;
  type: number;
  name: string;
  status: number;
  weight: number;
  createdTime: number;
  testTime: number | null;
  responseTime: number | null;
  balance: number;
  models: string[];
  groupName: string;
  baseUrl: string | null;
  priority: number;
  autoBalance: boolean;
}

export interface ChannelTestResult {
  channelId: number;
  success: boolean;
  responseTime: number;
  error?: string;
  model?: string;
}

// ==================== 兑换码相关 ====================

export interface CreateRedemptionRequest {
  name: string;
  quota: number;
  count?: number;
}

export interface UpdateRedemptionRequest {
  name?: string;
  status?: number;
  quota?: number;
}

export interface RedemptionResponse {
  id: number;
  name: string;
  key: string;
  status: number;
  quota: number;
  createdTime: number;
  redeemedTime: number | null;
  userId: number | null;
}

export interface RedeemRequest {
  code: string;
}

// ==================== 日志相关 ====================

export interface LogQuery extends PaginationQuery {
  userId?: number;
  tokenId?: number;
  channelId?: number;
  type?: number;
  modelName?: string;
  startTime?: number;
  endTime?: number;
}

export interface LogResponse {
  id: number;
  userId: number | null;
  tokenId: number | null;
  channelId: number | null;
  tokenName: string | null;
  username: string | null;
  type: number;
  content: Record<string, any>;
  modelName: string | null;
  promptTokens: number;
  completionTokens: number;
  quota: number;
  createdAt: number;
  channelName: string | null;
}

export interface LogStat {
  date: string;
  requestCount: number;
  totalQuota: number;
  totalTokens: number;
}

// ==================== 系统配置相关 ====================

export interface SystemConfigResponse {
  serverName: string;
  logo: string;
  footer: string;
  topUpLink: string;
  chatLink: string;
  registerEnabled: boolean;
  emailVerification: boolean;
  githubOAuth: boolean;
  discordOAuth: boolean;
  wechatOAuth: boolean;
  telegramOAuth: boolean;
}

export interface UpdateSystemConfigRequest {
  [key: string]: any;
}

// ==================== 模型相关 ====================

export interface ModelResponse {
  id: string;
  object: 'model';
  created: number;
  ownedBy: string;
}

export interface ModelListResponse {
  object: 'list';
  data: ModelResponse[];
}

// ==================== OpenAI 兼容 API ====================

export interface ChatCompletionRequest {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  top_p?: number;
  n?: number;
  stream?: boolean;
  stop?: string | string[];
  max_tokens?: number;
  presence_penalty?: number;
  frequency_penalty?: number;
  user?: string;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'function';
  content: string;
  name?: string;
  function_call?: any;
}

export interface ChatCompletionResponse {
  id: string;
  object: 'chat.completion';
  created: number;
  model: string;
  choices: ChatCompletionChoice[];
  usage: UsageInfo;
}

export interface ChatCompletionChoice {
  index: number;
  message: ChatMessage;
  finish_reason: 'stop' | 'length' | 'function_call' | null;
}

export interface ChatCompletionStreamResponse {
  id: string;
  object: 'chat.completion.chunk';
  created: number;
  model: string;
  choices: ChatCompletionStreamChoice[];
}

export interface ChatCompletionStreamChoice {
  index: number;
  delta: Partial<ChatMessage>;
  finish_reason: 'stop' | 'length' | 'function_call' | null;
}

export interface UsageInfo {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

// ==================== Embedding API ====================

export interface EmbeddingRequest {
  model: string;
  input: string | string[];
  user?: string;
}

export interface EmbeddingResponse {
  object: 'list';
  data: EmbeddingData[];
  model: string;
  usage: UsageInfo;
}

export interface EmbeddingData {
  object: 'embedding';
  index: number;
  embedding: number[];
}

// ==================== Image API ====================

export interface ImageGenerationRequest {
  model: string;
  prompt: string;
  n?: number;
  size?: string;
  quality?: string;
  response_format?: 'url' | 'b64_json';
  user?: string;
}

export interface ImageGenerationResponse {
  created: number;
  data: ImageData[];
}

export interface ImageData {
  url?: string;
  b64_json?: string;
  revised_prompt?: string;
}

// ==================== Audio API ====================

export interface AudioTranscriptionRequest {
  model: string;
  file: File;
  language?: string;
  prompt?: string;
  response_format?: string;
  temperature?: number;
}

export interface AudioSpeechRequest {
  model: string;
  input: string;
  voice: string;
  response_format?: string;
  speed?: number;
}

// ==================== 错误类型 ====================

export class ApiErrorClass extends Error {
  constructor(
    public code: string,
    message: string,
    public statusCode: number = 400,
    public details?: Record<string, any>
  ) {
    super(message);
    this.name = 'ApiError';
  }

  toResponse(): ApiResponse {
    return {
      success: false,
      error: {
        code: this.code,
        message: this.message,
        details: this.details,
      },
    };
  }
}

// ==================== 常见错误码 ====================

export const ErrorCodes = {
  // 认证错误 (401)
  UNAUTHORIZED: 'UNAUTHORIZED',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  TOKEN_INVALID: 'TOKEN_INVALID',

  // 权限错误 (403)
  FORBIDDEN: 'FORBIDDEN',
  ADMIN_REQUIRED: 'ADMIN_REQUIRED',
  ROOT_REQUIRED: 'ROOT_REQUIRED',

  // 资源错误 (404)
  NOT_FOUND: 'NOT_FOUND',
  USER_NOT_FOUND: 'USER_NOT_FOUND',
  TOKEN_NOT_FOUND: 'TOKEN_NOT_FOUND',
  CHANNEL_NOT_FOUND: 'CHANNEL_NOT_FOUND',

  // 验证错误 (400)
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  INVALID_INPUT: 'INVALID_INPUT',
  USERNAME_EXISTS: 'USERNAME_EXISTS',
  EMAIL_EXISTS: 'EMAIL_EXISTS',

  // 限流错误 (429)
  RATE_LIMITED: 'RATE_LIMITED',
  QUOTA_EXCEEDED: 'QUOTA_EXCEEDED',

  // 服务器错误 (500)
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  DATABASE_ERROR: 'DATABASE_ERROR',
  UPSTREAM_ERROR: 'UPSTREAM_ERROR',
} as const;
