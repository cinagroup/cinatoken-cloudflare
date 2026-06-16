/**
 * 数据库模型类型定义
 * 对应 D1 数据库表结构
 */

// ==================== 用户模型 ====================

export interface User {
  id: number;
  username: string;
  password_hash: string;
  email: string | null;
  role: number; // 1:普通用户, 10:管理员, 100:超级管理员
  status: number; // 1:正常, 2:禁用
  quota: number; // 总配额
  used_quota: number; // 已用配额
  request_count: number; // 请求次数
  group_name: string; // 用户组
  af_code: string | null; // 邀请码
  aff_count: number; // 邀请人数
  created_at: number; // 创建时间（Unix 时间戳）
  updated_at: number; // 更新时间
}

export interface CreateUserInput {
  username: string;
  password: string;
  email?: string;
  role?: number;
  quota?: number;
  group_name?: string;
}

export interface UpdateUserInput {
  email?: string;
  role?: number;
  status?: number;
  quota?: number;
  group_name?: string;
}

// ==================== 令牌模型 ====================

export interface Token {
  id: number;
  user_id: number;
  key: string; // API Key
  name: string; // 令牌名称
  status: number; // 1:启用, 2:禁用
  created_time: number;
  accessed_time: number | null; // 最后访问时间
  expired_time: number | null; // 过期时间
  remain_quota: number; // 剩余配额（-1 表示无限）
  unlimited_quota: number; // 是否无限配额（0:否, 1:是）
  used_quota: number; // 已用配额
  models: string | null; // 允许的模型列表（JSON）
  subnet: string | null; // 允许的子网
  group_name: string | null; // 用户组
}

export interface CreateTokenInput {
  user_id: number;
  name: string;
  expired_time?: number;
  remain_quota?: number;
  models?: string[];
  subnet?: string;
  group_name?: string;
}

export interface UpdateTokenInput {
  name?: string;
  status?: number;
  expired_time?: number | null;
  remain_quota?: number;
  models?: string[];
  subnet?: string | null;
}

// ==================== 渠道模型 ====================

export interface Channel {
  id: number;
  type: number; // 渠道类型（1:OpenAI, 2:Claude, 3:Gemini, 等）
  key: string; // API Key
  status: number; // 1:启用, 2:禁用
  name: string; // 渠道名称
  weight: number; // 权重（用于负载均衡）
  created_time: number;
  test_time: number | null; // 最后测试时间
  response_time: number | null; // 响应时间（ms）
  balance: number; // 余额
  models: string | null; // 支持的模型列表（JSON）
  group_name: string; // 用户组
  base_url: string | null; // 基础 URL
  other: string | null; // 其他配置（JSON）
  model_mapping: string | null; // 模型映射（JSON）
  priority: number; // 优先级
  auto_balance: number; // 自动余额更新（0:否, 1:是）
  setting: string | null; // 渠道设置（JSON）
}

export interface CreateChannelInput {
  type: number;
  key: string;
  name: string;
  weight?: number;
  models?: string[];
  group_name?: string;
  base_url?: string;
  other?: Record<string, any>;
  model_mapping?: Record<string, string>;
  priority?: number;
  auto_balance?: number;
  setting?: Record<string, any>;
}

export interface UpdateChannelInput {
  type?: number;
  key?: string;
  status?: number;
  name?: string;
  weight?: number;
  models?: string[];
  group_name?: string;
  base_url?: string;
  other?: Record<string, any>;
  model_mapping?: Record<string, string>;
  priority?: number;
  auto_balance?: number;
  setting?: Record<string, any>;
}

// ==================== 日志模型 ====================

export interface Log {
  id: number;
  user_id: number | null;
  token_id: number | null;
  channel_id: number | null;
  token_name: string | null;
  username: string | null;
  type: number; // 1:充值, 2:消费, 3:更新, 4:惩罚
  content: string; // 日志内容（JSON）
  model_name: string | null;
  prompt_tokens: number;
  completion_tokens: number;
  quota: number; // 消耗的配额
  created_at: number;
  channel_name: string | null;
  group_name: string | null;
}

export interface CreateLogInput {
  user_id?: number;
  token_id?: number;
  channel_id?: number;
  token_name?: string;
  username?: string;
  type: number;
  content: Record<string, any>;
  model_name?: string;
  prompt_tokens?: number;
  completion_tokens?: number;
  quota?: number;
  channel_name?: string;
  group_name?: string;
}

// ==================== 兑换码模型 ====================

export interface Redemption {
  id: number;
  name: string;
  key: string; // 兑换码
  status: number; // 1:未使用, 2:已使用, 3:已禁用
  quota: number; // 兑换的配额
  created_time: number;
  redeemed_time: number | null; // 兑换时间
  user_id: number | null; // 兑换用户
}

export interface CreateRedemptionInput {
  name: string;
  quota: number;
  count?: number; // 生成数量
}

export interface UpdateRedemptionInput {
  name?: string;
  status?: number;
  quota?: number;
}

// ==================== 系统配置模型 ====================

export interface Option {
  key: string;
  value: string; // JSON 格式
}

export interface SystemConfig {
  // 基础配置
  server_name: string;
  logo: string;
  footer: string;
  top_up_link: string;
  chat_link: string;
  quota_per_unit: number; // 每单位配额
  display_in_currency: boolean; // 是否以货币形式显示

  // 注册配置
  register_enabled: boolean;
  email_verification: boolean;
  turnstile_check: boolean;
  turnstile_site_key: string;

  // OAuth 配置
  github_oauth: boolean;
  github_client_id: string;
  discord_oauth: boolean;
  discord_client_id: string;
  wechat_oauth: boolean;
  telegram_oauth: boolean;

  // 支付配置
  stripe_enabled: boolean;
  epay_enabled: boolean;
  creem_enabled: boolean;

  // 模型配置
  model_ratio: Record<string, number>;
  group_ratio: Record<string, number>;
}

// ==================== 模型元数据 ====================

export interface ModelMeta {
  id: number;
  model_name: string;
  display_name: string | null;
  description: string | null;
  icon: string | null;
  tags: string | null; // JSON 数组
  created_at: number;
}

export interface CreateModelMetaInput {
  model_name: string;
  display_name?: string;
  description?: string;
  icon?: string;
  tags?: string[];
}

// ==================== 订阅模型 ====================

export interface Subscription {
  id: number;
  user_id: number;
  plan_id: number;
  status: number; // 1:活跃, 2:已取消, 3:已过期
  start_time: number;
  end_time: number;
  created_at: number;
}

export interface SubscriptionPlan {
  id: number;
  name: string;
  description: string | null;
  price: number;
  duration: number; // 时长（天）
  quota: number; // 包含的配额
  status: number; // 1:启用, 2:禁用
  created_at: number;
}

// ==================== 渠道类型枚举 ====================

export enum ChannelType {
  OpenAI = 1,
  Claude = 2,
  Gemini = 3,
  Moonshot = 4,
  DeepSeek = 5,
  Mistral = 6,
  Cohere = 7,
  Ollama = 8,
  Azure = 9,
  Cloudflare = 10,
  Midjourney = 11,
  Suno = 12,
  // ... 更多渠道类型
}

// ==================== 日志类型枚举 ====================

export enum LogType {
  TopUp = 1, // 充值
  Consumption = 2, // 消费
  Update = 3, // 更新
  Penalty = 4, // 惩罚
}
