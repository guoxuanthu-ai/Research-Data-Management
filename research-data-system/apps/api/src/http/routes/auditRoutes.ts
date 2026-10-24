import { Hono } from 'hono';
import { z } from 'zod';
import { requireAuth, requireRole } from '../middlewares/auth.js';
import { body, query } from '../validate.js';
import { ok } from '../responders.js';
import { notFound } from '../errors.js';
import { execute, one, query as select, type Row } from '../../infrastructure/db/client.js';
import { page, parseJson } from '../../application/common.js';
import type { AppEnv } from '../types.js';

export const auditRoutes = new Hono<AppEnv>();
auditRoutes.use('*', requireAuth, requireRole('director','supervisor'));
auditRoutes.get('/', async (c) => {
  const q = query(c, z.object({ page: z.coerce.number().optional(), pageSize: z.coerce.number().optional(),
    actorId: z.string().optional(), action: z.string().optional(), entityType: z.string().optional(), entityId: z.string().optional(),
    subjectType: z.enum(['product','experiment']).optional(), subjectId: z.string().optional(), dateFrom: z.string().optional(), dateTo: z.string().optional() }));
  const where: string[] = [];
  const params: unknown[] = [];
  for (const [key, column] of [['actorId','a.actor_id'],['action','a.action'],['entityType','a.entity_type'],['entityId','a.entity_id'],['subjectType','a.subject_type'],['subjectId','a.subject_id']] as const) {
    const value = q[key]; if (value) { where.push(`${column}=?`); params.push(value); }
  }
  if (q.dateFrom) { where.push('a.created_at>=?'); params.push(`${q.dateFrom} 00:00:00`); }
  if (q.dateTo) { where.push('a.created_at<=?'); params.push(`${q.dateTo} 23:59:59.999`); }
  const condition = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const paging = page(q);
  const total = await one<Row[]>(`SELECT COUNT(*) AS count FROM audit_logs a ${condition}`, params);
  const rows = await select<Row[]>(`SELECT a.*,u.display_name AS actor_name FROM audit_logs a LEFT JOIN users u ON u.id=a.actor_id
    ${condition} ORDER BY a.created_at DESC LIMIT ? OFFSET ?`, [...params, paging.pageSize, paging.offset]);
  return ok(c, { items: rows.map((row) => ({ id: String(row.id), requestId: String(row.request_id), actorId: row.actor_id ? String(row.actor_id) : null,
    actorName: String(row.actor_name ?? '系统'), action: String(row.action), entityType: String(row.entity_type), entityId: String(row.entity_id),
    subjectType: row.subject_type, subjectId: row.subject_id, before: parseJson(row.before_json), after: parseJson(row.after_json), createdAt: String(row.created_at) })),
  total: Number(total?.count ?? 0), page: paging.page, pageSize: paging.pageSize });
});

auditRoutes.post('/batch-delete', requireRole('director'), async (c) => {
  const input = await body(c, z.object({
    ids: z.array(z.string().min(1)).min(1).max(100).transform((ids) => [...new Set(ids)]),
  }));
  const result = await execute('DELETE FROM audit_logs WHERE id IN (?)', [input.ids]);
  return ok(c, { deletedCount: result.affectedRows });
});

auditRoutes.delete('/:id', requireRole('director'), async (c) => {
  const result = await execute('DELETE FROM audit_logs WHERE id=?', [c.req.param('id')]);
  if (!result.affectedRows) throw notFound('审计日志不存在');
  return ok(c, { success: true });
});
