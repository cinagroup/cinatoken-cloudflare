/**
 * 响应工具函数
 */

import type { ApiResponse, ResponseMeta } from '../types/index.js';

/**
 * 创建成功响应
 */
export function successResponse<T>(data: T, meta?: ResponseMeta): ApiResponse<T> {
  return {
    success: true,
    data,
    meta,
  };
}

/**
 * 创建分页响应
 */
export function paginatedResponse<T>(
  items: T[],
  page: number,
  pageSize: number,
  total: number
): ApiResponse<T[]> {
  return {
    success: true,
    data: items,
    meta: {
      page,
      pageSize,
      total,
    },
  };
}

/**
 * 创建错误响应
 */
export function errorResponse(
  code: string,
  message: string,
  details?: Record<string, any>,
  meta?: ResponseMeta
): ApiResponse {
  return {
    success: false,
    error: {
      code,
      message,
      details,
    },
    meta,
  };
}

/**
 * 创建验证错误响应
 */
export function validationErrorResponse(
  errors: string[],
  meta?: ResponseMeta
): ApiResponse {
  return {
    success: false,
    error: {
      code: 'VALIDATION_ERROR',
      message: 'Validation failed',
      details: { errors },
    },
    meta,
  };
}

/**
 * 创建未授权响应
 */
export function unauthorizedResponse(message: string = 'Unauthorized'): ApiResponse {
  return {
    success: false,
    error: {
      code: 'UNAUTHORIZED',
      message,
    },
  };
}

/**
 * 创建禁止访问响应
 */
export function forbiddenResponse(message: string = 'Forbidden'): ApiResponse {
  return {
    success: false,
    error: {
      code: 'FORBIDDEN',
      message,
    },
  };
}

/**
 * 创建未找到响应
 */
export function notFoundResponse(resource: string = 'Resource'): ApiResponse {
  return {
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: `${resource} not found`,
    },
  };
}

/**
 * 创建限流响应
 */
export function rateLimitResponse(message: string = 'Rate limit exceeded'): ApiResponse {
  return {
    success: false,
    error: {
      code: 'RATE_LIMITED',
      message,
    },
  };
}

/**
 * 创建服务器错误响应
 */
export function serverErrorResponse(
  message: string = 'Internal server error',
  details?: Record<string, any>
): ApiResponse {
  return {
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message,
      details,
    },
  };
}

/**
 * 创建数据库错误响应
 */
export function databaseErrorResponse(
  message: string = 'Database error',
  details?: Record<string, any>
): ApiResponse {
  return {
    success: false,
    error: {
      code: 'DATABASE_ERROR',
      message,
      details,
    },
  };
}

/**
 * 创建上游错误响应（AI 代理调用失败）
 */
export function upstreamErrorResponse(
  message: string = 'Upstream service error',
  details?: Record<string, any>
): ApiResponse {
  return {
    success: false,
    error: {
      code: 'UPSTREAM_ERROR',
      message,
      details,
    },
  };
}

/**
 * 创建配额不足响应
 */
export function quotaExceededResponse(message: string = 'Quota exceeded'): ApiResponse {
  return {
    success: false,
    error: {
      code: 'QUOTA_EXCEEDED',
      message,
    },
  };
}

/**
 * 提取错误信息
 */
export function extractErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  return 'Unknown error';
}

/**
 * 提取错误详情
 */
export function extractErrorDetails(error: unknown): Record<string, any> | undefined {
  if (error instanceof Error && 'details' in error) {
    return (error as any).details;
  }
  return undefined;
}

/**
 * 记录错误日志
 */
export function logError(context: string, error: unknown, requestId?: string): void {
  const timestamp = new Date().toISOString();
  const errorMessage = extractErrorMessage(error);
  const errorStack = error instanceof Error ? error.stack : undefined;

  console.error(
    JSON.stringify({
      timestamp,
      level: 'error',
      context,
      requestId,
      error: errorMessage,
      stack: errorStack,
    })
  );
}

/**
 * 记录警告日志
 */
export function logWarning(context: string, message: string, requestId?: string): void {
  const timestamp = new Date().toISOString();

  console.warn(
    JSON.stringify({
      timestamp,
      level: 'warn',
      context,
      requestId,
      message,
    })
  );
}

/**
 * 记录信息日志
 */
export function logInfo(context: string, message: string, data?: Record<string, any>): void {
  const timestamp = new Date().toISOString();

  console.log(
    JSON.stringify({
      timestamp,
      level: 'info',
      context,
      message,
      data,
    })
  );
}

/**
 * 记录调试日志
 */
export function logDebug(context: string, message: string, data?: Record<string, any>): void {
  const timestamp = new Date().toISOString();

  console.debug(
    JSON.stringify({
      timestamp,
      level: 'debug',
      context,
      message,
      data,
    })
  );
}
