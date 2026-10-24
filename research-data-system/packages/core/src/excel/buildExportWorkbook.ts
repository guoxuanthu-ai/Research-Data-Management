import type { FieldDefinition, RecordDto, SubjectDetailDto } from '../contracts.js';
import { sortFields } from '../records/sortStructure.js';
import { formatFieldHeader } from './header.js';
import { BASIC_INFO_SHEET, LIFECYCLE_ID_HEADER, SUBJECT_CODE_HEADER, SUBJECT_NAME_HEADER } from './workbookModel.js';
import type { WorkbookCell, WorkbookModel, WorksheetModel } from './workbookModel.js';

function exportValue(field: FieldDefinition, value: string): WorkbookCell {
  if (!value) return null;
  if (field.valueType !== 'number') return value;
  const number = Number(value);
  return Number.isFinite(number) ? number : value;
}

function basicInfoRows(subjects: SubjectDetailDto[]): WorkbookCell[][] {
  const rows: WorkbookCell[][] = [['字段', '值']];
  for (const subject of subjects) {
    rows.push(
      ['主体类型', subject.type],
      [SUBJECT_CODE_HEADER, subject.code],
      [SUBJECT_NAME_HEADER, subject.name],
      ['模板ID', subject.templateId ?? ''],
      ['负责人', subject.ownerName],
      ['日期', subject.date],
      ['目的', subject.purpose],
      ['备注', subject.remark],
      [],
    );
  }
  return rows;
}

export function buildExportWorkbook(subjectOrSubjects: SubjectDetailDto | SubjectDetailDto[]): WorkbookModel {
  const subjects = Array.isArray(subjectOrSubjects) ? subjectOrSubjects : [subjectOrSubjects];
  const groups = new Map<string, Array<{ subject: SubjectDetailDto; record: RecordDto }>>();
  for (const subject of subjects) {
    for (const record of subject.records) {
      if (record.deletedAt !== null) continue;
      const group = groups.get(record.processName) ?? [];
      group.push({ subject, record });
      groups.set(record.processName, group);
    }
  }

  const sheets: WorksheetModel[] = [{ name: BASIC_INFO_SHEET, rows: basicInfoRows(subjects) }];
  for (const [processName, entries] of groups) {
    const fieldsById = new Map<string, FieldDefinition>();
    for (const { record } of entries) {
      for (const field of sortFields(record.fields)) if (!fieldsById.has(field.id)) fieldsById.set(field.id, field);
    }
    const fields = [...fieldsById.values()];
    const rows: WorkbookCell[][] = [[SUBJECT_CODE_HEADER, SUBJECT_NAME_HEADER, LIFECYCLE_ID_HEADER, ...fields.map(formatFieldHeader)]];
    for (const { subject, record } of entries) {
      const values = new Map(record.values.map((value) => [value.fieldId, value.value]));
      rows.push([
        subject.code,
        subject.name,
        record.lifecycleId ?? `legacy:${record.id ?? ''}`,
        ...fields.map((field) => exportValue(field, values.get(field.id)?.trim() ?? '')),
      ]);
    }
    sheets.push({ name: processName, rows });
  }
  return { sheets };
}
