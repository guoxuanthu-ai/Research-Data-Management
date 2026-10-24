import { randomUUID } from 'node:crypto';
import { Hono } from 'hono';
import { z } from 'zod';
import { createUserSchema, updateUserSchema, type Role } from '@rds/shared';
import { body, parse, query, versionFromRequest } from '../validate.js';
import { ok } from '../responders.js';
import { forbidden, isDuplicate, notFound, conflict } from '../errors.js';
import { requireAuth, requireRole } from '../middlewares/auth.js';
import { idempotent } from '../middlewares/idempotency.js';
import { execute, one, query as select, withTransaction, type Row } from '../../infrastructure/db/client.js';
import { generateInitialPassword, hashPassword } from '../../infrastructure/security/password.js';
import { audit, findUser, mapUser, page } from '../../application/common.js';
import type { AppContext, AppEnv } from '../types.js';

export const userRoutes = new Hono<AppEnv>();
userRoutes.use('*', requireAuth, requireRole('director', 'supervisor'));

function assertManageRole(actorRole: Role, targetRole: Role): void {
  if (actorRole === 'supervisor' && targetRole !== 'engineer') throw forbidden('主管只能管理工程师账号');
}

userRoutes.get('/', async (c) => {
  const q = query(c, z.object({ page: z.coerce.number().optional(), pageSize: z.coerce.number().optional(), q: z.string().optional(), role: z.enum(['director','supervisor','engineer']).optional(), status: z.enum(['active','disabled']).optional() }));
  const paging = page(q);
  const where = ['deleted_at IS NULL'];
  const params: unknown[] = [];
  if (c.get('user').role === 'supervisor') where.push("role='engineer'");
  if (q.role) { where.push('role=?'); params.push(q.role); }
  if (q.status) { where.push('status=?'); params.push(q.status); }
  if (q.q) { where.push('(username LIKE ? OR display_name LIKE ?)'); params.push(`%${q.q}%`, `%${q.q}%`); }
  const condition = where.join(' AND ');
  const total = await one<Row[]>(`SELECT COUNT(*) AS count FROM users WHERE ${condition}`, params);
  const rows = await select<Row[]>(`SELECT * FROM users WHERE ${condition} ORDER BY created_at DESC LIMIT ? OFFSET ?`, [...params, paging.pageSize, paging.offset]);
  return ok(c, { items: rows.map(mapUser), total: Number(total?.count ?? 0), page: paging.page, pageSize: paging.pageSize });
});

userRoutes.post('/', idempotent, async (c) => {
  const input = await body(c, createUserSchema);
  const actor = c.get('user');
  assertManageRole(actor.role, input.role);
  const initialPassword = input.initialPassword ?? generateInitialPassword();
  const id = randomUUID();
  try {
    await withTransaction(async (tx) => {
      await execute(`INSERT INTO users(id,username,display_name,role,password_hash,must_change_password,created_by,updated_by)
        VALUES (?,?,?,?,?,FALSE,?,?)`, [id, input.username, input.displayName, input.role, await hashPassword(initialPassword), actor.id, actor.id], tx);
      await audit(tx, { requestId: c.get('requestId'), actorId: actor.id, action: 'create', entityType: 'user', entityId: id,
        after: { username: input.username, displayName: input.displayName, role: input.role } });
    });
  } catch (error) {
    if (isDuplicate(error)) throw conflict('用户名已存在');
    throw error;
  }
  const user = await findUser(id);
  return ok(c, { ...user, initialPassword }, 201);
});

async function managedUser(c: AppContext): Promise<Row> {
  const row = await one<Row[]>('SELECT * FROM users WHERE id=? AND deleted_at IS NULL', [c.req.param('id')]);
  if (!row) throw notFound('账号不存在');
  assertManageRole(c.get('user').role, row.role as Role);
  return row;
}

userRoutes.patch('/:id', async (c) => {
  const input = await body(c, updateUserSchema);
  const target = await managedUser(c);
  if (input.role) assertManageRole(c.get('user').role, input.role);
  const actor = c.get('user');
  await withTransaction(async (tx) => {
    const result = await execute(`UPDATE users SET display_name=?,role=?,updated_by=?,version=version+1
      WHERE id=? AND version=? AND deleted_at IS NULL`, [input.displayName ?? target.display_name, input.role ?? target.role, actor.id, target.id, input.version], tx);
    if (!result.affectedRows) throw conflict('账号已被他人更新', 'VERSION_CONFLICT');
    await execute('UPDATE sessions SET revoked_at=UTC_TIMESTAMP(3) WHERE user_id=? AND revoked_at IS NULL', [target.id], tx);
    const after = await findUser(String(target.id), tx);
    await audit(tx, { requestId: c.get('requestId'), actorId: actor.id, action: 'update', entityType: 'user', entityId: String(target.id), before: mapUser(target), after });
  });
  return ok(c, await findUser(String(target.id)));
});

userRoutes.post('/:id/status', async (c) => {
  const input = await body(c, z.object({ status: z.enum(['active','disabled']), version: z.number().int().positive() }));
  const target = await managedUser(c);
  if (String(target.id) === c.get('user').id) throw forbidden('不能停用自己的账号');
  await withTransaction(async (tx) => {
    const result = await execute('UPDATE users SET status=?,updated_by=?,version=version+1 WHERE id=? AND version=?',
      [input.status, c.get('user').id, target.id, input.version], tx);
    if (!result.affectedRows) throw conflict('账号已被他人更新', 'VERSION_CONFLICT');
    if (input.status === 'disabled') await execute('UPDATE sessions SET revoked_at=UTC_TIMESTAMP(3) WHERE user_id=? AND revoked_at IS NULL', [target.id], tx);
    await audit(tx, { requestId: c.get('requestId'), actorId: c.get('user').id, action: 'update', entityType: 'user', entityId: String(target.id), before: mapUser(target), after: { status: input.status } });
  });
  return ok(c, await findUser(String(target.id)));
});

userRoutes.post('/:id/reset-password', async (c) => {
  const target = await managedUser(c);
  const initialPassword = generateInitialPassword();
  await withTransaction(async (tx) => {
    await execute('UPDATE users SET password_hash=?,must_change_password=FALSE,updated_by=?,version=version+1 WHERE id=?',
      [await hashPassword(initialPassword), c.get('user').id, target.id], tx);
    await execute('UPDATE sessions SET revoked_at=UTC_TIMESTAMP(3) WHERE user_id=? AND revoked_at IS NULL', [target.id], tx);
    await audit(tx, { requestId: c.get('requestId'), actorId: c.get('user').id, action: 'reset_password', entityType: 'user', entityId: String(target.id) });
  });
  return ok(c, { initialPassword });
});

userRoutes.delete('/:id', async (c) => {
  let input: unknown;
  try { input = await c.req.json(); } catch { input = undefined; }
  const version = versionFromRequest(c, input);
  const target = await managedUser(c);
  if (String(target.id) === c.get('user').id) throw forbidden('不能删除自己的账号');
  await withTransaction(async (tx) => {
    const result = await execute('UPDATE users SET deleted_at=UTC_TIMESTAMP(3),deleted_by=?,status=\'disabled\',version=version+1 WHERE id=? AND version=? AND deleted_at IS NULL',
      [c.get('user').id, target.id, version], tx);
    if (!result.affectedRows) throw conflict('账号已被他人更新', 'VERSION_CONFLICT');
    await execute('UPDATE sessions SET revoked_at=UTC_TIMESTAMP(3) WHERE user_id=? AND revoked_at IS NULL', [target.id], tx);
    await audit(tx, { requestId: c.get('requestId'), actorId: c.get('user').id, action: 'delete', entityType: 'user', entityId: String(target.id), before: mapUser(target) });
  });
  return ok(c, { success: true });
});
