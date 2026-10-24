import type { ProcessStructure, RecordValueDto, TemplateDto } from '../contracts.js';
import { issue } from '../result.js';
import type { CoreResult } from '../result.js';
import { sortFields } from './sortStructure.js';

export type TemplateStructure = Pick<TemplateDto, 'id' | 'version' | 'processes'>;

export interface RecordDraftInput {
  processDefId: string | null;
  processName: string;
  processSort: number;
  sourceTemplateId: string | null;
  sourceTemplateVersion: number | null;
  fields: ProcessStructure['fields'];
  values: RecordValueDto[];
}

export function instantiateProcess(
  process: ProcessStructure,
  source: { id: string; version: number } | null = null,
): RecordDraftInput {
  return {
    processDefId: process.processDefId ?? null,
    processName: process.name,
    processSort: process.sortOrder,
    sourceTemplateId: source?.id ?? null,
    sourceTemplateVersion: source?.version ?? null,
    fields: sortFields(process.fields),
    values: [],
  };
}

export function instantiateTemplate(template: TemplateStructure, processId: string): CoreResult<RecordDraftInput> {
  const process = template.processes.find((candidate) => candidate.id === processId);
  if (!process) return { ok: false, issues: [issue(processId, 'PROCESS_NOT_FOUND', '模板中不存在该工序')] };
  return { ok: true, value: instantiateProcess(process, template), issues: [] };
}
