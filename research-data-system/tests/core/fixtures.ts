import type { FieldDefinition, ProcessStructure, SubjectDetailDto, ValueType } from '@rds/shared';

export function field(id: string, name: string, overrides: Partial<FieldDefinition> = {}): FieldDefinition {
  return {
    id,
    name,
    unit: '',
    valueType: 'number' as ValueType,
    required: false,
    minValue: null,
    maxValue: null,
    sortOrder: 0,
    ...overrides,
  };
}

export const fields = {
  size: field('size', '粉料粒度', { unit: 'μm' }),
  ratio: field('ratio', '粉料配比', { valueType: 'text' }),
  pressure: field('pressure', '压制压力（MPa）', { unit: 'MPa', minValue: 1, maxValue: 300 }),
  density: field('density', '生坯密度', { unit: 'g/cm³', required: true, minValue: 2, maxValue: 8 }),
  weight: field('weight', '生坯感量', { unit: 'g' }),
};

export const process: ProcessStructure = {
  id: 'process-1',
  processDefId: 'pressing',
  name: '压制',
  sortOrder: 2,
  fields: [fields.weight, fields.pressure, fields.density],
};

export function subject(): SubjectDetailDto {
  const record: SubjectDetailDto['records'][number] = {
    id: 'record-1', lifecycleId: 'lifecycle-1', stageKey: 'pressing',
    subjectType: 'experiment', subjectId: 'subject-1', processDefId: 'pressing', processName: '压制', processSort: 2,
    sourceTemplateId: 'template-1', sourceTemplateVersion: 3, fields: [fields.pressure, fields.density],
    values: [{ fieldId: 'pressure', value: '200' }, { fieldId: 'density', value: '3.2' }],
    createdBy: 'user-1', creatorName: '张三', createdAt: '2026-10-24T00:00:00.000Z', updatedAt: '2026-10-24T00:00:00.000Z', version: 1, deletedAt: null,
  };
  return {
    id: 'subject-1', type: 'experiment', code: 'EXP-20261024-001', name: '共烧实验', purpose: '验证配方',
    ownerId: 'user-1', ownerName: '张三', date: '2026-10-24', remark: '首轮', createdBy: 'user-1', creatorName: '张三',
    version: 1, createdAt: '2026-10-24T00:00:00.000Z', updatedAt: '2026-10-24T00:00:00.000Z', deletedAt: null, recordCount: 1,
    templateId: 'template-1', templateName: '测试模板', templateVersion: 3,
    template: { id: 'template-1', name: '测试模板', description: '', status: 'active', version: 3, processes: [process], createdBy: 'user-1', createdAt: '2026-10-24T00:00:00.000Z', updatedAt: '2026-10-24T00:00:00.000Z' },
    records: [record],
    lifecycles: [{ id: 'lifecycle-1', recordNo: 1, subjectType: 'experiment', subjectId: 'subject-1', version: 1,
      createdBy: 'user-1', creatorName: '张三', createdAt: '2026-10-24T00:00:00.000Z', updatedAt: '2026-10-24T00:00:00.000Z', deletedAt: null, stages: { pressing: record } }],
  };
}
