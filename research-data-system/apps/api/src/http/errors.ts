import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { ValidationIssue } from '@rds/shared';

export class ApiError extends Error {
  constructor(
    public readonly status: ContentfulStatusCode,
    public readonly code: string,
    message: string,
    public readonly details?: ValidationIssue[],
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function badRequest(message = '请求参数不合法', details?: ValidationIssue[]): ApiError {
  return new ApiError(400, 'VALIDATION_ERROR', message, details);
}
export function unauthorized(message = '未登录或凭证无效'): ApiError {
  return new ApiError(401, 'UNAUTHENTICATED', message);
}
export function forbidden(message = '无权限执行此操作'): ApiError {
  return new ApiError(403, 'FORBIDDEN', message);
}
export function notFound(message = '资源不存在或已删除'): ApiError {
  return new ApiError(404, 'NOT_FOUND', message);
}
export function conflict(message = '数据冲突', code = 'CONFLICT'): ApiError {
  return new ApiError(409, code, message);
}

export function isDuplicate(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ER_DUP_ENTRY';
}
