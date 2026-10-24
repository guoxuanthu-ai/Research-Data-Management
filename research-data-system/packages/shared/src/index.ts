import { z } from 'zod';

export const ROLES = ['director', 'supervisor', 'engineer'] as const;
export const SUBJECT_TYPES = ['product', 'experiment'] as const;
export const VALUE_TYPES = ['number', 'text', 'date'] as const;
export type Role = (typeof ROLES)[number];
export type SubjectType = (typeof SUBJECT_TYPES)[number];
export type ValueType = (typeof VALUE_TYPES)[number];
export const STAGE_KEYS = ['powder', 'pressing', 'heat_treatment'] as const;
export type DefaultStageKey = (typeof STAGE_KEYS)[number];
export type StageKey = DefaultStageKey | `custom:${string}`;
export const stageKeySchema = z.custom<StageKey>((value) => typeof value === 'string'
  && ((STAGE_KEYS as readonly string[]).includes(value) || /^custom:.+$/.test(value)));
export type EntityStatus = 'active' | 'disabled';

export interface ApiEnvelope<T> {
  ok: true;
  data: T;
  requestId: string;
}
export interface ApiErrorEnvelope {
  ok: false;
  error: { code: string; message: string; details?: ValidationIssue[] };
  requestId: string;
}
export interface ValidationIssue {
  path: string;
  code: string;
  message: string;
  severity?: 'error' | 'warning';
}
export interface PageResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface CurrentUserDto {
  id: string;
  username: string;
  displayName: string;
  role: Role;
  status: EntityStatus;
  mustChangePassword: boolean;
  version: number;
}
export interface AuthSessionDto {
  accessToken: string;
  user: CurrentUserDto;
}
export interface UserDto extends CurrentUserDto {
  createdAt: string;
  lastLoginAt: string | null;
}

export interface FieldDefinition {
  id: string;
  name: string;
  unit: string;
  valueType: ValueType;
  required: boolean;
  minValue: number | null;
  maxValue: number | null;
  sortOrder: number;
}
export interface ProcessStructure {
  id: string;
  processDefId?: string | null;
  name: string;
  sortOrder: number;
  fields: FieldDefinition[];
}
export interface TemplateDto {
  id: string;
  name: string;
  description: string;
  status: EntityStatus;
  version: number;
  processes: ProcessStructure[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}
export interface ProcessDefDto {
  id: string;
  name: string;
  sortOrder: number;
  isSystem: boolean;
  status: EntityStatus;
  version: number;
}

export interface SubjectDto {
  id: string;
  type: SubjectType;
  code: string;
  name: string;
  purpose: string;
  ownerId: string;
  ownerName: string;
  date: string;
  remark: string;
  createdBy: string;
  creatorName: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  recordCount: number;
  templateId: string;
  templateName: string;
  templateVersion: number;
}
export interface RecordValueDto {
  fieldId: string;
  value: string;
}
export interface RecordDto {
  id: string;
  subjectType: SubjectType;
  subjectId: string;
  processDefId: string | null;
  processName: string;
  processSort: number;
  sourceTemplateId: string | null;
  sourceTemplateVersion: number | null;
  fields: FieldDefinition[];
  values: RecordValueDto[];
  createdBy: string;
  creatorName: string;
  createdAt: string;
  updatedAt: string;
  version: number;
  deletedAt: string | null;
  lifecycleId?: string;
  stageKey?: StageKey | null;
}
export interface LifecycleRecordDto {
  id: string;
  recordNo: number;
  subjectType: SubjectType;
  subjectId: string;
  version: number;
  createdBy: string;
  creatorName: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  stages: Partial<Record<StageKey, RecordDto>>;
}
export interface SubjectDetailDto extends SubjectDto {
  records: RecordDto[];
  lifecycles: LifecycleRecordDto[];
  template: TemplateDto;
}
export interface AuditLogDto {
  id: string;
  requestId: string;
  actorId: string | null;
  actorName: string;
  action: string;
  entityType: string;
  entityId: string;
  subjectType: SubjectType | null;
  subjectId: string | null;
  before: unknown;
  after: unknown;
  createdAt: string;
}
export interface DraftDto {
  id: string;
  ownerId: string;
  subjectType: SubjectType;
  subjectId: string;
  processName: string;
  payload: unknown;
  clientUpdatedAt: string;
  version: number;
  updatedAt: string;
}

export interface SmartAssignment {
  fieldId: string;
  fieldName: string;
  value: string;
  rawSegment: string;
  unit: string | null;
  score: number;
}
export interface SmartParseResult {
  matchedAssignments: SmartAssignment[];
  unmatchedSegments: string[];
  warnings: ValidationIssue[];
  fieldConflicts: Array<{ fieldId: string; segments: string[] }>;
}
export interface ImportRowDto {
  id: string;
  sheetName: string;
  rowNo: number;
  subjectKey: string;
  processName: string;
  status: 'valid' | 'error';
  errorMessage: string | null;
  payload: unknown;
}
export interface ImportPreviewDto {
  jobId: string;
  fileName: string;
  subjectType: SubjectType;
  validRows: number;
  errorRows: number;
  rows: ImportRowDto[];
  expiresAt: string;
}
export interface DashboardSummaryDto {
  weekExperiments: number;
  monthExperiments: number;
  monthProducts: number;
  monthRecords: number;
  totalProducts: number;
  totalExperiments: number;
  activities: Array<{ id: string; actorName: string; action: string; subjectName: string; createdAt: string }>;
  missingEntries: Array<{ id: string; code: string; name: string; ownerName: string; date: string; daysMissing: number }>;
}

export const fieldSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(100),
  unit: z.string().max(30).default(''),
  valueType: z.enum(VALUE_TYPES),
  required: z.boolean().default(false),
  minValue: z.number().nullable().default(null),
  maxValue: z.number().nullable().default(null),
  sortOrder: z.number().int().nonnegative().default(0),
});
export const processStructureSchema = z.object({
  id: z.string().min(1),
  processDefId: z.string().nullable().optional(),
  name: z.string().trim().min(1).max(100),
  sortOrder: z.number().int().nonnegative().default(0),
  fields: z.array(fieldSchema).max(200),
});
export const templateInputSchema = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().max(500).default(''),
  version: z.number().int().positive().optional(),
  processes: z.array(processStructureSchema).min(1).max(30),
});
export const loginSchema = z.object({ username: z.string().min(1), password: z.string().min(1) });
export const changePasswordSchema = z.object({ oldPassword: z.string().min(1), newPassword: z.string().min(10).max(128) });
export const createUserSchema = z.object({
  username: z.string().regex(/^[a-zA-Z][a-zA-Z0-9_.-]{2,31}$/),
  displayName: z.string().trim().min(1).max(50),
  role: z.enum(ROLES),
  initialPassword: z.string().min(10).max(128).optional(),
});
export const updateUserSchema = z.object({
  displayName: z.string().trim().min(1).max(50).optional(),
  role: z.enum(ROLES).optional(),
  version: z.number().int().positive(),
});
export const subjectInputSchema = z.object({
  code: z.string().trim().min(1).max(80).optional(),
  name: z.string().trim().min(1).max(150),
  purpose: z.string().max(2000).default(''),
  ownerId: z.string().min(1),
  templateId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  remark: z.string().max(2000).default(''),
  version: z.number().int().positive().optional(),
});
export const recordValueSchema = z.object({ fieldId: z.string().min(1), value: z.string().max(10000) });
export const lifecycleStageSchema = z.object({
  stageKey: stageKeySchema,
  values: z.array(recordValueSchema).min(1).max(200),
});
export const lifecycleCreateSchema = z.object({
  subjectType: z.enum(SUBJECT_TYPES),
  subjectId: z.string().min(1),
  stages: z.array(lifecycleStageSchema).min(1).max(30),
}).superRefine((input, context) => {
  const stages = new Set<string>();
  for (const [index, stage] of input.stages.entries()) {
    if (stages.has(stage.stageKey)) context.addIssue({ code: 'custom', path: ['stages', index, 'stageKey'], message: '同一阶段不能重复提交' });
    stages.add(stage.stageKey);
  }
});
export const lifecycleUpdateSchema = lifecycleCreateSchema.and(z.object({ version: z.number().int().positive() }));
export const createRecordSchema = z.object({
  subjectType: z.enum(SUBJECT_TYPES),
  subjectId: z.string().min(1),
  processDefId: z.string().nullable().default(null),
  processName: z.string().trim().min(1).max(100),
  processSort: z.number().int().nonnegative().default(0),
  sourceTemplateId: z.string().nullable().default(null),
  sourceTemplateVersion: z.number().int().positive().nullable().default(null),
  fields: z.array(fieldSchema).min(1).max(200),
  values: z.array(recordValueSchema).max(200),
});
export const updateRecordSchema = createRecordSchema.extend({ version: z.number().int().positive() });
export const smartParseSchema = z.object({ text: z.string().min(1).max(50000), fields: z.array(fieldSchema).min(1).max(200) });
export const draftSchema = z.object({
  subjectType: z.enum(SUBJECT_TYPES),
  subjectId: z.string().min(1),
  processName: z.string().min(1).default('lifecycle/new'),
  payload: z.unknown(),
  clientUpdatedAt: z.string().datetime(),
  version: z.number().int().positive().optional(),
});
export const confirmImportSchema = z.object({ mode: z.enum(['append', 'overwrite']) });

export type FieldInput = z.infer<typeof fieldSchema>;
export type TemplateInput = z.infer<typeof templateInputSchema>;
export type SubjectInput = z.infer<typeof subjectInputSchema>;
export type CreateRecordInput = z.infer<typeof createRecordSchema>;
export type UpdateRecordInput = z.infer<typeof updateRecordSchema>;
export type LifecycleCreateInput = z.infer<typeof lifecycleCreateSchema>;
export type LifecycleUpdateInput = z.infer<typeof lifecycleUpdateSchema>;
export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type DraftInput = z.infer<typeof draftSchema>;

export const ROLE_LABELS: Record<Role, string> = { director: '厂长', supervisor: '研发主管', engineer: '工程师' };
export const SUBJECT_LABELS: Record<SubjectType, string> = { product: '产品', experiment: '实验' };
export const VALUE_TYPE_LABELS: Record<ValueType, string> = { number: '数值', text: '文本', date: '日期' };
