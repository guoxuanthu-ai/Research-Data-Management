import type { MiddlewareHandler } from 'hono';
import { ApiError } from '../errors.js';
import type { AppEnv } from '../types.js';

const attempts = new Map<string, { count: number; resetAt: number }>();

export const loginRateLimit: MiddlewareHandler<AppEnv> = async (c, next) => {
  const ip = c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ?? 'local';
  const key = `${ip}:${c.req.header('x-rate-key') ?? ''}`;
  const now = Date.now();
  const current = attempts.get(key);
  if (current && current.resetAt > now && current.count >= 10) {
    c.header('Retry-After', String(Math.ceil((current.resetAt - now) / 1000)));
    throw new ApiError(429, 'RATE_LIMITED', '登录尝试过于频繁，请稍后重试');
  }
  if (!current || current.resetAt <= now) attempts.set(key, { count: 1, resetAt: now + 15 * 60_000 });
  else current.count += 1;
  await next();
};
