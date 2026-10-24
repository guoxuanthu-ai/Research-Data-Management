import {
  buildExportWorkbook, formatExperimentNo, mapImportWorkbook, parseSmartText, validateRecordValues,
  type ImportWorkbookResult, type WorkbookModel as CoreWorkbookModel,
} from '@rds/core';
import type { FieldDefinition, ProcessStructure, RecordValueDto, SmartParseResult, SubjectDetailDto, ValidationIssue } from '@rds/shared';
import { badRequest } from '../http/errors.js';

export interface WorkbookModel { sheets: Array<{ name: string; rows: unknown[][] }> }
export type ImportMapping = ImportWorkbookResult;

export async function parseText(text: string, fields: FieldDefinition[]): Promise<SmartParseResult> {
  return parseSmartText(text, fields);
}

export async function validateValues(fields: FieldDefinition[], values: RecordValueDto[]): Promise<ValidationIssue[]> {
  return validateRecordValues(fields, values).issues;
}

export async function experimentNumber(date: string, sequence: number): Promise<string> {
  const result = formatExperimentNo(date, sequence);
  if (!result.ok) throw badRequest('实验编号生成失败', result.issues);
  return result.value;
}

export async function exportWorkbook(subjects: SubjectDetailDto[]): Promise<WorkbookModel> {
  return buildExportWorkbook(subjects) as WorkbookModel;
}

export async function importWorkbook(workbook: WorkbookModel, processes: ProcessStructure[] = []): Promise<ImportMapping> {
  return mapImportWorkbook(workbook as CoreWorkbookModel, processes);
}
