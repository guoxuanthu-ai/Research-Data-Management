import type { AuditLogDto, DashboardSummaryDto, DraftDto, DraftInput, FieldDefinition, ImportPreviewDto, LifecycleRecordDto, PageResult, ProcessDefDto, SmartParseResult, StageKey, SubjectDetailDto, SubjectInput, SubjectType, TemplateDto, TemplateInput, UserDto } from '@rds/shared';
import { api, downloadFile } from './client';
import { createId } from '../utils/id';

export function query(params: Record<string, string | number | boolean | undefined | null>): string {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => { if (value !== undefined && value !== null && value !== '') search.set(key, String(value)); });
  const text = search.toString();
  return text ? `?${text}` : '';
}
const write = <T>(path: string, method: string, body?: unknown) => api<T>(path, { method, body: body === undefined ? undefined : { ...(typeof body === 'object' && body ? body : {}), requestId: createId() }, headers: { 'Idempotency-Key': createId() } });

export const authApi = {
  login: (username: string, password: string) => api<import('@rds/shared').AuthSessionDto>('/auth/login', { method: 'POST', body: { username, password }, retry: false }),
  logout: () => write<{ success: boolean }>('/auth/logout', 'POST'),
  me: () => api<import('@rds/shared').CurrentUserDto>('/auth/me'),
  changePassword: (oldPassword: string, newPassword: string) => write<{ success: boolean }>('/auth/change-password', 'POST', { oldPassword, newPassword }),
};
export const subjectApi = {
  list: (type: SubjectType, params: Record<string, string | number | boolean | undefined>) => api<PageResult<SubjectDetailDto>>(`/${type === 'product' ? 'products' : 'experiments'}${query(params)}`),
  detail: (type: SubjectType, id: string) => api<SubjectDetailDto>(`/${type === 'product' ? 'products' : 'experiments'}/${id}?includeDeleted=true`),
  create: (type: SubjectType, data: SubjectInput) => write<SubjectDetailDto>(`/${type === 'product' ? 'products' : 'experiments'}`, 'POST', data),
  update: (type: SubjectType, id: string, data: SubjectInput) => write<SubjectDetailDto>(`/${type === 'product' ? 'products' : 'experiments'}/${id}`, 'PATCH', data),
  remove: (type: SubjectType, id: string, version: number) => write<{ success: boolean }>(`/${type === 'product' ? 'products' : 'experiments'}/${id}`, 'DELETE', { version }),
  restore: (type: SubjectType, id: string, version: number) => write<SubjectDetailDto>(`/${type === 'product' ? 'products' : 'experiments'}/${id}/restore`, 'POST', { version }),
  export: (type: SubjectType, params: Record<string, string | number | boolean | undefined>) => downloadFile(`/${type === 'product' ? 'products' : 'experiments'}/export${query(params)}`),
  exportOne: (type: SubjectType, id: string) => downloadFile(`/${type === 'product' ? 'products' : 'experiments'}/${id}/export`),
  importPreview: (type: SubjectType, file: File) => { const body = new FormData(); body.append('file', file); return api<ImportPreviewDto>(`/${type === 'product' ? 'products' : 'experiments'}/import/preview`, { method: 'POST', body, timeout: 60000 }); },
  confirmImport: (jobId: string, mode: 'append' | 'overwrite') => write<{ jobId: string; importedRecords: number; createdSubjects: number; mode: 'append' | 'overwrite' }>(`/import-jobs/${jobId}/confirm`, 'POST', { mode }),
};
type LifecycleSaveInput = { subjectType: SubjectType; subjectId: string; stages: Array<{ stageKey: StageKey; values: Array<{ fieldId: string; value: string }> }> };
export const lifecycleApi = {
  create: (data: LifecycleSaveInput) => write<LifecycleRecordDto>('/lifecycle-records', 'POST', data),
  update: (id: string, data: LifecycleSaveInput & { version: number }) => write<LifecycleRecordDto>(`/lifecycle-records/${id}`, 'PATCH', data),
  remove: (id: string, version: number) => write<{ success: boolean }>(`/lifecycle-records/${id}`, 'DELETE', { version }),
  restore: (id: string, version: number) => write<LifecycleRecordDto>(`/lifecycle-records/${id}/restore`, 'POST', { version }),
  history: (id: string) => api<AuditLogDto[]>(`/lifecycle-records/${id}/history`),
};
export const recordApi = {
  parse: (text: string, fields: FieldDefinition[]) => api<SmartParseResult>('/records/smart-parse', { method: 'POST', body: { text, fields } }),
};
export const templateApi = {
  list: (includeDisabled = true) => api<TemplateDto[]>(`/templates${query({ includeDisabled })}`),
  create: (data: TemplateInput) => write<TemplateDto>('/templates', 'POST', data),
  update: (id: string, data: TemplateInput) => write<TemplateDto>(`/templates/${id}`, 'PATCH', data),
  status: (id: string, status: 'active' | 'disabled', version: number) => write<TemplateDto>(`/templates/${id}/status`, 'POST', { status, version }),
  remove: (id: string, version: number) => write<{ success: boolean }>(`/templates/${id}`, 'DELETE', { version }),
  fromRecord: (recordId: string, name: string, description: string) => write<TemplateDto>('/templates/from-record', 'POST', { recordId, name, description }),
};
export const userApi = {
  list: (params: Record<string, string | number | undefined>) => api<PageResult<UserDto>>(`/users${query(params)}`),
  create: (data: { username: string; displayName: string; role: import('@rds/shared').Role; initialPassword?: string }) => write<UserDto & { initialPassword?: string }>('/users', 'POST', data),
  update: (id: string, data: { displayName?: string; role?: import('@rds/shared').Role; version: number }) => write<UserDto>(`/users/${id}`, 'PATCH', data),
  status: (id: string, status: 'active' | 'disabled', version: number) => write<UserDto>(`/users/${id}/status`, 'POST', { status, version }),
  reset: (id: string) => write<{ initialPassword: string } & Partial<UserDto>>(`/users/${id}/reset-password`, 'POST'),
  remove: (id: string, version: number) => write<{ success: boolean }>(`/users/${id}`, 'DELETE', { version }),
};
export const miscApi = {
  dashboard: () => api<DashboardSummaryDto>('/dashboard/summary'),
  processes: () => api<ProcessDefDto[]>('/process-defs'),
  audits: (params: Record<string, string | number | undefined>) => api<PageResult<AuditLogDto>>(`/audit-logs${query(params)}`),
  removeAudit: (id: string) => write<{ success: boolean }>(`/audit-logs/${id}`, 'DELETE'),
  removeAudits: (ids: string[]) => write<{ deletedCount: number }>('/audit-logs/batch-delete', 'POST', { ids }),
  drafts: (params: { subjectType: SubjectType; subjectId: string; processName?: string }) => api<DraftDto[]>(`/drafts${query(params)}`),
  saveDraft: (data: DraftInput) => write<DraftDto>('/drafts', 'POST', data),
};
