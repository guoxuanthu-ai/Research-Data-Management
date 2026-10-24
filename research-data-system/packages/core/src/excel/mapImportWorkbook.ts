import type { FieldDefinition, ProcessStructure, RecordValueDto, SubjectType } from '../contracts.js';
import { issue } from '../result.js';
import type { ValidationIssue } from '../result.js';
import { sortFields } from '../records/sortStructure.js';
import { validateRecordValues } from '../records/validateRecordValues.js';
import { normalizeFieldName, normalizeUnitName } from '../text/normalizeText.js';
import { parseFieldHeader } from './header.js';
import { BASIC_INFO_SHEET, LIFECYCLE_ID_HEADER, SUBJECT_CODE_HEADER, SUBJECT_NAME_HEADER } from './workbookModel.js';
import type { WorkbookCell, WorkbookModel, WorksheetModel } from './workbookModel.js';

export interface ImportWorkbookOptions {
  processes?: ProcessStructure[];
}

export interface ImportSubject {
  subjectKey: string;
  subjectType: SubjectType;
  name: string;
  templateId: string;
  ownerName: string;
  date: string;
  purpose: string;
  remark: string;
}

export interface ImportCandidate {
  sheetName: string;
  rowNo: number;
  subjectKey: string;
  subjectType: SubjectType;
  processDefId: string | null;
  processName: string;
  processSort: number;
  lifecycleId: string | null;
  sourceTemplateId: string | null;
  sourceTemplateVersion: number | null;
  fields: FieldDefinition[];
  values: RecordValueDto[];
  warnings: ValidationIssue[];
}

export interface ImportRowError {
  sheetName: string;
  rowNo: number;
  errorMessage: string;
  issues: ValidationIssue[];
}

export interface ImportWorkbookResult {
  subjects: ImportSubject[];
  candidates: ImportCandidate[];
  errors: ImportRowError[];
  issues: ValidationIssue[];
}

function text(cell: WorkbookCell | undefined): string {
  return cell === null || cell === undefined ? '' : String(cell).trim();
}

function isBlank(row: WorkbookCell[] | undefined): boolean {
  return !row || row.every((cell) => text(cell) === '');
}

function inferField(name: string, unit: string, sheetName: string, column: number, valueType: FieldDefinition['valueType']): FieldDefinition {
  return {
    id: `${sheetName}:${column}`,
    name,
    unit,
    valueType,
    required: false,
    minValue: null,
    maxValue: null,
    sortOrder: column - 2,
  };
}

function inferType(value: string): FieldDefinition['valueType'] {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return 'date';
  if (value && Number.isFinite(Number(value))) return 'number';
  return 'text';
}

function readSubjects(sheet: WorksheetModel | undefined, issues: ValidationIssue[]): ImportSubject[] {
  if (!sheet) {
    issues.push(issue(BASIC_INFO_SHEET, 'MISSING_BASIC_INFO', '缺少“基本信息”Sheet'));
    return [];
  }
  if (text(sheet.rows[0]?.[0]) !== '字段' || text(sheet.rows[0]?.[1]) !== '值') {
    issues.push(issue(`${BASIC_INFO_SHEET}.1`, 'INVALID_BASIC_INFO_HEADER', '基本信息表头必须为“字段、值”'));
  }
  const subjects: ImportSubject[] = [];
  let current: Partial<ImportSubject> | null = null;
  const commit = (rowNo: number): void => {
    if (!current) return;
    if (!current.subjectKey || !current.name || !current.subjectType) {
      issues.push(issue(`${BASIC_INFO_SHEET}.${rowNo}`, 'INVALID_BASIC_INFO', '基本信息必须包含主体类型、主体编号和主体名称'));
    } else {
      subjects.push({
        subjectKey: current.subjectKey,
        subjectType: current.subjectType,
        name: current.name,
        templateId: current.templateId ?? '',
        ownerName: current.ownerName ?? '',
        date: current.date ?? '',
        purpose: current.purpose ?? '',
        remark: current.remark ?? '',
      });
    }
  };
  for (let index = 1; index < sheet.rows.length; index += 1) {
    const row = sheet.rows[index];
    if (isBlank(row)) {
      commit(index + 1);
      current = null;
      continue;
    }
    const key = text(row?.[0]);
    const value = text(row?.[1]);
    if (key === SUBJECT_CODE_HEADER && current?.subjectKey) {
      commit(index + 1);
      current = null;
    }
    current ??= {};
    if (key === '主体类型' && (value === 'product' || value === 'experiment')) current.subjectType = value;
    else if (key === SUBJECT_CODE_HEADER) current.subjectKey = value;
    else if (key === SUBJECT_NAME_HEADER) current.name = value;
    else if (key === '模板ID') current.templateId = value;
    else if (key === '负责人') current.ownerName = value;
    else if (key === '日期') current.date = value;
    else if (key === '目的') current.purpose = value;
    else if (key === '备注') current.remark = value;
  }
  commit(sheet.rows.length);
  return subjects;
}

export function mapImportWorkbook(
  workbook: WorkbookModel,
  optionsOrProcesses: ImportWorkbookOptions | ProcessStructure[] = {},
): ImportWorkbookResult {
  const options = Array.isArray(optionsOrProcesses) ? { processes: optionsOrProcesses } : optionsOrProcesses;
  const issues: ValidationIssue[] = [];
  const errors: ImportRowError[] = [];
  const candidates: ImportCandidate[] = [];
  const subjects = readSubjects(workbook.sheets.find((sheet) => sheet.name === BASIC_INFO_SHEET), issues);
  const subjectByKey = new Map(subjects.map((subject) => [subject.subjectKey, subject]));
  const processByName = new Map((options.processes ?? []).map((process) => [normalizeFieldName(process.name), process]));

  for (const sheet of workbook.sheets) {
    if (sheet.name === BASIC_INFO_SHEET) continue;
    const headers = sheet.rows[0] ?? [];
    if (text(headers[0]) !== SUBJECT_CODE_HEADER || text(headers[1]) !== SUBJECT_NAME_HEADER) {
      issues.push(issue(`${sheet.name}.1`, 'INVALID_HEADER', `${sheet.name} 前两列必须为“${SUBJECT_CODE_HEADER}、${SUBJECT_NAME_HEADER}”`));
      continue;
    }
    const hasLifecycleId = text(headers[2]) === LIFECYCLE_ID_HEADER;
    const firstFieldColumn = hasLifecycleId ? 3 : 2;
    const process = processByName.get(normalizeFieldName(sheet.name));
    const templateFields = new Map((process?.fields ?? []).map((field) => [normalizeFieldName(field.name), field]));
    const fields: FieldDefinition[] = [];
    const headerIssues: ValidationIssue[] = [];
    const seenHeaders = new Set<string>();
    for (let column = firstFieldColumn; column < headers.length; column += 1) {
      const parsed = parseFieldHeader(text(headers[column]));
      if (!parsed) {
        headerIssues.push(issue(`${sheet.name}.1.${column + 1}`, 'INVALID_FIELD_HEADER', '字段表头不能为空或无法识别'));
        continue;
      }
      const key = normalizeFieldName(parsed.name);
      if (seenHeaders.has(key)) {
        headerIssues.push(issue(`${sheet.name}.1.${column + 1}`, 'DUPLICATE_FIELD_HEADER', `字段 ${parsed.name} 重复`));
        continue;
      }
      seenHeaders.add(key);
      const template = templateFields.get(key);
      if (template && normalizeUnitName(parsed.unit) !== normalizeUnitName(template.unit)) {
        headerIssues.push(issue(`${sheet.name}.1.${column + 1}`, 'HEADER_UNIT_MISMATCH', `字段 ${parsed.name} 的单位与模板不一致`));
      }
      const sample = sheet.rows.slice(1).find((row) => text(row?.[column]))?.[column];
      fields.push(template ? { ...template } : inferField(parsed.name, parsed.unit, sheet.name, column, inferType(text(sample))));
    }

    for (let index = 1; index < sheet.rows.length; index += 1) {
      const row = sheet.rows[index];
      if (isBlank(row)) continue;
      const rowNo = index + 1;
      const subjectKey = text(row?.[0]);
      const subject = subjectByKey.get(subjectKey);
      const rowIssues = [...headerIssues];
      if (!subject) rowIssues.push(issue(`${sheet.name}.${rowNo}.1`, 'UNKNOWN_SUBJECT', '主体编号未在基本信息 Sheet 中定义'));
      if (text(row?.[1]) && subject && text(row?.[1]) !== subject.name) {
        rowIssues.push(issue(`${sheet.name}.${rowNo}.2`, 'SUBJECT_NAME_MISMATCH', '主体名称与基本信息不一致'));
      }
      if (hasLifecycleId && !text(row?.[2])) rowIssues.push(issue(`${sheet.name}.${rowNo}.3`, 'MISSING_LIFECYCLE_ID', '生命周期ID不能为空'));
      const values = fields.flatMap((field, fieldIndex) => [{ fieldId: field.id, value: text(row?.[fieldIndex + firstFieldColumn]) }]);
      const validated = validateRecordValues(fields, values);
      rowIssues.push(...validated.issues.map((entry) => ({ ...entry, path: `${sheet.name}.${rowNo}.${entry.path}` })));
      const rowErrors = rowIssues.filter((entry) => entry.severity !== 'warning');
      if (!subject || rowErrors.length) {
        errors.push({ sheetName: sheet.name, rowNo, errorMessage: rowErrors.map((entry) => entry.message).join('；') || '未知主体', issues: rowErrors });
        continue;
      }
      if (!validated.ok) continue;
      candidates.push({
        sheetName: sheet.name,
        rowNo,
        subjectKey,
        subjectType: subject.subjectType,
        processDefId: process?.processDefId ?? null,
        processName: process?.name ?? sheet.name,
        processSort: process?.sortOrder ?? candidates.length,
        lifecycleId: hasLifecycleId ? text(row?.[2]) : null,
        sourceTemplateId: null,
        sourceTemplateVersion: null,
        fields: validated.value.fields,
        values: validated.value.values,
        warnings: validated.issues,
      });
    }
  }
  return { subjects, candidates, errors, issues };
}
