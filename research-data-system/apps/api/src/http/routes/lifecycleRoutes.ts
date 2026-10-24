import { Hono } from 'hono';
import { z } from 'zod';
import { lifecycleCreateSchema, lifecycleUpdateSchema } from '@rds/shared';
import { createLifecycle, findLifecycle, updateLifecycle } from '../../application/lifecycle.js';
import { audit, findSubject, parseJson } from '../../application/common.js';
import { execute, query, withTransaction, type Row } from '../../infrastructure/db/client.js';
import { conflict } from '../errors.js';
import { idempotent } from '../middlewares/idempotency.js';
import { requireAuth, requireRole } from '../middlewares/auth.js';
import { ok } from '../responders.js';
import { body } from '../validate.js';
import type { AppEnv } from '../types.js';

export const lifecycleRoutes = new Hono<AppEnv>();
lifecycleRoutes.use('*', requireAuth);

lifecycleRoutes.post('/', idempotent, async (c) => {
  const input = await body(c, lifecycleCreateSchema);
  const result = await withTransaction((tx) => createLifecycle(input, { actor: c.get('user'), requestId: c.get('requestId') }, tx));
  return ok(c, result, 201);
});

lifecycleRoutes.get('/:id', async (c) => ok(c, await findLifecycle(c.req.param('id'), undefined, c.req.query('includeDeleted') === 'true')));

lifecycleRoutes.patch('/:id', async (c) => {
  const input = await body(c, lifecycleUpdateSchema);
  const result = await withTransaction((tx) => updateLifecycle(c.req.param('id'), input, { actor: c.get('user'), requestId: c.get('requestId') }, tx));
  return ok(c, result);
});

lifecycleRoutes.delete('/:id', requireRole('director', 'supervisor'), async (c) => {
  const input = await body(c, z.object({ version: z.number().int().positive() }));
  const before = await findLifecycle(c.req.param('id'));
  await withTransaction(async (tx) => {
    await findSubject(before.subjectType, before.subjectId, tx, false, true);
    const result = await execute(`UPDATE lifecycle_records SET deleted_at=UTC_TIMESTAMP(3),deleted_by=?,version=version+1
      WHERE id=? AND version=? AND deleted_at IS NULL`, [c.get('user').id, before.id, input.version], tx);
    if (!result.affectedRows) throw conflict('生命周期记录已被他人更新', 'VERSION_CONFLICT');
    await execute(`UPDATE records SET deleted_at=UTC_TIMESTAMP(3),deleted_by=?,version=version+1
      WHERE lifecycle_id=? AND deleted_at IS NULL`, [c.get('user').id, before.id], tx);
    await audit(tx, { requestId: c.get('requestId'), actorId: c.get('user').id, action: 'delete', entityType: 'lifecycle_record', entityId: before.id,
      subjectType: before.subjectType, subjectId: before.subjectId, before });
  });
  return ok(c, { success: true });
});

lifecycleRoutes.post('/:id/restore', requireRole('director', 'supervisor'), async (c) => {
  const input = await body(c, z.object({ version: z.number().int().positive() }));
  const before = await findLifecycle(c.req.param('id'), undefined, true);
  if (!before.deletedAt) throw conflict('生命周期记录未被删除');
  await withTransaction(async (tx) => {
    await findSubject(before.subjectType, before.subjectId, tx, false, true);
    const result = await execute(`UPDATE lifecycle_records SET deleted_at=NULL,deleted_by=NULL,version=version+1
      WHERE id=? AND version=? AND deleted_at IS NOT NULL`, [before.id, input.version], tx);
    if (!result.affectedRows) throw conflict('生命周期记录已被他人更新', 'VERSION_CONFLICT');
    await execute('UPDATE records SET deleted_at=NULL,deleted_by=NULL,version=version+1 WHERE lifecycle_id=? AND deleted_at IS NOT NULL', [before.id], tx);
    const after = await findLifecycle(before.id, tx);
    await audit(tx, { requestId: c.get('requestId'), actorId: c.get('user').id, action: 'restore', entityType: 'lifecycle_record', entityId: before.id,
      subjectType: before.subjectType, subjectId: before.subjectId, before, after });
  });
  return ok(c, await findLifecycle(before.id));
});

lifecycleRoutes.get('/:id/history', async (c) => {
  await findLifecycle(c.req.param('id'), undefined, true);
  const rows = await query<Row[]>(`SELECT a.*,u.display_name AS actor_name FROM audit_logs a LEFT JOIN users u ON u.id=a.actor_id
    WHERE a.entity_type='lifecycle_record' AND a.entity_id=? ORDER BY a.created_at DESC`, [c.req.param('id')]);
  return ok(c, rows.map((row) => ({ id: String(row.id), requestId: String(row.request_id), actorId: row.actor_id ? String(row.actor_id) : null,
    actorName: String(row.actor_name ?? '系统'), action: String(row.action), entityType: String(row.entity_type), entityId: String(row.entity_id),
    subjectType: row.subject_type, subjectId: row.subject_id, before: parseJson(row.before_json), after: parseJson(row.after_json), createdAt: String(row.created_at) })));
});
