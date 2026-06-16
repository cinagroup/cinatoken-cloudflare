/**
 * Cloudflare Workers 环境绑定类型
 * 对应 wrangler.toml 中的绑定配置
 */

export interface Env {
  APP_KV: KVNamespace;
  DB: D1Database;
  R2_BUCKET: R2Bucket;
  HYPERDRIVE?: Hyperdrive;
  ENVIRONMENT: 'dev' | 'production';
  APP_NAME: string;
  LOG_LEVEL: 'debug' | 'info' | 'warn' | 'error';
  JWT_SECRET: string;
  UPSTASH_REDIS_REST_URL: string;
  UPSTASH_REDIS_REST_TOKEN: string;
  ENCRYPTION_KEY: string;
}

export interface Hyperdrive {
  readonly connectionString: string;
  connect(): Promise<any>;
}

/**
 * Hono 上下文变量（扁平结构，每个字段独立存取）
 */
export interface HonoVariables {
  userId: number;
  userRole: number;
  tokenId: number;
  tokenKey: string;
  tokenModels: string[] | null;
  tokenGroupName: string;
  requestId: string;
  startTime: number;
}
