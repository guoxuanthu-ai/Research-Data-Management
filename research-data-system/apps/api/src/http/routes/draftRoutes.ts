import { randomUUID } from 'node:crypto';
import { Hono } from 'hono';
import { draftSchema } from '@rds/shared';
import { body } from '../validate.js';
import { conflict } from '../errors.js';
import { ok } from '../responders.js';
import { requireAuth } from '../middlewares/auth.js';
import { execute, one, query, withTransaction, type Row } from '../../infrastructure/db/client.js';
import { findSubject, parseJson } from '../../application/common.js';
import type { AppEnv } from '../types.js';

export const draftRoutes = new Hono<AppEnv>();
draftRoutes.use('*', requireAuth);

function map(row: Row) {
  return { id: String(row.id), ownerId: String(row.owner_id), subjectType: row.subject_type, subjectId: String(row.subject_id),
    processName: String(row.process_name), payload: parseJson(row.payload_json), clientUpdatedAt: String(row.client_updated_at).replace(' ', 'T') + 'Z',
    version: Number(row.version), updatedAt: String(row.updated_at) };
}

draftRoutes.get('/', async (c) => {
  const where = ['owner_id=?'];
  const params: unknown[] = [c.get('user').id];
  if (c.req.query('subjectType')) { where.push('subject_type=?'); params.push(c.req.query('subjectType')); }
  if (c.req.query('subjectId')) { where.push('subject_id=?'); params.push(c.req.query('subjectId')); }
  const rows = await query<Row[]>(`SELECT * FROM drafts WHERE ${where.join(' AND ')} ORDER BY updated_at DESC`, params);
  return ok(c, rows.map(map));
});

draftRoutes.post('/', async (c) => {
  const input = await body(c, draftSchema);
  await findSubject(input.subjectType, input.subjectId);
  const id = await withTransaction(async (tx) => {
    const existing = await one<Row[]>('SELECT * FROM drafts WHERE owner_id=? AND subject_type=? AND subject_id=? AND process_name=? FOR UPDATE',
      [c.get('user').id, input.subjectType, input.subjectId, input.processName], tx);
    if (existing) {
      if (input.version !== Number(existing.version)) throw conflict('云端草稿已更新，请比较后重试', 'VERSION_CONFLICT');
      if (new Date(input.clientUpdatedAt).getTime() < new Date(String(existing.client_updated_at).replace(' ', 'T') + 'Z').getTime()) {
        throw conflict('客户端草稿时间早于云端草稿', 'VERSION_CONFLICT');
      }
      await execute(`UPDATE drafts SET payload_json=?,client_updated_at=?,version=version+1 WHERE id=? AND version=?`,
        [JSON.stringify(input.payload), input.clientUpdatedAt.slice(0, 23).replace('T', ' '), existing.id, input.version], tx);
      return String(existing.id);
    }
    if (input.version !== undefined && input.version !== 1) throw conflict('草稿版本冲突', 'VERSION_CONFLICT');
    const id = randomUUID();
    await execute(`INSERT INTO drafts(id,owner_id,subject_type,subject_id,process_name,payload_json,client_updated_at)
      VALUES (?,?,?,?,?,?,?)`, [id, c.get('user').id, input.subjectType, input.subjectId, input.processName,
      JSON.stringify(input.payload), input.clientUpdatedAt.slice(0, 23).replace('T', ' ')], tx);
    return id;
  });
  return ok(c, map((await one<Row[]>('SELECT * FROM drafts WHERE id=?', [id]))!));
});
