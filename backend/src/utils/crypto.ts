/**
 * 加密工具
 * 使用 AES-256-GCM 加密敏感数据
 */

const IV_LENGTH = 12; // GCM 推荐的 IV 长度
const TAG_LENGTH = 128; // 认证标签长度（位）

/**
 * 将字符串转换为 Uint8Array
 */
function stringToBytes(str: string): Uint8Array {
  return new TextEncoder().encode(str);
}

/**
 * 将 Uint8Array 转换为字符串
 */
function bytesToString(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

/**
 * 将 Uint8Array 转换为 Base64 字符串
 */
function toBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

/**
 * 将 Base64 字符串转换为 Uint8Array
 */
function fromBase64(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * 导入加密密钥
 */
async function importKey(key: string): Promise<CryptoKey> {
  // 使用 SHA-256 将任意长度的密钥转换为 256 位密钥
  const keyBuffer = stringToBytes(key);
  const hashBuffer = await crypto.subtle.digest('SHA-256', keyBuffer);

  return await crypto.subtle.importKey('raw', hashBuffer, { name: 'AES-GCM' }, false, [
    'encrypt',
    'decrypt',
  ]);
}

/**
 * 加密数据
 * 返回格式: base64(iv + ciphertext + tag)
 */
export async function encrypt(plaintext: string, key: string): Promise<string> {
  try {
    const cryptoKey = await importKey(key);
    const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
    const data = stringToBytes(plaintext);

    const ciphertext = await crypto.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv: iv,
        tagLength: TAG_LENGTH,
      },
      cryptoKey,
      data
    );

    // 组合 IV 和密文
    const combined = new Uint8Array(iv.length + ciphertext.byteLength);
    combined.set(iv, 0);
    combined.set(new Uint8Array(ciphertext), iv.length);

    return toBase64(combined);
  } catch (error) {
    console.error('Encryption error:', error);
    throw new Error('Failed to encrypt data');
  }
}

/**
 * 解密数据
 */
export async function decrypt(encryptedData: string, key: string): Promise<string> {
  try {
    const cryptoKey = await importKey(key);
    const combined = fromBase64(encryptedData);

    // 提取 IV 和密文
    const iv = combined.slice(0, IV_LENGTH);
    const ciphertext = combined.slice(IV_LENGTH);

    const plaintext = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: iv,
        tagLength: TAG_LENGTH,
      },
      cryptoKey,
      ciphertext
    );

    return bytesToString(new Uint8Array(plaintext));
  } catch (error) {
    console.error('Decryption error:', error);
    throw new Error('Failed to decrypt data');
  }
}

/**
 * 生成随机密钥（用于加密其他数据）
 */
export function generateEncryptionKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return toBase64(bytes);
}

/**
 * 生成随机令牌
 */
export function generateToken(length: number = 32): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * 生成 API Key（带前缀）
 */
export function generateAPIKey(prefix: string = 'sk'): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  const randomPart = toBase64(bytes).replace(/[^a-zA-Z0-9]/g, '').substring(0, 32);
  return `${prefix}-${randomPart}`;
}

/**
 * 生成邀请码
 */
export function generateInvitationCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars[bytes[i] % chars.length];
  }
  return code;
}

/**
 * 生成兑换码
 */
export function generateRedemptionCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let code = '';
  for (let i = 0; i < 16; i++) {
    if (i > 0 && i % 4 === 0) {
      code += '-';
    }
    code += chars[bytes[i] % chars.length];
  }
  return code;
}

/**
 * 哈希字符串（用于非密码场景，如生成唯一标识符）
 */
export async function hashString(input: string): Promise<string> {
  const data = stringToBytes(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = new Uint8Array(hashBuffer);
  return Array.from(hashArray)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
