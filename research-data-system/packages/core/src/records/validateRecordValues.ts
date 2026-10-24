import type { FieldDefinition, RecordValueDto } from '../contracts.js';
import { issue } from '../result.js';
import type { CoreResult, ValidationIssue } from '../result.js';
import { sortFields } from './sortStructure.js';
import { validateValueRange } from './validateValueRange.js';

export interface ValidatedRecordValues {
  fields: FieldDefinition[];
  values: RecordValueDto[];
}

export type RecordValuesInput = RecordValueDto[] | Record<string, string | number | null | undefined>;

const NUMBER = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i;
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isValidDate(value: string): boolean {
  const match = DATE.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1 || month < 1 || month > 12 || day < 1) return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= (days[month - 1] ?? 0);
}

export function validateFieldValue(field: FieldDefinition, rawValue: string, path = field.id): ValidationIssue[] {
  const value = rawValue.trim();
  if (!value) {
    return field.required ? [issue(path, 'REQUIRED', `${field.name} 为必填项`)] : [];
  }
  if (field.valueType === 'number') {
    if (!NUMBER.test(value) || !Number.isFinite(Number(value))) {
      return [issue(path, 'INVALID_NUMBER', `${field.name} 必须是有效数值`)];
    }
    return validateValueRange(field, Number(value), path);
  }
  if (field.valueType === 'date' && !isValidDate(value)) {
    return [issue(path, 'INVALID_DATE', `${field.name} 必须是 YYYY-MM-DD 格式的有效日期`)];
  }
  return [];
}

function toEntries(input: RecordValuesInput): RecordValueDto[] {
  if (Array.isArray(input)) return input.map((value) => ({ ...value }));
  return Object.entries(input).flatMap(([fieldId, value]) =>
    value === null || value === undefined ? [] : [{ fieldId, value: String(value) }],
  );
}

export function validateRecordValues(
  fieldsOrDraft: FieldDefinition[] | { fields: FieldDefinition[]; values: RecordValuesInput },
  input?: RecordValuesInput,
): CoreResult<ValidatedRecordValues> {
  const fields = sortFields(Array.isArray(fieldsOrDraft) ? fieldsOrDraft : fieldsOrDraft.fields);
  const values = toEntries(Array.isArray(fieldsOrDraft) ? input ?? [] : fieldsOrDraft.values);
  const byId = new Map(fields.map((field) => [field.id, field]));
  const seen = new Set<string>();
  const normalized = new Map<string, string>();
  const issues: ValidationIssue[] = [];

  for (const entry of values) {
    const field = byId.get(entry.fieldId);
    if (!field) {
      issues.push(issue(entry.fieldId, 'UNKNOWN_FIELD', '字段不属于当前记录'));
      continue;
    }
    if (seen.has(entry.fieldId)) {
      issues.push(issue(entry.fieldId, 'DUPLICATE_FIELD', `${field.name} 存在重复值`));
      continue;
    }
    seen.add(entry.fieldId);
    const value = String(entry.value).trim();
    if (value) normalized.set(entry.fieldId, value);
    issues.push(...validateFieldValue(field, value));
  }
  for (const field of fields) {
    if (!seen.has(field.id)) issues.push(...validateFieldValue(field, ''));
  }

  const value = {
    fields,
    values: fields.flatMap((field) => {
      const fieldValue = normalized.get(field.id);
      return fieldValue === undefined ? [] : [{ fieldId: field.id, value: fieldValue }];
    }),
  };
  return issues.some((entry) => entry.severity !== 'warning') ? { ok: false, issues } : { ok: true, value, issues };
}
