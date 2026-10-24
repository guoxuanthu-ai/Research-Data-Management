import { randomUUID } from 'node:crypto';
import type { MiddlewareHandler } from 'hono';
import type { AppEnv } from '../types.js';

export const requestContext: MiddlewareHandler<AppEnv> = async (c, next) => {
  const supplied = c.req.header('X-Request-Id');
  const requestId = supplied && /^[a-zA-Z0-9_.:-]{1,100}$/.test(supplied) ? supplied : `req_${randomUUID()}`;
  c.set('requestId', requestId);
  c.header('X-Request-Id', requestId);
  const started = performance.now();
  await next();
  console.log(JSON.stringify({
    ts: new Date().toISOString(), level: 'info', requestId, method: c.req.method,
    path: c.req.path, status: c.res.status, durationMs: Math.round(performance.now() - started),
  }));
};
