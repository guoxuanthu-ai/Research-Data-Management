import { randomUUID } from 'node:crypto';
import { Hono } from 'hono';
import { changePasswordSchema, loginSchema, type CurrentUserDto, type Role } from '@rds/shared';
import { body } from '../validate.js';
import { ok } from '../responders.js';
import { badRequest, unauthorized } from '../errors.js';
import { execute, one, withTransaction, type Db, type Row } from '../../infrastructure/db/client.js';
import { hashPassword, verifyPassword } from '../../infrastructure/security/password.js';
import { createRefreshToken, hashToken } from '../../infrastructure/security/sessionToken.js';
import { signAccessToken } from '../../infrastructure/security/jwt.js';
import { clearRefreshCookie, readRefreshCookie, setRefreshCookie } from '../../infrastructure/security/cookies.js';
import { env } from '../../config/env.js';
import { requireAuth } from '../middlewares/auth.js';
import { loginRateLimit } from '../middlewares/rateLimit.js';
import { audit } from '../../application/common.js';
import type { AppContext, AppEnv } from '../types.js';

export const authRoutes = new Hono<AppEnv>();

function sessionInput(c: AppContext): { ip: string; agent: string } {
  return { ip: c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ?? '', agent: c.req.header('user-agent')?.slice(0, 500) ?? '' };
}

function current(row: Row): CurrentUserDto {
  return { id: String(row.id), username: String(row.username), displayName: String(row.display_name), role: row.role as Role,
    status: row.status, mustChangePassword: Boolean(row.must_change_password), version: Number(row.version) };
}

async function createSession(userId: string, ip: string, agent: string, db: Db): Promise<{ id: string; token: string }> {
  const id = randomUUID();
  const refresh = createRefreshToken();
  const expiresAt = new Date(Date.now() + env.SESSION_TTL_DAYS * 86400_000).toISOString().slice(0, 23).replace('T', ' ');
  await execute('INSERT INTO sessions(id,user_id,refresh_token_hash,expires_at,ip,user_agent) VALUES (?,?,?,?,?,?)',
    [id, userId, refresh.hash, expiresAt, ip, agent], db);
  return { id, token: refresh.token };
}

authRoutes.post('/login', loginRateLimit, async (c) => {
  const input = await body(c, loginSchema);
  const row = await one<Row[]>('SELECT * FROM users WHERE username=? AND deleted_at IS NULL', [input.username]);
  const valid = row && row.status === 'active' && await verifyPassword(input.password, String(row.password_hash));
  if (!row || !valid) {
    await audit((await import('../../infrastructure/db/client.js')).pool, {
      requestId: c.get('requestId'), actorId: null, action: 'login_failed', entityType: 'auth',
      entityId: '00000000-0000-0000-0000-000000000000', after: { username: input.username },
    });
    throw unauthorized('用户名或密码错误');
  }
  const { ip, agent } = sessionInput(c);
  const session = await withTransaction(async (tx) => {
    const created = await createSession(String(row.id), ip, agent, tx);
    await execute('UPDATE users SET last_login_at=UTC_TIMESTAMP(3) WHERE id=?', [row.id], tx);
    await audit(tx, { requestId: c.get('requestId'), actorId: String(row.id), action: 'login', entityType: 'session', entityId: created.id });
    return created;
  });
  setRefreshCookie(c, session.token);
  const accessToken = await signAccessToken(String(row.id), session.id, Number(row.version));
  return ok(c, { accessToken, user: current(row) });
});

authRoutes.post('/refresh', async (c) => {
  const token = readRefreshCookie(c);
  if (!token) throw unauthorized();
  const { ip, agent } = sessionInput(c);
  const result = await withTransaction(async (tx) => {
    const row = await one<Row[]>(`SELECT u.*,s.id AS session_id FROM sessions s JOIN users u ON u.id=s.user_id
      WHERE s.refresh_token_hash=? AND s.revoked_at IS NULL AND s.expires_at>UTC_TIMESTAMP(3)
      AND u.deleted_at IS NULL AND u.status='active' FOR UPDATE`, [hashToken(token)], tx);
    if (!row) throw unauthorized();
    const refresh = createRefreshToken();
    const expiresAt = new Date(Date.now() + env.SESSION_TTL_DAYS * 86400_000).toISOString().slice(0, 23).replace('T', ' ');
    await execute('UPDATE sessions SET refresh_token_hash=?,expires_at=?,ip=?,user_agent=?,last_seen_at=UTC_TIMESTAMP(3) WHERE id=?',
      [refresh.hash, expiresAt, ip, agent, row.session_id], tx);
    const session = { id: String(row.session_id), token: refresh.token };
    await audit(tx, { requestId: c.get('requestId'), actorId: String(row.id), action: 'refresh', entityType: 'session', entityId: session.id });
    return { row, session };
  });
  setRefreshCookie(c, result.session.token);
  const accessToken = await signAccessToken(String(result.row.id), result.session.id, Number(result.row.version));
  return ok(c, { accessToken, user: current(result.row) });
});

authRoutes.post('/logout', requireAuth, async (c) => {
  await withTransaction(async (tx) => {
    await execute('UPDATE sessions SET revoked_at=UTC_TIMESTAMP(3) WHERE id=? AND revoked_at IS NULL', [c.get('sessionId')], tx);
    await audit(tx, { requestId: c.get('requestId'), actorId: c.get('user').id, action: 'logout', entityType: 'session', entityId: c.get('sessionId') });
  });
  clearRefreshCookie(c);
  return ok(c, { success: true });
});

authRoutes.get('/me', requireAuth, async (c) => ok(c, c.get('user')));

authRoutes.post('/change-password', requireAuth, async (c) => {
  const input = await body(c, changePasswordSchema);
  if (input.oldPassword === input.newPassword) throw badRequest('新密码不能与原密码相同');
  const row = await one<Row[]>('SELECT * FROM users WHERE id=?', [c.get('user').id]);
  if (!row || !await verifyPassword(input.oldPassword, String(row.password_hash))) throw badRequest('原密码不正确');
  const passwordHash = await hashPassword(input.newPassword);
  await withTransaction(async (tx) => {
    await execute('UPDATE users SET password_hash=?,must_change_password=FALSE,version=version+1,updated_by=? WHERE id=?',
      [passwordHash, c.get('user').id, c.get('user').id], tx);
    await execute('UPDATE sessions SET revoked_at=UTC_TIMESTAMP(3) WHERE user_id=? AND revoked_at IS NULL', [c.get('user').id], tx);
    await audit(tx, { requestId: c.get('requestId'), actorId: c.get('user').id, action: 'change_password', entityType: 'user', entityId: c.get('user').id });
  });
  clearRefreshCookie(c);
  return ok(c, { success: true });
});
