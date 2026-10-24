import { randomUUID } from 'node:crypto';
import { Hono } from 'hono';
import { z } from 'zod';
import type { ProcessDefDto } from '@rds/shared';
import { body } from '../validate.js';
import { ok } from '../responders.js';
import { conflict, isDuplicate, notFound } from '../errors.js';
import { requireAuth, requireRole } from '../middlewares/auth.js';
import { idempotent } from '../middlewares/idempotency.js';
import { execute, one, query, withTransaction, type Row } from '../../infrastructure/db/client.js';
import { audit } from '../../application/common.js';
import type { AppEnv } from '../types.js';

export const processRoutes = new Hono<AppEnv>();
processRoutes.use('*', requireAuth);

function map(row: Row): ProcessDefDto {
  return { id: String(row.id), name: String(row.name), sortOrder: Number(row.sort_order), isSystem: Boolean(row.is_system),
    status: row.status, version: Number(row.version) };
}

processRoutes.get('/', async (c) => {
  const includeDisabled = c.req.query('includeDisabled') === 'true' && c.get('user').role !== 'engineer';
  const rows = await query<Row[]>(`SELECT * FROM process_defs ${includeDisabled ? '' : "WHERE status='active'"} ORDER BY sort_order,name`);
  return ok(c, rows.map(map));
});

processRoutes.post('/', requireRole('director','supervisor'), idempotent, async (c) => {
  const input = await body(c, z.object({ name: z.string().trim().min(1).max(100), sortOrder: z.number().int().nonnegative().default(0) }));
  const id = randomUUID();
  try {
    await withTransaction(async (tx) => {
      await execute('INSERT INTO process_defs(id,name,sort_order,created_by,updated_by) VALUES (?,?,?,?,?)',
        [id, input.name, input.sortOrder, c.get('user').id, c.get('user').id], tx);
      await audit(tx, { requestId: c.get('requestId'), actorId: c.get('user').id, action: 'create', entityType: 'process_def', entityId: id, after: input });
    });
  } catch (error) { if (isDuplicate(error)) throw conflict('工序名称已存在'); throw error; }
  return ok(c, map((await one<Row[]>('SELECT * FROM process_defs WHERE id=?', [id]))!), 201);
});

processRoutes.patch('/:id', requireRole('director','supervisor'), async (c) => {
  const input = await body(c, z.object({ name: z.string().trim().min(1).max(100), sortOrder: z.number().int().nonnegative(), version: z.number().int().positive() }));
  const before = await one<Row[]>('SELECT * FROM process_defs WHERE id=?', [c.req.param('id')]);
  if (!before) throw notFound('工序不存在');
  try {
    await withTransaction(async (tx) => {
      const result = await execute('UPDATE process_defs SET name=?,sort_order=?,updated_by=?,version=version+1 WHERE id=? AND version=?',
        [input.name, input.sortOrder, c.get('user').id, before.id, input.version], tx);
      if (!result.affectedRows) throw conflict('工序已被他人更新', 'VERSION_CONFLICT');
      await audit(tx, { requestId: c.get('requestId'), actorId: c.get('user').id, action: 'update', entityType: 'process_def', entityId: String(before.id), before: map(before), after: input });
    });
  } catch (error) { if (isDuplicate(error)) throw conflict('工序名称已存在'); throw error; }
  return ok(c, map((await one<Row[]>('SELECT * FROM process_defs WHERE id=?', [before.id]))!));
});

processRoutes.post('/:id/status', requireRole('director','supervisor'), async (c) => {
  const input = await body(c, z.object({ status: z.enum(['active','disabled']), version: z.number().int().positive() }));
  const before = await one<Row[]>('SELECT * FROM process_defs WHERE id=?', [c.req.param('id')]);
  if (!before) throw notFound('工序不存在');
  await withTransaction(async (tx) => {
    const result = await execute('UPDATE process_defs SET status=?,updated_by=?,version=version+1 WHERE id=? AND version=?',
      [input.status, c.get('user').id, before.id, input.version], tx);
    if (!result.affectedRows) throw conflict('工序已被他人更新', 'VERSION_CONFLICT');
    await audit(tx, { requestId: c.get('requestId'), actorId: c.get('user').id, action: 'update', entityType: 'process_def', entityId: String(before.id), before: map(before), after: { status: input.status } });
  });
  return ok(c, map((await one<Row[]>('SELECT * FROM process_defs WHERE id=?', [before.id]))!));
});
