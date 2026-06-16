/**
 * 验证工具函数
 */

/**
 * 验证邮箱格式
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * 验证用户名格式
 * 规则：3-32 个字符，只能包含字母、数字、下划线
 */
export function isValidUsername(username: string): boolean {
  const usernameRegex = /^[a-zA-Z0-9_]{3,32}$/;
  return usernameRegex.test(username);
}

/**
 * 验证密码强度
 * 规则：至少 8 个字符，包含大小写字母和数字
 */
export function isValidPassword(password: string): boolean {
  if (password.length < 8) {
    return false;
  }
  const hasUpperCase = /[A-Z]/.test(password);
  const hasLowerCase = /[a-z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  return hasUpperCase && hasLowerCase && hasNumber;
}

/**
 * 验证 URL 格式
 */
export function isValidUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * 验证 IPv4 地址
 */
export function isValidIPv4(ip: string): boolean {
  const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
  if (!ipv4Regex.test(ip)) {
    return false;
  }
  const parts = ip.split('.');
  return parts.every((part) => {
    const num = parseInt(part, 10);
    return num >= 0 && num <= 255;
  });
}

/**
 * 验证子网掩码（CIDR 格式）
 */
export function isValidCIDR(cidr: string): boolean {
  const parts = cidr.split('/');
  if (parts.length !== 2) {
    return false;
  }
  const [ip, mask] = parts;
  if (!isValidIPv4(ip)) {
    return false;
  }
  const maskNum = parseInt(mask, 10);
  return maskNum >= 0 && maskNum <= 32;
}

/**
 * 验证 API Key 格式
 */
export function isValidAPIKey(key: string): boolean {
  // 支持多种格式：sk-xxx, key-xxx, 或任意非空字符串
  return key.length >= 10 && key.length <= 256;
}

/**
 * 验证邀请码格式
 */
export function isValidInvitationCode(code: string): boolean {
  const codeRegex = /^[A-Z0-9]{8}$/;
  return codeRegex.test(code);
}

/**
 * 验证兑换码格式
 */
export function isValidRedemptionCode(code: string): boolean {
  // 格式：XXXX-XXXX-XXXX-XXXX
  const codeRegex = /^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/;
  return codeRegex.test(code);
}

/**
 * 验证模型名称
 */
export function isValidModelName(model: string): boolean {
  // 模型名称可以包含字母、数字、点、短横线、下划线
  const modelRegex = /^[a-zA-Z0-9._-]+$/;
  return modelRegex.test(model) && model.length <= 128;
}

/**
 * 验证数字范围
 */
export function isInRange(value: number, min: number, max: number): boolean {
  return value >= min && value <= max;
}

/**
 * 验证整数
 */
export function isInteger(value: any): boolean {
  return Number.isInteger(value);
}

/**
 * 验证正整数
 */
export function isPositiveInteger(value: any): boolean {
  return isInteger(value) && value > 0;
}

/**
 * 验证非负整数
 */
export function isNonNegativeInteger(value: any): boolean {
  return isInteger(value) && value >= 0;
}

/**
 * 验证字符串长度
 */
export function isValidLength(str: string, min: number, max: number): boolean {
  return str.length >= min && str.length <= max;
}

/**
 * 验证 JSON 字符串
 */
export function isValidJSON(str: string): boolean {
  try {
    JSON.parse(str);
    return true;
  } catch {
    return false;
  }
}

/**
 * 验证数组
 */
export function isArray(value: any): value is any[] {
  return Array.isArray(value);
}

/**
 * 验证对象
 */
export function isObject(value: any): value is Record<string, any> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * 验证字符串数组
 */
export function isStringArray(value: any): value is string[] {
  return isArray(value) && value.every((item) => typeof item === 'string');
}

/**
 * 验证枚举值
 */
export function isValidEnum<T extends string | number>(
  value: any,
  enumObject: Record<string, T>
): boolean {
  return Object.values(enumObject).includes(value);
}

/**
 * 验证必填字段
 */
export function isRequired(value: any): boolean {
  if (value === null || value === undefined) {
    return false;
  }
  if (typeof value === 'string') {
    return value.trim().length > 0;
  }
  return true;
}

/**
 * 验证器类（用于链式调用）
 */
export class Validator {
  private errors: string[] = [];

  /**
   * 验证必填字段
   */
  required(value: any, fieldName: string): this {
    if (!isRequired(value)) {
      this.errors.push(`${fieldName} is required`);
    }
    return this;
  }

  /**
   * 验证邮箱
   */
  email(value: string, fieldName: string = 'Email'): this {
    if (value && !isValidEmail(value)) {
      this.errors.push(`${fieldName} format is invalid`);
    }
    return this;
  }

  /**
   * 验证用户名
   */
  username(value: string, fieldName: string = 'Username'): this {
    if (value && !isValidUsername(value)) {
      this.errors.push(
        `${fieldName} must be 3-32 characters and contain only letters, numbers, and underscores`
      );
    }
    return this;
  }

  /**
   * 验证密码
   */
  password(value: string, fieldName: string = 'Password'): this {
    if (value && !isValidPassword(value)) {
      this.errors.push(
        `${fieldName} must be at least 8 characters and contain uppercase, lowercase, and numbers`
      );
    }
    return this;
  }

  /**
   * 验证字符串长度
   */
  length(value: string, min: number, max: number, fieldName: string): this {
    if (value && !isValidLength(value, min, max)) {
      this.errors.push(`${fieldName} must be between ${min} and ${max} characters`);
    }
    return this;
  }

  /**
   * 验证数字范围
   */
  range(value: number, min: number, max: number, fieldName: string): this {
    if (value !== undefined && !isInRange(value, min, max)) {
      this.errors.push(`${fieldName} must be between ${min} and ${max}`);
    }
    return this;
  }

  /**
   * 验证正整数
   */
  positiveInteger(value: any, fieldName: string): this {
    if (value !== undefined && !isPositiveInteger(value)) {
      this.errors.push(`${fieldName} must be a positive integer`);
    }
    return this;
  }

  /**
   * 验证字符串数组
   */
  stringArray(value: any, fieldName: string): this {
    if (value !== undefined && !isStringArray(value)) {
      this.errors.push(`${fieldName} must be an array of strings`);
    }
    return this;
  }

  /**
   * 获取验证结果
   */
  validate(): { valid: boolean; errors: string[] } {
    return {
      valid: this.errors.length === 0,
      errors: this.errors,
    };
  }

  /**
   * 抛出验证错误
   */
  assert(): void {
    const result = this.validate();
    if (!result.valid) {
      throw new Error(`Validation failed: ${result.errors.join(', ')}`);
    }
  }

  /**
   * 重置错误列表
   */
  reset(): this {
    this.errors = [];
    return this;
  }
}

/**
 * 创建验证器实例
 */
export function createValidator(): Validator {
  return new Validator();
}
