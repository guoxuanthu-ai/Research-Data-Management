import { randomUUID } from 'node:crypto';
import { Hono } from 'hono';
import { z } from 'zod';
import { templateInputSchema, type FieldDefinition, type ProcessStructure, type TemplateInput } from '@rds/shared';
import { body } from '../validate.js';
import { badRequest, conflict, isDuplicate } from '../errors.js';
import { ok } from '../responders.js';
import { requireAuth, requireRole } from '../middlewares/auth.js';
import { idempotent } from '../middlewares/idempotency.js';
import { execute, one, query, withTransaction, type Db, type Row } from '../../infrastructure/db/client.js';
import { validateValues } from '../../infrastructure/core.js';
import { audit, findRecord } from '../../application/common.js';
import { loadTemplate, stageForProcess } from '../../application/lifecycle.js';
import type { AppEnv } from '../types.js';

export const templateRoutes = new Hono<AppEnv>();
templateRoutes.use('*', requireAuth);

function validateStructure(input: TemplateInput): void {
  const processNames = new Set<string>();
  const processIds = new Set<string>();
  const fieldIds = new Set<string>();
  for (const process of input.processes) {
    if (processNames.has(process.name)) throw badRequest(`工序“${process.name}”重复`);
    if (processIds.has(process.id)) throw badRequest('工序 ID 重复');
    processNames.add(process.name);
    processIds.add(process.id);
    const fieldNames = new Set<string>();
    for (const field of process.fields) {
      if (fieldNames.has(field.name)) throw badRequest(`工序“${process.name}”中的字段“${field.name}”重复`);
      if (fieldIds.has(field.id)) throw badRequest('字段 ID 重复');
      fieldNames.add(field.name);
      fieldIds.add(field.id);
      if (field.minValue !== null && field.maxValue !== null && field.minValue > field.maxValue) throw badRequest(`字段“${field.name}”的最小值不能大于最大值`);
    }
  }
}

async function insertProcess(templateId: string, process: TemplateInput['processes'][number], db: Db): Promise<void> {
  await execute('INSERT INTO template_processes(id,template_id,process_def_id,name,sort_order) VALUES (?,?,?,?,?)',
    [process.id, templateId, process.processDefId ?? null, process.name, process.sortOrder], db);
}

async function insertField(processId: string, field: FieldDefinition, db: Db): Promise<void> {
  await execute(`INSERT INTO template_fields(id,template_process_id,name,unit,value_type,required,min_value,max_value,sort_order)
    VALUES (?,?,?,?,?,?,?,?,?)`, [field.id, processId, field.name, field.unit, field.valueType, field.required,
    field.minValue, field.maxValue, field.sortOrder], db);
}

async function insertStructure(id: string, processes: TemplateInput['processes'], db: Db): Promise<void> {
  for (const process of processes) {
    await insertProcess(id, process, db);
    for (const field of process.fields) await insertField(process.id, field, db);
  }
}

async function validateHistoricalValues(field: FieldDefinition, previous: FieldDefinition, db: Db): Promise<void> {
  if (field.valueType === previous.valueType && field.required === previous.required
    && field.minValue === previous.minValue && field.maxValue === previous.maxValue) return;
  const rows = await query<Row[]>(`SELECT rv.raw_value FROM record_values rv JOIN record_fields rf ON rf.id=rv.record_field_id
    WHERE rf.source_template_field_id=? AND rv.raw_value<>''`, [previous.id], db);
  for (const row of rows) {
    const issues = await validateValues([field], [{ fieldId: field.id, value: String(row.raw_value) }]);
    if (issues.some((issue) => issue.severity !== 'warning')) {
      throw badRequest(`字段“${field.name}”的定义变更与历史值不兼容`, issues.filter((issue) => issue.severity !== 'warning'));
    }
  }
}

async function syncStructure(templateId: string, input: TemplateInput, beforeProcesses: ProcessStructure[], db: Db): Promise<void> {
  const beforeProcessMap = new Map(beforeProcesses.map((process) => [process.id, process]));
  const inputProcessIds = new Set(input.processes.map((process) => process.id));
  const inputFields = new Map(input.processes.flatMap((process) => process.fields.map((field) => [field.id, { field, process }])));
  const beforeFieldMap = new Map(beforeProcesses.flatMap((process) => process.fields.map((field) => [field.id, { field, process }])));

  for (const [fieldId, previous] of beforeFieldMap) {
    const next = inputFields.get(fieldId);
    if (next && next.process.id !== previous.process.id) throw badRequest('字段不能移动到另一个工序');
    if (next) await validateHistoricalValues(next.field, previous.field, db);
    if (!next) {
      await execute('DELETE FROM record_fields WHERE source_template_field_id=?', [fieldId], db);
      await execute('DELETE FROM template_fields WHERE id=?', [fieldId], db);
    }
  }
  for (const process of beforeProcesses) {
    if (inputProcessIds.has(process.id)) continue;
    const stage = stageForProcess(process);
    if (stage) await execute('DELETE FROM records WHERE source_template_id=? AND stage_key=?', [templateId, stage], db);
    await execute('DELETE FROM template_processes WHERE id=? AND template_id=?', [process.id, templateId], db);
  }

  for (const process of input.processes) {
    const previous = beforeProcessMap.get(process.id);
    if (previous) {
      const previousStage = stageForProcess(previous);
      const nextStage = stageForProcess({ ...process, processDefId: process.processDefId ?? null });
      if (previousStage && nextStage && previousStage !== nextStage) {
        await execute('UPDATE records SET stage_key=? WHERE source_template_id=? AND stage_key=?', [nextStage, templateId, previousStage], db);
      }
      await execute('UPDATE template_processes SET process_def_id=?,name=?,sort_order=? WHERE id=? AND template_id=?',
        [process.processDefId ?? null, process.name, process.sortOrder, process.id, templateId], db);
    } else {
      const owned = await one<Row[]>('SELECT id FROM template_processes WHERE id=?', [process.id], db);
      if (owned) throw badRequest('工序 ID 已属于其他模板');
      await insertProcess(templateId, process, db);
    }
    const previousFieldIds = new Set(previous?.fields.map((field) => field.id) ?? []);
    for (const field of process.fields) {
      if (previousFieldIds.has(field.id)) {
        await execute(`UPDATE template_fields SET name=?,unit=?,value_type=?,required=?,min_value=?,max_value=?,sort_order=?
          WHERE id=? AND template_process_id=?`, [field.name, field.unit, field.valueType, field.required, field.minValue,
          field.maxValue, field.sortOrder, field.id, process.id], db);
      } else {
        const owned = await one<Row[]>('SELECT id FROM template_fields WHERE id=?', [field.id], db);
        if (owned) throw badRequest('字段 ID 已属于其他模板');
        await insertField(process.id, field, db);
        const stage = stageForProcess({ ...process, processDefId: process.processDefId ?? null });
        if (stage) {
          await execute(`INSERT INTO record_fields(id,record_id,source_template_field_id,name,unit,value_type,required,min_value,max_value,sort_order)
            SELECT UUID(),r.id,?,?,?,?,?,?,?,? FROM records r WHERE r.source_template_id=? AND r.stage_key=?
            AND NOT EXISTS(SELECT 1 FROM record_fields rf WHERE rf.record_id=r.id AND rf.source_template_field_id=?)`,
          [field.id, field.name, field.unit, field.valueType, field.required, field.minValue, field.maxValue, field.sortOrder,
            templateId, stage, field.id], db);
        }
      }
      await execute(`UPDATE record_fields SET name=?,unit=?,value_type=?,required=?,min_value=?,max_value=?,sort_order=?
        WHERE source_template_field_id=?`, [field.name, field.unit, field.valueType, field.required, field.minValue,
        field.maxValue, field.sortOrder, field.id], db);
    }
  }
}

templateRoutes.get('/', async (c) => {
  const includeDisabled = c.req.query('includeDisabled') === 'true' && c.get('user').role !== 'engineer';
  const rows = await query<Row[]>(`SELECT id FROM templates WHERE deleted_at IS NULL ${includeDisabled ? '' : "AND status='active'"} ORDER BY name`);
  return ok(c, await Promise.all(rows.map((row) => loadTemplate(String(row.id)))));
});
templateRoutes.get('/:id', async (c) => ok(c, await loadTemplate(c.req.param('id'))));

templateRoutes.post('/', requireRole('director','supervisor'), idempotent, async (c) => {
  const input = await body(c, templateInputSchema);
  validateStructure(input);
  const id = randomUUID();
  try {
    await withTransaction(async (tx) => {
      await execute('INSERT INTO templates(id,name,description,created_by,updated_by) VALUES (?,?,?,?,?)',
        [id, input.name, input.description, c.get('user').id, c.get('user').id], tx);
      await insertStructure(id, input.processes, tx);
      await audit(tx, { requestId: c.get('requestId'), actorId: c.get('user').id, action: 'create', entityType: 'template', entityId: id, after: input });
    });
  } catch (error) { if (isDuplicate(error)) throw conflict('模板名称或结构名称重复'); throw error; }
  return ok(c, await loadTemplate(id), 201);
});

templateRoutes.patch('/:id', requireRole('director','supervisor'), async (c) => {
  const input = await body(c, templateInputSchema);
  validateStructure(input);
  if (!input.version) throw conflict('更新必须提供 version', 'VERSION_CONFLICT');
  const before = await loadTemplate(c.req.param('id'));
  try {
    await withTransaction(async (tx) => {
      const result = await execute('UPDATE templates SET name=?,description=?,updated_by=?,version=version+1 WHERE id=? AND version=? AND deleted_at IS NULL',
        [input.name, input.description, c.get('user').id, before.id, input.version], tx);
      if (!result.affectedRows) throw conflict('模板已被他人更新', 'VERSION_CONFLICT');
      await syncStructure(before.id, input, before.processes, tx);
      await execute('UPDATE records SET source_template_version=? WHERE source_template_id=?', [before.version + 1, before.id], tx);
      const after = await loadTemplate(before.id, tx);
      await audit(tx, { requestId: c.get('requestId'), actorId: c.get('user').id, action: 'update', entityType: 'template', entityId: before.id, before, after });
    });
  } catch (error) { if (isDuplicate(error)) throw conflict('模板名称或结构名称重复'); throw error; }
  return ok(c, await loadTemplate(before.id));
});

templateRoutes.post('/:id/status', requireRole('director','supervisor'), async (c) => {
  const input = await body(c, z.object({ status: z.enum(['active','disabled']), version: z.number().int().positive() }));
  const before = await loadTemplate(c.req.param('id'));
  await withTransaction(async (tx) => {
    const result = await execute('UPDATE templates SET status=?,updated_by=?,version=version+1 WHERE id=? AND version=?',
      [input.status, c.get('user').id, before.id, input.version], tx);
    if (!result.affectedRows) throw conflict('模板已被他人更新', 'VERSION_CONFLICT');
    await audit(tx, { requestId: c.get('requestId'), actorId: c.get('user').id, action: 'update', entityType: 'template', entityId: before.id, before, after: { status: input.status } });
  });
  return ok(c, await loadTemplate(before.id));
});

templateRoutes.delete('/:id', requireRole('director','supervisor'), async (c) => {
  const input = await body(c, z.object({ version: z.number().int().positive() }));
  const before = await loadTemplate(c.req.param('id'));
  await withTransaction(async (tx) => {
    await one<Row[]>('SELECT id FROM templates WHERE id=? FOR UPDATE', [before.id], tx);
    const used = await one<Row[]>(`SELECT (SELECT COUNT(*) FROM products WHERE template_id=? AND deleted_at IS NULL)+
      (SELECT COUNT(*) FROM experiments WHERE template_id=? AND deleted_at IS NULL) AS count`, [before.id, before.id], tx);
    if (Number(used?.count ?? 0)) throw conflict('模板已被产品或实验使用，不能删除', 'TEMPLATE_IN_USE');
    const result = await execute(`UPDATE templates SET deleted_at=UTC_TIMESTAMP(3),deleted_by=?,updated_by=?,version=version+1
      WHERE id=? AND version=? AND deleted_at IS NULL`, [c.get('user').id, c.get('user').id, before.id, input.version], tx);
    if (!result.affectedRows) throw conflict('模板已被他人更新', 'VERSION_CONFLICT');
    await audit(tx, { requestId: c.get('requestId'), actorId: c.get('user').id, action: 'delete', entityType: 'template', entityId: before.id, before });
  });
  return ok(c, { success: true });
});

templateRoutes.post('/from-record', requireRole('director','supervisor'), idempotent, async (c) => {
  const input = await body(c, z.object({ recordId: z.string(), name: z.string().trim().min(1).max(100), description: z.string().max(500).default('') }));
  const record = await findRecord(input.recordId);
  const id = randomUUID();
  const process: ProcessStructure = { id: randomUUID(), processDefId: record.processDefId, name: record.processName,
    sortOrder: record.processSort, fields: record.fields };
  try {
    await withTransaction(async (tx) => {
      await execute('INSERT INTO templates(id,name,description,created_by,updated_by) VALUES (?,?,?,?,?)',
        [id, input.name, input.description, c.get('user').id, c.get('user').id], tx);
      await insertStructure(id, [process], tx);
      await audit(tx, { requestId: c.get('requestId'), actorId: c.get('user').id, action: 'create', entityType: 'template', entityId: id,
        subjectType: record.subjectType, subjectId: record.subjectId, after: { sourceRecordId: record.id, name: input.name } });
    });
  } catch (error) { if (isDuplicate(error)) throw conflict('模板名称已存在'); throw error; }
  return ok(c, await loadTemplate(id));
});
