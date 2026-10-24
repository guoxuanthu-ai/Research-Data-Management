import type { MiddlewareHandler } from 'hono';
import { execute, one, query, type Row } from '../../infrastructure/db/client.js';
import { hashRequest } from '../../infrastructure/security/sessionToken.js';
import { badRequest, conflict, isDuplicate } from '../errors.js';
import { ok } from '../responders.js';
import type { AppEnv } from '../types.js';

export const idempotent: MiddlewareHandler<AppEnv> = async (c, next) => {
  const key = c.req.header('Idempotency-Key');
  if (!key || key.length > 128) throw badRequest('创建接口必须提供 1-128 字符的 Idempotency-Key');
  const userId = c.get('user').id;
  const endpoint = c.req.path;
  const requestHash = hashRequest(await c.req.raw.clone().text());
  try {
    await execute('INSERT INTO idempotency_keys(idempotency_key,user_id,endpoint,request_hash) VALUES (?,?,?,?)',
      [key, userId, endpoint, requestHash]);
  } catch (error) {
    if (!isDuplicate(error)) throw error;
    const previous = await one<Row[]>('SELECT request_hash,response_json,response_status,status FROM idempotency_keys WHERE idempotency_key=? AND user_id=? AND endpoint=?',
      [key, userId, endpoint]);
    if (!previous || previous.request_hash !== requestHash) throw conflict('同一幂等键对应了不同请求', 'IDEMPOTENCY_CONFLICT');
    if (previous.status !== 'completed') throw conflict('相同请求正在处理中', 'IDEMPOTENCY_IN_PROGRESS');
    return c.json(JSON.parse(String(previous.response_json)), Number(previous.response_status) as 200);
  }
  try {
    await next();
    if (c.res.status >= 300) {
      await execute('DELETE FROM idempotency_keys WHERE idempotency_key=? AND user_id=? AND endpoint=? AND status=\'processing\'', [key, userId, endpoint]);
      return;
    }
    const responseText = await c.res.clone().text();
    await execute(`UPDATE idempotency_keys SET response_json=?,response_status=?,status='completed'
      WHERE idempotency_key=? AND user_id=? AND endpoint=?`, [responseText, c.res.status, key, userId, endpoint]);
  } catch (error) {
    await execute('DELETE FROM idempotency_keys WHERE idempotency_key=? AND user_id=? AND endpoint=? AND status=\'processing\'', [key, userId, endpoint]);
    throw error;
  }
};

export async function cleanupIdempotencyKeys(): Promise<void> {
  await execute("DELETE FROM idempotency_keys WHERE created_at < UTC_TIMESTAMP() - INTERVAL 7 DAY");
}
