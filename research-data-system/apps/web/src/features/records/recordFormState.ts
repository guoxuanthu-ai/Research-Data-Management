import type { FieldDefinition, LifecycleRecordDto, ProcessStructure, StageKey, TemplateDto, ValueType } from '@rds/shared';
import { createId } from '../../utils/id';

export type EntryValues = Partial<Record<StageKey, Record<string, string>>>;
export interface EntryPayload { processId: StageKey; processes: ProcessStructure[]; values: EntryValues; smartText: string; clientUpdatedAt?: string; }
export const STAGES: Array<{ key: StageKey; label: string; aliases: string[] }> = [
  { key: 'powder', label: '粉料', aliases: ['粉料', '造粒'] },
  { key: 'pressing', label: '压制', aliases: ['压制'] },
  { key: 'heat_treatment', label: '热处理', aliases: ['热处理', '烧结'] },
];

export function blankField(sortOrder = 0): FieldDefinition { return { id: createId(), name: '', unit: '', valueType: 'number', required: false, minValue: null, maxValue: null, sortOrder }; }
export function blankProcess(sortOrder = 0): ProcessStructure { return { id: createId(), processDefId: null, name: `自定义工序 ${sortOrder + 1}`, sortOrder, fields: [blankField()] }; }
export function fromTemplate(template: TemplateDto): ProcessStructure[] { return template.processes.map((process) => ({ ...process, fields: process.fields.map((field) => ({ ...field })) })); }
const DEFAULT_PROCESS_IDS: Record<string, StageKey> = {
  '00000000-0000-4000-8000-000000000101': 'powder',
  '00000000-0000-4000-8000-000000000102': 'pressing',
  '00000000-0000-4000-8000-000000000103': 'heat_treatment',
};
export function stageKeyForProcess(process: ProcessStructure): StageKey {
  if (process.processDefId && DEFAULT_PROCESS_IDS[process.processDefId]) return DEFAULT_PROCESS_IDS[process.processDefId]!;
  if (process.name === '粉料' || process.name === '造粒') return 'powder';
  if (process.name === '压制') return 'pressing';
  if (process.name === '热处理' || process.name === '烧结') return 'heat_treatment';
  return `custom:${process.id}`;
}
export function stageEntries(processes: ProcessStructure[]): Array<{ key: StageKey; label: string; process: ProcessStructure }> {
  return processes.slice().sort((a, b) => a.sortOrder - b.sortOrder).map((process) => ({ key: stageKeyForProcess(process), label: process.name, process }));
}
export function processForStage(processes: ProcessStructure[], stage: StageKey): ProcessStructure | undefined {
  return processes.find((process) => stageKeyForProcess(process) === stage);
}
export function valuesFromLifecycle(processes: ProcessStructure[], lifecycle?: LifecycleRecordDto | null): EntryValues {
  return Object.fromEntries(stageEntries(processes).map(({ key, process }) => {
    const record = lifecycle?.stages[key];
    const saved = new Map(record?.values.map((value) => [value.fieldId, value.value]));
    return [key, Object.fromEntries(process.fields.map((field) => [field.id, saved.get(field.id) ?? '']))];
  })) as EntryValues;
}
export function normalizeValues(processes: ProcessStructure[], values: EntryValues): EntryValues {
  return Object.fromEntries(stageEntries(processes).map(({ key, process }) => {
    return [key, Object.fromEntries(process.fields.map((field) => [field.id, values[key]?.[field.id] ?? '']))];
  })) as EntryValues;
}
export function fieldInputType(type: ValueType): string { return type === 'number' ? 'number' : type === 'date' ? 'date' : 'text'; }
