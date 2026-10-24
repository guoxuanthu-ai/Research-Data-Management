import { createHash, randomUUID } from 'node:crypto';
import { Hono } from 'hono';
import {
  confirmImportSchema, lifecycleCreateSchema, type FieldDefinition, type LifecycleCreateInput, type ProcessStructure, type RecordValueDto,
  type StageKey, type SubjectDetailDto, type SubjectDto, type SubjectType, type TemplateDto,
} from '@rds/shared';
import { env } from '../../config/env.js';
import { exportWorkbook, importWorkbook, validateValues } from '../../infrastructure/core.js';
import { decodeWorkbook, encodeWorkbook } from '../../infrastructure/excel/xlsxCodec.js';
import { execute, one, query, withTransaction, type Db, type Row } from '../../infrastructure/db/client.js';
import { ApiError, badRequest, conflict, forbidden, notFound } from '../errors.js';
import { body } from '../validate.js';
import { ok } from '../responders.js';
import { requireAuth } from '../middlewares/auth.js';
import { idempotent } from '../middlewares/idempotency.js';
import { audit, findSubject, listRecordsForSubject, parseJson } from '../../application/common.js';
import {
  assertLifecycleTemplate, createLifecycle, listLifecycles, loadTemplate, stageForProcess, updateLifecycle,
} from '../../application/lifecycle.js';
import { exportableSubjects } from './subjectRoutes.js';
import type { AppContext, AppEnv } from '../types.js';

export const importExportRoutes = new Hono<AppEnv>();
importExportRoutes.use('*', requireAuth);

type ImportPayload = {
  subject?: { code: string; name: string; templateId?: string; purpose?: string; ownerId?: string; ownerName?: string; date?: string; remark?: string };
  lifecycleId?: string | null;
  stageKey?: StageKey;
  fields?: FieldDefinition[];
  values?: RecordValueDto[];
};

function xlsxResponse(c: AppContext, buffer: Buffer, fileName: string): Response {
  c.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  c.header('Content-Disposition', `attachment; filename="export.xlsx"; filename*=UTF-8''${encodeURIComponent(fileName)}`);
  c.header('Content-Length', String(buffer.length));
  return c.body(new Uint8Array(buffer));
}

async function exportSubjects(c: AppContext, type: SubjectType, subjects: SubjectDto[]): Promise<Response> {
  const details: SubjectDetailDto[] = [];
  for (const subject of subjects) {
    const [records, lifecycles, template] = await Promise.all([
      listRecordsForSubject(type, subject.id), listLifecycles(type, subject.id), loadTemplate(subject.templateId),
    ]);
    details.push({ ...subject, records, lifecycles, template });
  }
  const canonicalFieldIds = new Map<string, string>();
  const normalizedDetails = details.map((detail) => ({ ...detail, records: detail.records.map((record) => {
    const fieldIds = new Map<string, string>();
    const fields = record.fields.map((field) => {
      const key = `${record.processName}\0${field.name.trim().toLocaleLowerCase()}\0${field.unit.trim()}`;
      let id = canonicalFieldIds.get(key);
      if (!id) { id = `export-field-${canonicalFieldIds.size + 1}`; canonicalFieldIds.set(key, id); }
      fieldIds.set(field.id, id);
      return { ...field, id };
    });
    return { ...record, fields, values: record.values.map((value) => ({ ...value, fieldId: fieldIds.get(value.fieldId) ?? value.fieldId })) };
  }) }));
  const model = await exportWorkbook(normalizedDetails);
  const buffer = encodeWorkbook(model);
  await audit((await import('../../infrastructure/db/client.js')).pool, {
    requestId: c.get('requestId'), actorId: c.get('user').id, action: 'export', entityType: type,
    entityId: subjects[0]?.id ?? '00000000-0000-0000-0000-000000000000', subjectType: type, subjectId: subjects[0]?.id ?? null,
    after: { filters: c.req.query(), subjectCount: subjects.length, recordCount: details.reduce((sum, detail) => sum + detail.lifecycles.length, 0) },
  });
  return xlsxResponse(c, buffer, `${type === 'product' ? '产品' : '实验'}-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

async function importProcesses(): Promise<ProcessStructure[]> {
  const rows = await query<Row[]>(`SELECT tp.id,tp.process_def_id,tp.name AS process_name,tp.sort_order AS process_sort,
    tf.id AS field_id,tf.name AS field_name,tf.unit,tf.value_type,tf.required,tf.min_value,tf.max_value,tf.sort_order AS field_sort
    FROM templates t JOIN template_processes tp ON tp.template_id=t.id
    JOIN template_fields tf ON tf.template_process_id=tp.id
    WHERE t.deleted_at IS NULL AND t.status='active' ORDER BY tp.template_id,tp.sort_order,tf.sort_order`);
  const processes = new Map<string, ProcessStructure>();
  for (const row of rows) {
    const process = processes.get(String(row.id)) ?? { id: String(row.id), processDefId: row.process_def_id ? String(row.process_def_id) : null,
      name: String(row.process_name), sortOrder: Number(row.process_sort), fields: [] };
    process.fields.push({ id: String(row.field_id), name: String(row.field_name), unit: String(row.unit), valueType: row.value_type,
      required: Boolean(row.required), minValue: row.min_value === null ? null : Number(row.min_value),
      maxValue: row.max_value === null ? null : Number(row.max_value), sortOrder: Number(row.field_sort) });
    processes.set(String(row.id), process);
  }
  return [...processes.values()];
}

async function importTemplate() {
  const model = await exportWorkbook([]);
  model.sheets[0]!.rows.push(['主体类型', ''], ['主体编号', ''], ['主体名称', ''], ['模板ID', ''], ['负责人', ''], ['日期', ''], ['目的', ''], ['备注', ''], []);
  const processes = await importProcesses();
  const seen = new Set<string>();
  for (const process of processes) {
    if (seen.has(process.name)) continue;
    seen.add(process.name);
    model.sheets.push({ name: process.name, rows: [['主体编号', '主体名称', '生命周期ID',
      ...process.fields.map((field) => field.unit ? `${field.name}（${field.unit}）` : field.name)]] });
  }
  return model;
}

for (const type of ['product','experiment'] as const) {
  const base = type === 'product' ? '/products' : '/experiments';
  importExportRoutes.get(`${base}/export`, async (c) => exportSubjects(c, type, await exportableSubjects(c, type) as SubjectDto[]));
  importExportRoutes.get(`${base}/:id/export`, async (c) => exportSubjects(c, type, [await findSubject(type, c.req.param('id'))]));
  importExportRoutes.get(`${base}/import/template`, async (c) => xlsxResponse(c, encodeWorkbook(await importTemplate()), `${type === 'product' ? '产品' : '实验'}导入模板.xlsx`));
  importExportRoutes.post(`${base}/import/preview`, async (c) => preview(c, type));
}
importExportRoutes.get('/import/template', async (c) => xlsxResponse(c, encodeWorkbook(await importTemplate()), '标准导入模板.xlsx'));

type PreviewRow = { id: string; sheetName: string; rowNo: number; subjectKey: string; processName: string;
  status: 'valid' | 'error'; errorMessage: string | null; payload: unknown };

async function defaultTemplate(db?: Db): Promise<TemplateDto> {
  const rows = await query<Row[]>(`SELECT id FROM templates WHERE deleted_at IS NULL AND status='active' AND name NOT LIKE '迁移模板-%' ORDER BY id`, [], db);
  const templates: TemplateDto[] = [];
  for (const row of rows) {
    const template = await loadTemplate(String(row.id), db);
    try { assertLifecycleTemplate(template); templates.push(template); } catch { }
  }
  if (templates.length !== 1) throw new ApiError(400, 'IMPORT_INVALID', '旧格式导入新主体时必须有且只有一个可用的主体模板，或在基本信息中填写模板ID');
  return templates[0]!;
}

async function candidateTemplate(type: SubjectType, code: string, requestedId: string, db?: Db): Promise<TemplateDto> {
  const table = type === 'product' ? 'products' : 'experiments';
  const column = type === 'product' ? 'product_code' : 'experiment_no';
  const subject = await one<Row[]>(`SELECT template_id FROM ${table} WHERE ${column}=? AND deleted_at IS NULL`, [code], db);
  if (subject) {
    if (requestedId && requestedId !== String(subject.template_id)) throw new ApiError(400, 'IMPORT_INVALID', `主体“${code}”的模板与文件不一致`);
    return loadTemplate(String(subject.template_id), db);
  }
  const template = requestedId ? await loadTemplate(requestedId, db) : await defaultTemplate(db);
  if (template.status !== 'active') throw new ApiError(400, 'IMPORT_INVALID', '导入模板已停用');
  assertLifecycleTemplate(template);
  return template;
}

async function preview(c: AppContext, subjectType: SubjectType): Promise<Response> {
  const length = Number(c.req.header('content-length') ?? 0);
  if (length > env.MAX_UPLOAD_MB * 1024 * 1024) throw new ApiError(400, 'IMPORT_INVALID', `文件不能超过 ${env.MAX_UPLOAD_MB} MB`);
  const form = await c.req.parseBody();
  const uploaded = form.file;
  if (!(uploaded instanceof File)) throw new ApiError(400, 'IMPORT_INVALID', '请使用 multipart 字段 file 上传 .xlsx 文件');
  if (!uploaded.name.toLowerCase().endsWith('.xlsx')) throw new ApiError(400, 'IMPORT_INVALID', '仅支持 .xlsx 文件');
  if (uploaded.size > env.MAX_UPLOAD_MB * 1024 * 1024) throw new ApiError(400, 'IMPORT_INVALID', `文件不能超过 ${env.MAX_UPLOAD_MB} MB`);
  const buffer = Buffer.from(await uploaded.arrayBuffer());
  const workbook = decodeWorkbook(buffer);
  let mapping;
  try { mapping = await importWorkbook(workbook, await importProcesses()); }
  catch (error) { if (error instanceof ApiError) throw error; throw new ApiError(400, 'IMPORT_INVALID', error instanceof Error ? error.message : '工作簿格式不符合导入规范'); }
  const rows: PreviewRow[] = [];
  const subjects = new Map(mapping.subjects.map((subject) => [subject.subjectKey, subject]));
  for (const subject of mapping.subjects) {
    const mismatch = subject.subjectType !== subjectType;
    rows.push({ id: randomUUID(), sheetName: '基本信息', rowNo: 1, subjectKey: subject.subjectKey, processName: '',
      status: mismatch ? 'error' : 'valid', errorMessage: mismatch ? '工作簿主体类型与导入入口不一致' : null,
      payload: { subject: { code: subject.subjectKey, name: subject.name, templateId: subject.templateId, ownerName: subject.ownerName, date: subject.date, purpose: subject.purpose, remark: subject.remark } } });
  }
  const seenStages = new Map<string, PreviewRow>();
  for (const candidate of mapping.candidates) {
    const subject = subjects.get(candidate.subjectKey)!;
    const basePayload: ImportPayload = { subject: { code: subject.subjectKey, name: subject.name, templateId: subject.templateId,
      ownerName: subject.ownerName, date: subject.date, purpose: subject.purpose, remark: subject.remark }, lifecycleId: candidate.lifecycleId };
    let status: PreviewRow['status'] = candidate.subjectType === subjectType ? 'valid' : 'error';
    let errorMessage = candidate.subjectType === subjectType ? null : '工作簿主体类型与导入入口不一致';
    try {
      const template = await candidateTemplate(subjectType, candidate.subjectKey, subject.templateId);
      assertLifecycleTemplate(template);
      const process = template.processes.find((item) => item.name === candidate.processName);
      const stage = process ? stageForProcess(process) : null;
      if (!stage || !process) throw new ApiError(400, 'IMPORT_INVALID', `工序“${candidate.processName}”不属于主体模板`);
      const targetByName = new Map(process.fields.map((field) => [field.name.trim().toLocaleLowerCase(), field]));
      const sourceById = new Map(candidate.fields.map((field) => [field.id, field]));
      const values = candidate.values.map((value) => {
        const source = sourceById.get(value.fieldId);
        const target = source ? targetByName.get(source.name.trim().toLocaleLowerCase()) : undefined;
        if (!target) throw new ApiError(400, 'IMPORT_INVALID', `字段“${source?.name ?? value.fieldId}”不属于主体模板`);
        return { fieldId: target.id, value: value.value };
      });
      const issues = await validateValues(process.fields, values);
      const errors = issues.filter((issue) => issue.severity !== 'warning');
      if (errors.length) throw new ApiError(400, 'IMPORT_INVALID', errors.map((issue) => issue.message).join('；'));
      if (!values.length) throw new ApiError(400, 'IMPORT_INVALID', '导入阶段至少包含一个有值字段');
      basePayload.subject!.templateId = template.id;
      basePayload.stageKey = stage;
      basePayload.fields = process.fields;
      basePayload.values = values;
      const row: PreviewRow = { id: randomUUID(), sheetName: candidate.sheetName, rowNo: candidate.rowNo, subjectKey: candidate.subjectKey,
        processName: process.name, status, errorMessage, payload: basePayload };
      if (candidate.lifecycleId) {
        const key = `${candidate.subjectKey}\0${candidate.lifecycleId}\0${stage}`;
        const previous = seenStages.get(key);
        if (previous) {
          previous.status = 'error'; previous.errorMessage = '同一生命周期在同一阶段出现多次';
          row.status = 'error'; row.errorMessage = '同一生命周期在同一阶段出现多次';
        } else seenStages.set(key, row);
      }
      rows.push(row);
      continue;
    } catch (error) {
      status = 'error';
      errorMessage = error instanceof Error ? error.message : '记录与主体模板不匹配';
    }
    rows.push({ id: randomUUID(), sheetName: candidate.sheetName, rowNo: candidate.rowNo, subjectKey: candidate.subjectKey,
      processName: candidate.processName, status, errorMessage, payload: basePayload });
  }
  for (const error of mapping.errors) rows.push({ id: randomUUID(), sheetName: error.sheetName, rowNo: error.rowNo,
    subjectKey: '', processName: '', status: 'error', errorMessage: error.errorMessage, payload: null });
  for (const issue of mapping.issues) rows.push({ id: randomUUID(), sheetName: issue.path, rowNo: 1,
    subjectKey: '', processName: '', status: 'error', errorMessage: issue.message, payload: null });
  if (rows.length > 5000) throw new ApiError(400, 'IMPORT_INVALID', '单次导入不能超过 5000 行');
  const jobId = randomUUID();
  const fileHash = createHash('sha256').update(buffer).digest('hex');
  const validRows = rows.filter((row) => row.status === 'valid').length;
  const errorRows = rows.length - validRows;
  const expiresAt = new Date(Date.now() + 30 * 60_000);
  const expiresDb = expiresAt.toISOString().slice(0, 23).replace('T', ' ');
  await withTransaction(async (tx) => {
    await execute(`INSERT INTO import_jobs(id,user_id,subject_type,file_name,file_hash,status,summary_json,expires_at)
      VALUES (?,?,?,?,?,'previewed',?,?)`, [jobId, c.get('user').id, subjectType, uploaded.name.slice(0, 255), fileHash,
      JSON.stringify({ validRows, errorRows }), expiresDb], tx);
    for (const row of rows) {
      await execute(`INSERT INTO import_rows(id,job_id,sheet_name,row_no,subject_key,process_name,status,error_message,payload_json)
        VALUES (?,?,?,?,?,?,?,?,?)`, [row.id, jobId, row.sheetName, row.rowNo, row.subjectKey, row.processName,
        row.status, row.errorMessage, row.payload === undefined ? null : JSON.stringify(row.payload)], tx);
    }
  });
  return ok(c, { jobId, fileName: uploaded.name, subjectType, validRows, errorRows,
    rows: rows.map((row) => ({ id: row.id, sheetName: row.sheetName, rowNo: row.rowNo, subjectKey: row.subjectKey,
      processName: row.processName, status: row.status, errorMessage: row.errorMessage, payload: row.payload })),
    expiresAt: expiresAt.toISOString() }, 201);
}

async function resolveOwner(payload: ImportPayload, actorId: string, db: Db): Promise<string> {
  if (payload.subject?.ownerId) {
    const row = await one<Row[]>("SELECT id FROM users WHERE id=? AND status='active' AND deleted_at IS NULL", [payload.subject.ownerId], db);
    if (row) return String(row.id);
  }
  if (payload.subject?.ownerName) {
    const row = await one<Row[]>("SELECT id FROM users WHERE display_name=? AND status='active' AND deleted_at IS NULL", [payload.subject.ownerName], db);
    if (row) return String(row.id);
  }
  return actorId;
}

async function ensureSubject(type: SubjectType, key: string, payload: ImportPayload, actorId: string, db: Db): Promise<{ id: string; created: boolean }> {
  const info = payload.subject;
  const code = info?.code ?? key;
  if (!code || !info?.name) throw new ApiError(400, 'IMPORT_INVALID', `主体“${key}”缺少编号或名称`);
  const table = type === 'product' ? 'products' : 'experiments';
  const column = type === 'product' ? 'product_code' : 'experiment_no';
  const existing = await one<Row[]>(`SELECT id,template_id FROM ${table} WHERE ${column}=? AND deleted_at IS NULL FOR UPDATE`, [code], db);
  if (existing) {
    if (info.templateId && info.templateId !== String(existing.template_id)) throw new ApiError(400, 'IMPORT_INVALID', `主体“${code}”的固定模板与文件不一致`);
    return { id: String(existing.id), created: false };
  }
  const id = randomUUID();
  const ownerId = await resolveOwner(payload, actorId, db);
  const template = info.templateId ? await loadTemplate(info.templateId, db) : await defaultTemplate(db);
  if (template.status !== 'active') throw new ApiError(400, 'IMPORT_INVALID', '导入模板已停用');
  assertLifecycleTemplate(template);
  if (type === 'product') {
    await execute('INSERT INTO products(id,product_code,name,template_id,owner_id,remark,created_by,updated_by) VALUES (?,?,?,?,?,?,?,?)',
      [id, code, info.name, template.id, ownerId, info.remark ?? '', actorId, actorId], db);
  } else {
    const date = info.date || new Date().toISOString().slice(0, 10);
    const match = /^EXP-(\d{8})-(\d{3})$/.exec(code);
    if (!match) throw new ApiError(400, 'IMPORT_INVALID', `实验“${code}”的编号格式必须为 EXP-YYYYMMDD-NNN`);
    await execute('INSERT INTO experiment_sequences(seq_date,last_seq) VALUES (?,?) ON DUPLICATE KEY UPDATE last_seq=GREATEST(last_seq,VALUES(last_seq))',
      [`${match[1]!.slice(0,4)}-${match[1]!.slice(4,6)}-${match[1]!.slice(6,8)}`, Number(match[2])], db);
    await execute(`INSERT INTO experiments(id,experiment_no,name,template_id,purpose,owner_id,experiment_date,remark,created_by,updated_by)
      VALUES (?,?,?,?,?,?,?,?,?,?)`, [id, code, info.name, template.id, info.purpose ?? '', ownerId, date, info.remark ?? '', actorId, actorId], db);
  }
  return { id, created: true };
}

importExportRoutes.post('/import-jobs/:id/confirm', idempotent, async (c) => {
  const input = await body(c, confirmImportSchema);
  if (input.mode === 'overwrite' && c.get('user').role === 'engineer') throw forbidden('工程师不能使用覆盖导入');
  const result = await withTransaction(async (tx) => {
    const job = await one<Row[]>('SELECT * FROM import_jobs WHERE id=? AND user_id=? FOR UPDATE', [c.req.param('id'), c.get('user').id], tx);
    if (!job) throw notFound('导入任务不存在');
    if (job.status === 'confirmed') throw conflict('导入任务已确认', 'IMPORT_ALREADY_CONFIRMED');
    if (job.status !== 'previewed') throw conflict('导入任务当前不可确认', 'IMPORT_INVALID');
    if (String(job.expires_at) <= new Date().toISOString().slice(0, 23).replace('T', ' ')) {
      await execute("UPDATE import_jobs SET status='expired' WHERE id=?", [job.id], tx);
      throw new ApiError(410, 'IMPORT_EXPIRED', '导入预览已过期，请重新上传');
    }
    const rows = await query<Row[]>('SELECT * FROM import_rows WHERE job_id=? ORDER BY sheet_name,row_no FOR UPDATE', [job.id], tx);
    if (rows.some((row) => row.status === 'error')) throw new ApiError(409, 'IMPORT_INVALID', '存在错误行，不能确认导入');
    const subjects = new Map<string, string>();
    let createdSubjects = 0;
    for (const row of rows.filter((item) => item.status === 'valid' && !item.process_name)) {
      const payload = parseJson(row.payload_json) as ImportPayload;
      const key = String(row.subject_key);
      const subject = await ensureSubject(job.subject_type as SubjectType, key, payload, c.get('user').id, tx);
      subjects.set(key, subject.id);
      if (subject.created) {
        createdSubjects += 1;
        await audit(tx, { requestId: c.get('requestId'), actorId: c.get('user').id, action: 'create', entityType: String(job.subject_type), entityId: subject.id,
          subjectType: job.subject_type, subjectId: subject.id, after: payload.subject });
      }
    }
    const groups = new Map<string, { subjectId: string; lifecycleId: string | null; stages: LifecycleCreateInput['stages'] }>();
    for (const row of rows.filter((item) => item.status === 'valid' && item.process_name)) {
      const payload = parseJson(row.payload_json) as ImportPayload;
      const key = String(row.subject_key);
      const subjectId = subjects.get(key);
      if (!subjectId || !payload.stageKey || !payload.values) throw badRequest('导入行缺少主体或生命周期阶段');
      const lifecycleId = payload.lifecycleId ?? null;
      const groupKey = lifecycleId ? `${subjectId}\0${lifecycleId}` : `${subjectId}\0row:${String(row.id)}`;
      const group = groups.get(groupKey) ?? { subjectId, lifecycleId, stages: [] };
      group.stages.push({ stageKey: payload.stageKey, values: payload.values });
      groups.set(groupKey, group);
    }
    let importedRecords = 0;
    let importedStages = 0;
    for (const group of groups.values()) {
      const createInput = lifecycleCreateSchema.parse({ subjectType: job.subject_type, subjectId: group.subjectId, stages: group.stages });
      if (input.mode === 'overwrite' && group.lifecycleId) {
        const existing = await one<Row[]>('SELECT id,version FROM lifecycle_records WHERE id=? AND subject_type=? AND subject_id=? AND deleted_at IS NULL FOR UPDATE',
          [group.lifecycleId, job.subject_type, group.subjectId], tx);
        if (existing) {
          await updateLifecycle(String(existing.id), { ...createInput, version: Number(existing.version) },
            { actor: c.get('user'), requestId: c.get('requestId') }, tx);
          importedRecords += 1;
          importedStages += group.stages.length;
          continue;
        }
      }
      await createLifecycle(createInput, { actor: c.get('user'), requestId: c.get('requestId') }, tx);
      importedRecords += 1;
      importedStages += group.stages.length;
    }
    await execute("UPDATE import_jobs SET mode=?,status='confirmed',confirmed_at=UTC_TIMESTAMP(3),summary_json=? WHERE id=?",
      [input.mode, JSON.stringify({ importedRecords, importedStages, createdSubjects }), job.id], tx);
    await audit(tx, { requestId: c.get('requestId'), actorId: c.get('user').id, action: 'import_confirm', entityType: 'import_job', entityId: String(job.id),
      after: { fileHash: job.file_hash, mode: input.mode, importedRecords, importedStages, createdSubjects } });
    return { jobId: String(job.id), importedRecords, importedStages, createdSubjects, mode: input.mode };
  });
  return ok(c, result);
});
