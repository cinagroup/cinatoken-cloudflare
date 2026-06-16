/**
 * JWT 工具函数
 * 使用 Web Crypto API 实现 HMAC-SHA256 签名
 */

// JWT Header 固定为 HS256
const JWT_HEADER = {
  alg: 'HS256',
  typ: 'JWT',
};

/**
 * Base64URL 编码
 */
function base64UrlEncode(data: string | Uint8Array): string {
  let str: string;
  if (typeof data === 'string') {
    str = btoa(data);
  } else {
    str = btoa(String.fromCharCode(...data));
  }
  return str.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

/**
 * Base64URL 解码
 */
function base64UrlDecode(str: string): string {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) {
    str += '=';
  }
  return atob(str);
}

/**
 * Base64URL 解码为 Uint8Array
 */
function base64UrlDecodeToBytes(str: string): Uint8Array {
  const decoded = base64UrlDecode(str);
  return new Uint8Array(decoded.split('').map((c) => c.charCodeAt(0)));
}

/**
 * 使用 HMAC-SHA256 签名
 */
async function hmacSign(data: string, secret: string): Promise<Uint8Array> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const messageData = encoder.encode(data);

  const key = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign('HMAC', key, messageData);
  return new Uint8Array(signature);
}

/**
 * 生成 JWT Token
 */
export async function signJWT(
  payload: Omit<JWTPayload, 'iat' | 'exp'>,
  secret: string,
  expiresIn: string | number = '7d'
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  let exp: number;

  if (typeof expiresIn === 'number') {
    exp = now + expiresIn;
  } else {
    // 解析时间字符串（如 '7d', '24h', '30m'）
    const match = expiresIn.match(/^(\d+)([smhd])$/);
    if (!match) {
      throw new Error(`Invalid expires format: ${expiresIn}`);
    }

    const value = parseInt(match[1], 10);
    const unit = match[2];
    const multipliers: Record<string, number> = {
      s: 1,
      m: 60,
      h: 3600,
      d: 86400,
    };

    exp = now + value * multipliers[unit];
  }

  const fullPayload = {
    ...payload,
    iat: now,
    exp,
  } as JWTPayload;

  // 编码 header 和 payload
  const headerEncoded = base64UrlEncode(JSON.stringify(JWT_HEADER));
  const payloadEncoded = base64UrlEncode(JSON.stringify(fullPayload));

  // 签名
  const signatureInput = `${headerEncoded}.${payloadEncoded}`;
  const signature = await hmacSign(signatureInput, secret);
  const signatureEncoded = base64UrlEncode(signature);

  return `${headerEncoded}.${payloadEncoded}.${signatureEncoded}`;
}

/**
 * 验证 JWT Token
 */
export async function verifyJWT(token: string, secret: string): Promise<JWTPayload> {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('Invalid token format');
  }

  const [headerEncoded, payloadEncoded, signatureEncoded] = parts;

  // 验证签名
  const signatureInput = `${headerEncoded}.${payloadEncoded}`;
  const expectedSignature = await hmacSign(signatureInput, secret);
  const actualSignature = base64UrlDecodeToBytes(signatureEncoded);

  // 比较签名（时间安全比较）
  if (!timingSafeEqual(expectedSignature, actualSignature)) {
    throw new Error('Invalid token signature');
  }

  // 解析 payload
  const payloadJson = base64UrlDecode(payloadEncoded);
  const payload: JWTPayload = JSON.parse(payloadJson);

  // 检查过期时间
  const now = Math.floor(Date.now() / 1000);
  if (payload.exp && payload.exp < now) {
    throw new Error('Token expired');
  }

  // 检查签发时间（防止未来 token）
  if (payload.iat && payload.iat > now + 60) {
    // 允许 1 分钟时钟偏差
    throw new Error('Token issued in the future');
  }

  return payload;
}

/**
 * 解码 JWT（不验证签名）
 */
export function decodeJWT(token: string): JWTPayload {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('Invalid token format');
  }

  const payloadEncoded = parts[1];
  const payloadJson = base64UrlDecode(payloadEncoded);
  return JSON.parse(payloadJson);
}

/**
 * 时间安全比较（防止时序攻击）
 */
function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) {
    return false;
  }

  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a[i] ^ b[i];
  }

  return result === 0;
}

/**
 * JWT Payload 类型
 */
export interface JWTPayload {
  sub: string; // 用户 ID
  role: number; // 用户角色
  iat: number; // 签发时间
  exp: number; // 过期时间
  [key: string]: any;
}
