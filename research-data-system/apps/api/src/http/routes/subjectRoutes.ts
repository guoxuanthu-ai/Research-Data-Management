import { randomUUID } from 'node:crypto';
import { Hono } from 'hono';
import { z } from 'zod';
import { subjectInputSchema, type SubjectType } from '@rds/shared';
import { body, query, versionFromRequest } from '../validate.js';
import { ok } from '../responders.js';
import { badRequest, conflict, forbidden, isDuplicate } from '../errors.js';
import { requireAuth, requireRole } from '../middlewares/auth.js';
import { idempotent } from '../middlewares/idempotency.js';
import { execute, one, query as select, withTransaction, type Row } from '../../infrastructure/db/client.js';
import { experimentNumber } from '../../infrastructure/core.js';
import { assertCreator, audit, findSubject, listRecordsForSubject, mapSubject, page } from '../../application/common.js';
import { assertLifecycleTemplate, listLifecycles, loadTemplate } from '../../application/lifecycle.js';
import type { AppContext, AppEnv } from '../types.js';

export const subjectRoutes = new Hono<AppEnv>();
subjectRoutes.use('*', requireAuth);

const listSchema = z.object({
  page: z.coerce.number().optional(), pageSize: z.coerce.number().optional(), q: z.string().optional(),
  keyword: z.string().optional(), code: z.string().optional(), ownerId: z.string().optional(),
  dateFrom: z.string().optional(), dateTo: z.string().optional(), startDate: z.string().optional(), endDate: z.string().optional(),
  includeDeleted: z.enum(['true','false']).optional(),
});

function config(type: SubjectType) {
  return type === 'product'
    ? { table: 'products', code: 'product_code', date: "DATE_FORMAT(s.created_at,'%Y-%m-%d')" }
    : { table: 'experiments', code: 'experiment_no', date: 's.experiment_date' };
}

function filters(c: AppContext, type: SubjectType): { condition: string; params: unknown[] } {
  const q = query(c, listSchema);
  const cfg = config(type);
  const where: string[] = [];
  const params: unknown[] = [];
  if (q.includeDeleted === 'true') {
    if (c.get('user').role === 'engineer') throw forbidden();
  } else where.push('s.deleted_at IS NULL');
  const keyword = q.q ?? q.keyword;
  if (keyword) { where.push(`(s.name LIKE ? OR s.${cfg.code} LIKE ?)`); params.push(`%${keyword}%`, `%${keyword}%`); }
  if (q.code) { where.push(`s.${cfg.code} LIKE ?`); params.push(`%${q.code}%`); }
  if (q.ownerId) { where.push('s.owner_id=?'); params.push(q.ownerId); }
  const from = q.dateFrom ?? q.startDate;
  const to = q.dateTo ?? q.endDate;
  if (type === 'experiment' && from) { where.push('s.experiment_date>=?'); params.push(from); }
  if (type === 'experiment' && to) { where.push('s.experiment_date<=?'); params.push(to); }
  return { condition: where.length ? `WHERE ${where.join(' AND ')}` : '', params };
}

async function listSubjects(c: AppContext, type: SubjectType, unlimited = false): Promise<unknown> {
  const q = query(c, listSchema);
  const paging = page(q);
  const { condition, params } = filters(c, type);
  const cfg = config(type);
  const from = `FROM ${cfg.table} s JOIN users owner ON owner.id=s.owner_id JOIN users creator ON creator.id=s.created_by JOIN templates t ON t.id=s.template_id ${condition}`;
  const columns = `SELECT s.*,s.${cfg.code} AS code,${cfg.date} AS business_date,owner.display_name AS owner_name,creator.display_name AS creator_name,
    t.name AS template_name,t.version AS template_version,
    (SELECT COUNT(*) FROM lifecycle_records l WHERE l.subject_type='${type}' AND l.subject_id=s.id AND l.deleted_at IS NULL) AS record_count`;
  if (unlimited) {
    const rows = await select<Row[]>(`${columns} ${from} ORDER BY s.created_at DESC LIMIT 5000`, params);
    return rows.map((row) => mapSubject(row, type));
  }
  const total = await one<Row[]>(`SELECT COUNT(*) AS count ${from}`, params);
  const rows = await select<Row[]>(`${columns} ${from} ORDER BY s.created_at DESC LIMIT ? OFFSET ?`, [...params, paging.pageSize, paging.offset]);
  return { items: rows.map((row) => mapSubject(row, type)), total: Number(total?.count ?? 0), page: paging.page, pageSize: paging.pageSize };
}

for (const type of ['product', 'experiment'] as const) {
  const base = type === 'product' ? '/products' : '/experiments';
  subjectRoutes.get(base, async (c) => ok(c, await listSubjects(c, type)));
  subjectRoutes.post(base, idempotent, async (c) => {
    const input = await body(c, subjectInputSchema);
    const id = randomUUID();
    const actor = c.get('user');
    const code = type === 'product' ? (input.code || `PRD-${randomUUID().slice(0, 8).toUpperCase()}`) : '';
    const date = input.date ?? new Date().toISOString().slice(0, 10);
    try {
      await withTransaction(async (tx) => {
        const owner = await one<Row[]>("SELECT id FROM users WHERE id=? AND status='active' AND deleted_at IS NULL", [input.ownerId], tx);
        if (!owner) throw conflict('负责人不存在或已停用');
        const template = await loadTemplate(input.templateId, tx);
        if (template.status !== 'active') throw badRequest('主体模板已停用');
        assertLifecycleTemplate(template);
        let experimentCode = code;
        if (type === 'experiment') {
          await execute('INSERT INTO experiment_sequences(seq_date,last_seq) VALUES (?,1) ON DUPLICATE KEY UPDATE last_seq=last_seq+1', [date], tx);
          const sequence = await one<Row[]>('SELECT last_seq FROM experiment_sequences WHERE seq_date=? FOR UPDATE', [date], tx);
          experimentCode = await experimentNumber(date, Number(sequence?.last_seq ?? 1));
        }
        if (type === 'product') {
          await execute('INSERT INTO products(id,product_code,name,template_id,owner_id,remark,created_by,updated_by) VALUES (?,?,?,?,?,?,?,?)',
            [id, experimentCode, input.name, input.templateId, input.ownerId, input.remark, actor.id, actor.id], tx);
        } else {
          await execute(`INSERT INTO experiments(id,experiment_no,name,template_id,purpose,owner_id,experiment_date,remark,created_by,updated_by)
            VALUES (?,?,?,?,?,?,?,?,?,?)`, [id, experimentCode, input.name, input.templateId, input.purpose, input.ownerId, date, input.remark, actor.id, actor.id], tx);
        }
        await audit(tx, { requestId: c.get('requestId'), actorId: actor.id, action: 'create', entityType: type, entityId: id,
          subjectType: type, subjectId: id, after: { ...input, code: experimentCode, date } });
      });
    } catch (error) {
      if (isDuplicate(error)) throw conflict(type === 'product' ? '产品型号已存在' : '实验编号冲突，请重试');
      throw error;
    }
    return ok(c, await findSubject(type, id), 201);
  });
  subjectRoutes.get(`${base}/:id`, async (c) => {
    const includeDeleted = c.req.query('includeDeleted') === 'true';
    const subject = await findSubject(type, c.req.param('id'), undefined, includeDeleted);
    const [records, lifecycles, template] = await Promise.all([
      listRecordsForSubject(type, subject.id, undefined, includeDeleted),
      listLifecycles(type, subject.id, undefined, includeDeleted),
      loadTemplate(subject.templateId),
    ]);
    return ok(c, { ...subject, records, lifecycles, template });
  });
  subjectRoutes.patch(`${base}/:id`, async (c) => {
    const input = await body(c, subjectInputSchema);
    const version = input.version;
    if (!version) throw conflict('更新必须提供 version', 'VERSION_CONFLICT');
    const before = await findSubject(type, c.req.param('id'));
    if (input.templateId !== before.templateId) throw badRequest('主体创建后不得修改模板');
    assertCreator(c.get('user'), before.createdBy);
    await withTransaction(async (tx) => {
      const owner = await one<Row[]>("SELECT id FROM users WHERE id=? AND status='active' AND deleted_at IS NULL", [input.ownerId], tx);
      if (!owner) throw conflict('负责人不存在或已停用');
      const result = type === 'product'
        ? await execute(`UPDATE products SET product_code=?,name=?,owner_id=?,remark=?,updated_by=?,version=version+1 WHERE id=? AND version=? AND deleted_at IS NULL`,
          [input.code ?? before.code, input.name, input.ownerId, input.remark, c.get('user').id, before.id, version], tx)
        : await execute(`UPDATE experiments SET name=?,purpose=?,owner_id=?,experiment_date=?,remark=?,updated_by=?,version=version+1 WHERE id=? AND version=? AND deleted_at IS NULL`,
          [input.name, input.purpose, input.ownerId, input.date ?? before.date, input.remark, c.get('user').id, before.id, version], tx);
      if (!result.affectedRows) throw conflict('数据已被他人更新', 'VERSION_CONFLICT');
      const after = await findSubject(type, before.id, tx);
      await audit(tx, { requestId: c.get('requestId'), actorId: c.get('user').id, action: 'update', entityType: type, entityId: before.id,
        subjectType: type, subjectId: before.id, before, after });
    });
    return ok(c, await findSubject(type, before.id));
  });
  subjectRoutes.delete(`${base}/:id`, requireRole('director','supervisor'), async (c) => {
    let input: unknown; try { input = await c.req.json(); } catch { input = undefined; }
    const version = versionFromRequest(c, input);
    const before = await findSubject(type, c.req.param('id'));
    await withTransaction(async (tx) => {
      const cfg = config(type);
      const result = await execute(`UPDATE ${cfg.table} SET deleted_at=UTC_TIMESTAMP(3),deleted_by=?,version=version+1 WHERE id=? AND version=? AND deleted_at IS NULL`,
        [c.get('user').id, before.id, version], tx);
      if (!result.affectedRows) throw conflict('数据已被他人更新', 'VERSION_CONFLICT');
      await audit(tx, { requestId: c.get('requestId'), actorId: c.get('user').id, action: 'delete', entityType: type, entityId: before.id,
        subjectType: type, subjectId: before.id, before });
    });
    return ok(c, { success: true });
  });
  subjectRoutes.post(`${base}/:id/restore`, requireRole('director','supervisor'), async (c) => {
    const input = await body(c, z.object({ version: z.number().int().positive() }));
    const before = await findSubject(type, c.req.param('id'), undefined, true);
    if (!before.deletedAt) throw conflict('数据未被删除');
    await withTransaction(async (tx) => {
      const cfg = config(type);
      const result = await execute(`UPDATE ${cfg.table} SET deleted_at=NULL,deleted_by=NULL,version=version+1 WHERE id=? AND version=? AND deleted_at IS NOT NULL`,
        [before.id, input.version], tx);
      if (!result.affectedRows) throw conflict('数据已被他人更新', 'VERSION_CONFLICT');
      await execute('UPDATE templates SET deleted_at=NULL,deleted_by=NULL,updated_by=?,version=version+1 WHERE id=? AND deleted_at IS NOT NULL',
        [c.get('user').id, before.templateId], tx);
      const after = await findSubject(type, before.id, tx);
      await audit(tx, { requestId: c.get('requestId'), actorId: c.get('user').id, action: 'restore', entityType: type, entityId: before.id,
        subjectType: type, subjectId: before.id, before, after });
    });
    return ok(c, await findSubject(type, before.id));
  });
}

export async function exportableSubjects(c: AppContext, type: SubjectType): Promise<Awaited<ReturnType<typeof listSubjects>>> {
  return listSubjects(c, type, true);
}
