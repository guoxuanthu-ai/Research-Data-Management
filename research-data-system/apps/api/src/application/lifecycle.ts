import { randomUUID } from 'node:crypto';
import type {
  CurrentUserDto, LifecycleCreateInput, LifecycleRecordDto, LifecycleUpdateInput, ProcessStructure,
  RecordDto, StageKey, SubjectType, TemplateDto,
} from '@rds/shared';
import { badRequest, conflict, notFound } from '../http/errors.js';
import { execute, one, query, type Db, type Row } from '../infrastructure/db/client.js';
import { validateValues } from '../infrastructure/core.js';
import { assertCreator, audit, findSubject, mapRecord, parseJson, recordSelect } from './common.js';

const PROCESS_IDS: Record<string, StageKey> = {
  '00000000-0000-4000-8000-000000000101': 'powder',
  '00000000-0000-4000-8000-000000000102': 'pressing',
  '00000000-0000-4000-8000-000000000103': 'heat_treatment',
};

export function stageForProcess(process: { id?: string; processDefId?: string | null | undefined; name: string }): StageKey | null {
  const mapped = process.processDefId ? PROCESS_IDS[process.processDefId] : undefined;
  if (mapped) return mapped;
  if (process.name === '粉料' || process.name === '造粒') return 'powder';
  if (process.name === '压制') return 'pressing';
  if (process.name === '热处理' || process.name === '烧结') return 'heat_treatment';
  return process.id ? `custom:${process.id}` : null;
}

export async function loadTemplate(id: string, db?: Db): Promise<TemplateDto> {
  const row = await one<Row[]>('SELECT * FROM templates WHERE id=? AND deleted_at IS NULL', [id], db);
  if (!row) throw notFound('模板不存在');
  const processRows = await query<Row[]>('SELECT * FROM template_processes WHERE template_id=? ORDER BY sort_order,created_at', [id], db);
  const processes: ProcessStructure[] = [];
  for (const process of processRows) {
    const fields = await query<Row[]>('SELECT * FROM template_fields WHERE template_process_id=? ORDER BY sort_order,created_at', [process.id], db);
    processes.push({ id: String(process.id), processDefId: process.process_def_id ? String(process.process_def_id) : null,
      name: String(process.name), sortOrder: Number(process.sort_order), fields: fields.map((field) => ({
        id: String(field.id), name: String(field.name), unit: String(field.unit), valueType: field.value_type,
        required: Boolean(field.required), minValue: field.min_value === null ? null : Number(field.min_value),
        maxValue: field.max_value === null ? null : Number(field.max_value), sortOrder: Number(field.sort_order),
      })) });
  }
  return { id: String(row.id), name: String(row.name), description: String(row.description), status: row.status,
    version: Number(row.version), processes, createdBy: String(row.created_by), createdAt: String(row.created_at), updatedAt: String(row.updated_at) };
}

export function lifecycleProcesses(template: TemplateDto): Partial<Record<StageKey, ProcessStructure>> {
  const result: Partial<Record<StageKey, ProcessStructure>> = {};
  for (const process of template.processes) {
    const stage = stageForProcess(process);
    if (!stage) continue;
    if (result[stage]) throw badRequest(`模板存在重复的${stage}阶段`);
    result[stage] = process;
  }
  return result;
}

export function assertLifecycleTemplate(template: TemplateDto): Partial<Record<StageKey, ProcessStructure>> {
  const processes = lifecycleProcesses(template);
  if (!Object.keys(processes).length) throw badRequest('主体模板必须至少包含一个实际工序');
  return processes;
}

function lifecycleRecord(row: Row, record: RecordDto, process: ProcessStructure, template: TemplateDto): RecordDto {
  const snapshots = (Array.isArray(row.fields_json) ? row.fields_json : parseJson(row.fields_json)) as Array<{ id: string; sourceTemplateFieldId: string | null }>;
  const sourceBySnapshot = new Map(snapshots.map((field) => [field.id, field.sourceTemplateFieldId]));
  return {
    ...record,
    processDefId: process.processDefId ?? null,
    processName: process.name,
    processSort: process.sortOrder,
    sourceTemplateId: template.id,
    sourceTemplateVersion: template.version,
    fields: process.fields,
    values: record.values.flatMap((value) => {
      const source = sourceBySnapshot.get(value.fieldId);
      return source ? [{ fieldId: source, value: value.value }] : [];
    }),
  };
}

export async function findLifecycle(id: string, db?: Db, includeDeleted = false): Promise<LifecycleRecordDto> {
  const row = await one<Row[]>(`SELECT l.*,u.display_name AS creator_name FROM lifecycle_records l JOIN users u ON u.id=l.created_by
    WHERE l.id=? ${includeDeleted ? '' : 'AND l.deleted_at IS NULL'}`, [id], db);
  if (!row) throw notFound('生命周期记录不存在');
  const subject = await findSubject(row.subject_type, String(row.subject_id), db, true);
  const template = await loadTemplate(subject.templateId, db);
  const processes = lifecycleProcesses(template);
  const records = await query<Row[]>(`${recordSelect} WHERE r.lifecycle_id=? AND r.stage_key IS NOT NULL
    ${includeDeleted ? '' : 'AND r.deleted_at IS NULL'} ORDER BY r.process_sort,r.created_at`, [id], db);
  const stages: LifecycleRecordDto['stages'] = {};
  for (const recordRow of records) {
    const stage = recordRow.stage_key as StageKey;
    const process = processes[stage];
    if (!process) continue;
    stages[stage] = lifecycleRecord(recordRow, mapRecord(recordRow), process, template);
  }
  return {
    id: String(row.id), recordNo: Number(row.record_no), subjectType: row.subject_type, subjectId: String(row.subject_id),
    version: Number(row.version), createdBy: String(row.created_by), creatorName: String(row.creator_name),
    createdAt: String(row.created_at), updatedAt: String(row.updated_at), deletedAt: row.deleted_at ? String(row.deleted_at) : null,
    stages,
  };
}

export async function listLifecycles(type: SubjectType, subjectId: string, db?: Db, includeDeleted = false): Promise<LifecycleRecordDto[]> {
  const rows = await query<Row[]>(`SELECT id FROM lifecycle_records WHERE subject_type=? AND subject_id=?
    ${includeDeleted ? '' : 'AND deleted_at IS NULL'} ORDER BY record_no`, [type, subjectId], db);
  return Promise.all(rows.map((row) => findLifecycle(String(row.id), db, includeDeleted)));
}

type ActorContext = { actor: CurrentUserDto; requestId: string };

async function writeStage(lifecycleId: string, stage: LifecycleCreateInput['stages'][number], process: ProcessStructure,
  template: TemplateDto, subjectType: SubjectType, subjectId: string, actorId: string, db: Db): Promise<void> {
  const issues = await validateValues(process.fields, stage.values);
  const errors = issues.filter((issue) => issue.severity !== 'warning');
  if (errors.length) throw badRequest(`${process.name}阶段记录值校验失败`, errors);
  const valueMap = new Map(stage.values.map((value) => [value.fieldId, value.value.trim()]));
  const existing = await one<Row[]>('SELECT id FROM records WHERE lifecycle_id=? AND stage_key=? AND deleted_at IS NULL FOR UPDATE', [lifecycleId, stage.stageKey], db);
  const recordId = existing ? String(existing.id) : randomUUID();
  if (existing) {
    await execute(`UPDATE records SET process_def_id=?,process_name=?,process_sort=?,source_template_id=?,source_template_version=?,
      updated_by=?,version=version+1 WHERE id=?`, [process.processDefId ?? null, process.name, process.sortOrder,
      template.id, template.version, actorId, recordId], db);
    await execute('DELETE FROM record_fields WHERE record_id=?', [recordId], db);
  } else {
    await execute(`INSERT INTO records(id,lifecycle_id,stage_key,subject_type,subject_id,process_def_id,process_name,process_sort,
      source_template_id,source_template_version,created_by,updated_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    [recordId, lifecycleId, stage.stageKey, subjectType, subjectId, process.processDefId ?? null, process.name, process.sortOrder,
      template.id, template.version, actorId, actorId], db);
  }
  for (const field of process.fields) {
    const recordFieldId = randomUUID();
    await execute(`INSERT INTO record_fields(id,record_id,source_template_field_id,name,unit,value_type,required,min_value,max_value,sort_order)
      VALUES (?,?,?,?,?,?,?,?,?,?)`, [recordFieldId, recordId, field.id, field.name, field.unit, field.valueType,
      field.required, field.minValue, field.maxValue, field.sortOrder], db);
    const value = valueMap.get(field.id);
    if (!value) continue;
    await execute(`INSERT INTO record_values(id,record_id,record_field_id,raw_value,value_number,value_text,value_date,entered_by,updated_by)
      VALUES (?,?,?,?,?,?,?,?,?)`, [randomUUID(), recordId, recordFieldId, value,
      field.valueType === 'number' ? Number(value) : null, field.valueType === 'text' ? value : null,
      field.valueType === 'date' ? value : null, actorId, actorId], db);
  }
}

function validateInput(input: LifecycleCreateInput | LifecycleUpdateInput): void {
  if (!input.stages.some((stage) => stage.values.some((value) => value.value.trim()))) throw badRequest('至少一个阶段必须包含有值字段');
}

export async function createLifecycle(input: LifecycleCreateInput, context: ActorContext, db: Db): Promise<LifecycleRecordDto> {
  validateInput(input);
  const subject = await findSubject(input.subjectType, input.subjectId, db, false, true);
  const template = await loadTemplate(subject.templateId, db);
  const processes = assertLifecycleTemplate(template);
  const id = randomUUID();
  const sequence = await one<Row[]>('SELECT COALESCE(MAX(record_no),0)+1 AS next_no FROM lifecycle_records WHERE subject_type=? AND subject_id=?',
    [input.subjectType, input.subjectId], db);
  await execute(`INSERT INTO lifecycle_records(id,subject_type,subject_id,record_no,created_by,updated_by)
    VALUES (?,?,?,?,?,?)`, [id, input.subjectType, input.subjectId, Number(sequence?.next_no ?? 1), context.actor.id, context.actor.id], db);
  for (const stage of input.stages) {
    const process = processes[stage.stageKey];
    if (!process) throw badRequest('阶段不属于主体模板');
    await writeStage(id, stage, process, template, input.subjectType, input.subjectId, context.actor.id, db);
  }
  const after = await findLifecycle(id, db);
  await audit(db, { requestId: context.requestId, actorId: context.actor.id, action: 'create', entityType: 'lifecycle_record', entityId: id,
    subjectType: input.subjectType, subjectId: input.subjectId, after });
  return after;
}

export async function updateLifecycle(id: string, input: LifecycleUpdateInput, context: ActorContext, db: Db): Promise<LifecycleRecordDto> {
  validateInput(input);
  const before = await findLifecycle(id, db);
  if (before.subjectType !== input.subjectType || before.subjectId !== input.subjectId) throw badRequest('不能修改记录所属产品或实验');
  assertCreator(context.actor, before.createdBy);
  const subject = await findSubject(before.subjectType, before.subjectId, db, false, true);
  const template = await loadTemplate(subject.templateId, db);
  const processes = assertLifecycleTemplate(template);
  const result = await execute('UPDATE lifecycle_records SET updated_by=?,version=version+1 WHERE id=? AND version=? AND deleted_at IS NULL',
    [context.actor.id, id, input.version], db);
  if (!result.affectedRows) throw conflict('生命周期记录已被他人更新', 'VERSION_CONFLICT');
  for (const stage of input.stages) {
    const process = processes[stage.stageKey];
    if (!process) throw badRequest('阶段不属于主体模板');
    await writeStage(id, stage, process, template, before.subjectType, before.subjectId, context.actor.id, db);
  }
  const after = await findLifecycle(id, db);
  await audit(db, { requestId: context.requestId, actorId: context.actor.id, action: 'update', entityType: 'lifecycle_record', entityId: id,
    subjectType: before.subjectType, subjectId: before.subjectId, before, after });
  return after;
}
