import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { ApiEnvelope } from '@rds/shared';
import type { AppEnv } from './types.js';

export function ok<T>(c: Context<AppEnv>, data: T, status: ContentfulStatusCode = 200): Response {
  const body: ApiEnvelope<T> = { ok: true, data, requestId: c.get('requestId') };
  return c.json(body, status);
}
