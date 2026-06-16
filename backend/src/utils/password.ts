/**
 * 密码哈希工具
 * 使用 Web Crypto API 的 PBKDF2 算法
 */

const PBKDF2_ITERATIONS = 100000;
const SALT_LENGTH = 16;
const KEY_LENGTH = 32;

/**
 * 生成随机盐
 */
function generateSalt(length: number = SALT_LENGTH): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(length));
}

/**
 * 将 Uint8Array 转换为十六进制字符串
 */
function toHex(buffer: Uint8Array): string {
  return Array.from(buffer)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * 将十六进制字符串转换为 Uint8Array
 */
function fromHex(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
  }
  return bytes;
}

/**
 * 使用 PBKDF2 派生密钥
 */
async function deriveKey(password: string, salt: Uint8Array): Promise<ArrayBuffer> {
  const encoder = new TextEncoder();
  const passwordBuffer = encoder.encode(password);

  // 导入密码作为原始密钥材料
  const baseKey = await crypto.subtle.importKey('raw', passwordBuffer, 'PBKDF2', false, [
    'deriveBits',
  ]);

  // 使用 PBKDF2 派生密钥
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: salt,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    baseKey,
    KEY_LENGTH * 8
  );

  return derivedBits;
}

/**
 * 哈希密码
 * 返回格式: pbkdf2:iterations$salt$hash (十六进制)
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = generateSalt();
  const derivedBits = await deriveKey(password, salt);

  const saltHex = toHex(salt);
  const hashHex = toHex(new Uint8Array(derivedBits));

  return `pbkdf2:${PBKDF2_ITERATIONS}$${saltHex}$${hashHex}`;
}

/**
 * 验证密码
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  try {
    // 解析哈希格式
    const parts = hash.split('$');
    if (parts.length !== 3) {
      return false;
    }

    const [prefix, saltHex, storedHashHex] = parts;

    // 支持多种格式
    let iterations: number;
    if (prefix.startsWith('pbkdf2:')) {
      iterations = parseInt(prefix.split(':')[1], 10);
    } else {
      return false;
    }

    const salt = fromHex(saltHex);

    // 派生密钥
    const encoder = new TextEncoder();
    const passwordBuffer = encoder.encode(password);
    const baseKey = await crypto.subtle.importKey('raw', passwordBuffer, 'PBKDF2', false, [
      'deriveBits',
    ]);

    const derivedBits = await crypto.subtle.deriveBits(
      {
        name: 'PBKDF2',
        salt: salt,
        iterations: iterations,
        hash: 'SHA-256',
      },
      baseKey,
      KEY_LENGTH * 8
    );

    const derivedHashHex = toHex(new Uint8Array(derivedBits));

    // 时间安全比较
    return timingSafeEqual(derivedHashHex, storedHashHex);
  } catch (error) {
    console.error('Password verification error:', error);
    return false;
  }
}

/**
 * 时间安全比较（防止时序攻击）
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }

  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }

  return result === 0;
}

/**
 * 检查哈希是否需要升级（例如迭代次数过低）
 */
export function needsUpgrade(hash: string): boolean {
  const parts = hash.split('$');
  if (parts.length !== 3) {
    return true;
  }

  const prefix = parts[0];
  if (!prefix.startsWith('pbkdf2:')) {
    return true;
  }

  const iterations = parseInt(prefix.split(':')[1], 10);
  return iterations < PBKDF2_ITERATIONS;
}
