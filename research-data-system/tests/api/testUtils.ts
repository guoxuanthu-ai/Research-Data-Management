import { randomUUID } from 'node:crypto';
import mysql from 'mysql2/promise';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? 'mysql://root@127.0.0.1:3307/rds_test';
process.env.JWT_SECRET = 'integration-test-secret-with-at-least-32-bytes';
process.env.COOKIE_SECURE = 'false';

export const DEMO_TEMPLATE_ID = '00000000-0000-4000-8000-000000000201';
export const DEMO_EXPERIMENT_ID = '00000000-0000-4000-8000-000000000302';

export const databaseAvailable = await (async () => {
  let connection;
  try {
    connection = await mysql.createConnection({ uri: process.env.DATABASE_URL, connectTimeout: 1500 });
    await connection.query('SELECT 1');
    return true;
  } catch {
    return false;
  } finally {
    await connection?.end();
  }
})();

export async function setup() {
  const { seed } = await import('../../apps/api/src/seeds/devSeed.js');
  await seed();
}

export async function getApp() {
  return (await import('../../apps/api/src/app.js')).app;
}

export async function stop() {
  const { closeDb } = await import('../../apps/api/src/infrastructure/db/client.js');
  await closeDb();
}

export async function login(username: string, password: string) {
  const app = await getApp();
  const response = await app.request('/api/v1/auth/login', { method: 'POST', headers: { 'content-type': 'application/json', 'x-rate-key': randomUUID() }, body: JSON.stringify({ username, password }) });
  const body = await response.json() as { data: { accessToken: string; user: { id: string; version: number; mustChangePassword: boolean } } };
  if (!response.ok) throw new Error(`测试登录失败：${username}，HTTP ${response.status}`);
  return { ...body.data, cookie: response.headers.get('set-cookie')?.split(';')[0] ?? '', response };
}

export async function api(path: string, accessToken: string, init: RequestInit = {}) {
  const app = await getApp();
  const headers = new Headers(init.headers);
  headers.set('authorization', `Bearer ${accessToken}`);
  if (init.body && !(init.body instanceof FormData) && !headers.has('content-type')) headers.set('content-type', 'application/json');
  return app.request(path, { ...init, headers });
}
