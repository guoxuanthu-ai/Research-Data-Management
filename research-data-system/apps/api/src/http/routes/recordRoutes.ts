import { randomUUID } from 'node:crypto';
import { Hono } from 'hono';
import { z } from 'zod';
import { smartParseSchema } from '@rds/shared';
import { body, query } from '../validate.js';
import { ApiError } from '../errors.js';
import { ok } from '../responders.js';
import { requireAuth } from '../middlewares/auth.js';
import { execute, one, query as select, type Row } from '../../infrastructure/db/client.js';
import { parseText } from '../../infrastructure/core.js';
import { findRecord, page, parseJson } from '../../application/common.js';
import type { AppEnv } from '../types.js';

export const recordRoutes = new Hono<AppEnv>();
recordRoutes.use('*', requireAuth);

recordRoutes.get('/', async (c) => {
  const q = query(c, z.object({ page: z.coerce.number().optional(), pageSize: z.coerce.number().optional(),
    subjectType: z.enum(['product','experiment']).optional(), subjectId: z.string().optional(), processName: z.string().optional(),
    processDefId: z.string().optional(), createdBy: z.string().optional(), ownerId: z.string().optional(),
    dateFrom: z.string().optional(), dateTo: z.string().optional(), includeDeleted: z.enum(['true','false']).optional() }));
  const paging = page(q);
  const where: string[] = [];
  const params: unknown[] = [];
  if (q.includeDeleted !== 'true') where.push('r.deleted_at IS NULL');
  if (q.subjectType) { where.push('r.subject_type=?'); params.push(q.subjectType); }
  if (q.subjectId) { where.push('r.subject_id=?'); params.push(q.subjectId); }
  if (q.processName) { where.push('r.process_name=?'); params.push(q.processName); }
  if (q.processDefId) { where.push('r.process_def_id=?'); params.push(q.processDefId); }
  if (q.createdBy ?? q.ownerId) { where.push('r.created_by=?'); params.push(q.createdBy ?? q.ownerId); }
  if (q.dateFrom) { where.push('r.created_at>=?'); params.push(`${q.dateFrom} 00:00:00`); }
  if (q.dateTo) { where.push('r.created_at<?'); params.push(`${q.dateTo} 23:59:59.999`); }
  const condition = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = await one<Row[]>(`SELECT COUNT(*) AS count FROM records r ${condition}`, params);
  const rows = await select<Row[]>(`SELECT r.id FROM records r ${condition} ORDER BY r.created_at DESC LIMIT ? OFFSET ?`, [...params, paging.pageSize, paging.offset]);
  const items = await Promise.all(rows.map((row) => findRecord(String(row.id), undefined, q.includeDeleted === 'true')));
  return ok(c, { items, total: Number(total?.count ?? 0), page: paging.page, pageSize: paging.pageSize });
});

recordRoutes.post('/smart-parse', async (c) => {
  const input = await body(c, smartParseSchema.extend({ subjectType: z.enum(['product','experiment']).optional(), subjectId: z.string().optional() }));
  const result = await parseText(input.text, input.fields);
  await execute(`INSERT INTO parse_traces(id,request_id,actor_id,subject_type,subject_id,raw_text,result_json,issue_json,parser_version)
    VALUES (?,?,?,?,?,?,?,?,?)`, [randomUUID(), c.get('requestId'), c.get('user').id, input.subjectType ?? null, input.subjectId ?? null,
    input.text, JSON.stringify(result), JSON.stringify(result.warnings), '1.0.0']);
  return ok(c, result);
});

recordRoutes.get('/:id', async (c) => ok(c, await findRecord(c.req.param('id'), undefined, c.req.query('includeDeleted') === 'true')));
recordRoutes.get('/:id/history', async (c) => {
  await findRecord(c.req.param('id'), undefined, true);
  const rows = await select<Row[]>(`SELECT a.*,u.display_name AS actor_name FROM audit_logs a LEFT JOIN users u ON u.id=a.actor_id
    WHERE a.entity_type='record' AND a.entity_id=? ORDER BY a.created_at DESC`, [c.req.param('id')]);
  return ok(c, rows.map((row) => ({ id: String(row.id), requestId: String(row.request_id), actorId: row.actor_id ? String(row.actor_id) : null,
    actorName: String(row.actor_name ?? '系统'), action: String(row.action), entityType: String(row.entity_type), entityId: String(row.entity_id),
    subjectType: row.subject_type, subjectId: row.subject_id, before: parseJson(row.before_json), after: parseJson(row.after_json), createdAt: String(row.created_at) })));
});

const legacyWriteClosed = async (): Promise<never> => {
  throw new ApiError(410, 'LEGACY_RECORD_WRITE_CLOSED', '旧单工序写接口已关闭，请使用 /api/v1/lifecycle-records');
};
recordRoutes.post('/', legacyWriteClosed);
recordRoutes.patch('/:id', legacyWriteClosed);
recordRoutes.delete('/:id', legacyWriteClosed);
recordRoutes.post('/:id/restore', legacyWriteClosed);
