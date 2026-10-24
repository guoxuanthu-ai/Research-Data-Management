import { randomUUID } from 'node:crypto';
import type { CurrentUserDto, RecordDto, SubjectDto, SubjectType, UserDto } from '@rds/shared';
import { one, query, execute, type Db, type Row } from '../infrastructure/db/client.js';
import { forbidden, notFound } from '../http/errors.js';
import { canManage } from '../http/middlewares/auth.js';

export function json(value: unknown): string | null {
  return value === undefined || value === null ? null : JSON.stringify(value);
}

export function parseJson(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); } catch { return value; }
}

export function mapUser(row: Row): UserDto {
  return {
    id: String(row.id), username: String(row.username), displayName: String(row.display_name),
    role: row.role, status: row.status, mustChangePassword: Boolean(row.must_change_password),
    version: Number(row.version), createdAt: String(row.created_at), lastLoginAt: row.last_login_at ? String(row.last_login_at) : null,
  };
}

export async function findUser(id: string, db?: Db): Promise<UserDto> {
  const row = await one<Row[]>('SELECT * FROM users WHERE id=? AND deleted_at IS NULL', [id], db);
  if (!row) throw notFound('账号不存在');
  return mapUser(row);
}

export async function audit(db: Db, input: {
  requestId: string; actorId: string | null; action: string; entityType: string; entityId: string;
  subjectType?: SubjectType | null; subjectId?: string | null; before?: unknown; after?: unknown;
}): Promise<void> {
  await execute(`INSERT INTO audit_logs
    (id,request_id,actor_id,action,entity_type,entity_id,subject_type,subject_id,before_json,after_json)
    VALUES (?,?,?,?,?,?,?,?,?,?)`, [randomUUID(), input.requestId, input.actorId, input.action, input.entityType,
    input.entityId, input.subjectType ?? null, input.subjectId ?? null, json(input.before), json(input.after)], db);
}

const subjectConfig = {
  product: { table: 'products', code: 'product_code', date: "DATE_FORMAT(s.created_at,'%Y-%m-%d')" },
  experiment: { table: 'experiments', code: 'experiment_no', date: 'experiment_date' },
} as const;

export async function findSubject(type: SubjectType, id: string, db?: Db, includeDeleted = false, lock = false): Promise<SubjectDto> {
  const config = subjectConfig[type];
  const row = await one<Row[]>(`SELECT s.*,s.${config.code} AS code,${config.date} AS business_date,
    owner.display_name AS owner_name,creator.display_name AS creator_name,t.name AS template_name,t.version AS template_version,
    (SELECT COUNT(*) FROM lifecycle_records l WHERE l.subject_type=? AND l.subject_id=s.id AND l.deleted_at IS NULL) AS record_count
    FROM ${config.table} s JOIN users owner ON owner.id=s.owner_id JOIN users creator ON creator.id=s.created_by
    JOIN templates t ON t.id=s.template_id
    WHERE s.id=? ${includeDeleted ? '' : 'AND s.deleted_at IS NULL'} ${lock ? 'FOR UPDATE' : ''}`, [type, id], db);
  if (!row) throw notFound(type === 'product' ? '产品不存在' : '实验不存在');
  return mapSubject(row, type);
}

export function mapSubject(row: Row, type: SubjectType): SubjectDto {
  return {
    id: String(row.id), type, code: String(row.code), name: String(row.name), purpose: String(row.purpose ?? ''),
    ownerId: String(row.owner_id), ownerName: String(row.owner_name), date: String(row.business_date),
    remark: String(row.remark ?? ''), createdBy: String(row.created_by), creatorName: String(row.creator_name),
    version: Number(row.version), createdAt: String(row.created_at), updatedAt: String(row.updated_at),
    deletedAt: row.deleted_at ? String(row.deleted_at) : null, recordCount: Number(row.record_count ?? 0),
    templateId: String(row.template_id), templateName: String(row.template_name), templateVersion: Number(row.template_version),
  };
}

export function assertCreator(actor: CurrentUserDto, createdBy: string): void {
  if (!canManage(actor.role) && actor.id !== createdBy) throw forbidden('工程师只能修改本人创建的数据');
}

export function mapRecord(row: Row): RecordDto {
  const fields = Array.isArray(row.fields_json) ? row.fields_json : parseJson(row.fields_json);
  const normalizedFields: RecordDto['fields'] = Array.isArray(fields) ? fields.map((field) => ({
    id: String(field.id), name: String(field.name), unit: String(field.unit), valueType: field.valueType,
    required: Boolean(field.required), minValue: field.minValue === null ? null : Number(field.minValue),
    maxValue: field.maxValue === null ? null : Number(field.maxValue), sortOrder: Number(field.sortOrder),
  })) : [];
  return {
    id: String(row.id), subjectType: row.subject_type, subjectId: String(row.subject_id),
    processDefId: row.process_def_id ? String(row.process_def_id) : null,
    processName: String(row.process_name), processSort: Number(row.process_sort),
    sourceTemplateId: row.source_template_id ? String(row.source_template_id) : null,
    sourceTemplateVersion: row.source_template_version === null ? null : Number(row.source_template_version),
    fields: normalizedFields,
    values: (Array.isArray(row.values_json) ? row.values_json : parseJson(row.values_json)) as RecordDto['values'] ?? [],
    createdBy: String(row.created_by), creatorName: String(row.creator_name), createdAt: String(row.created_at),
    updatedAt: String(row.updated_at), version: Number(row.version), deletedAt: row.deleted_at ? String(row.deleted_at) : null,
    ...(row.lifecycle_id ? { lifecycleId: String(row.lifecycle_id) } : {}),
    ...(row.stage_key !== undefined ? { stageKey: row.stage_key } : {}),
  };
}

export const recordSelect = `SELECT r.*,u.display_name AS creator_name,
  (SELECT JSON_ARRAYAGG(JSON_OBJECT('fieldId',rv.record_field_id,'value',rv.raw_value))
   FROM record_values rv WHERE rv.record_id=r.id) AS values_json,
  (SELECT JSON_ARRAYAGG(JSON_OBJECT('id',f.id,'sourceTemplateFieldId',f.source_template_field_id,'name',f.name,'unit',f.unit,'valueType',f.value_type,
    'required',f.required,'minValue',f.min_value,'maxValue',f.max_value,'sortOrder',f.sort_order))
   FROM (SELECT * FROM record_fields rf WHERE rf.record_id=r.id ORDER BY rf.sort_order,rf.created_at) f) AS fields_json
  FROM records r JOIN users u ON u.id=r.created_by`;

export async function findRecord(id: string, db?: Db, includeDeleted = false): Promise<RecordDto> {
  const row = await one<Row[]>(`${recordSelect} WHERE r.id=? ${includeDeleted ? '' : 'AND r.deleted_at IS NULL'}`, [id], db);
  if (!row) throw notFound('记录不存在');
  return mapRecord(row);
}

export async function listRecordsForSubject(type: SubjectType, subjectId: string, db?: Db, includeDeleted = false): Promise<RecordDto[]> {
  const rows = await query<Row[]>(`${recordSelect} WHERE r.subject_type=? AND r.subject_id=? ${includeDeleted ? '' : 'AND r.deleted_at IS NULL'} ORDER BY r.process_sort,r.created_at`, [type, subjectId], db);
  return rows.map(mapRecord);
}

export function page(input: { page?: unknown; pageSize?: unknown }): { page: number; pageSize: number; offset: number } {
  const pageNumber = Math.max(1, Number(input.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(input.pageSize) || 20));
  return { page: pageNumber, pageSize, offset: (pageNumber - 1) * pageSize };
}
