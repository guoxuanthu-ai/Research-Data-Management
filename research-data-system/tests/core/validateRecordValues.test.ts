import { describe, expect, it } from 'vitest';
import { instantiateTemplate, validateRecordValues } from '@rds/core';
import { field, fields, process } from './fixtures.js';

describe('records', () => {
  it('实例化模板工序，排序并复制字段快照', () => {
    const result = instantiateTemplate({ id: 'template-1', version: 3, processes: [process] }, process.id);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.fields.map(({ id }) => id)).toEqual(['weight', 'pressure', 'density']);
    expect(result.value).toMatchObject({ sourceTemplateId: 'template-1', sourceTemplateVersion: 3, processDefId: 'pressing' });
    expect(result.value.fields[0]).not.toBe(process.fields[0]);
    expect(instantiateTemplate({ id: 't', version: 1, processes: [] }, 'missing').ok).toBe(false);
  });

  it('必填、数值、日期和未知字段错误会阻断', () => {
    const date = field('date', '实验日期', { valueType: 'date' });
    const result = validateRecordValues([fields.density, fields.pressure, date], [
      { fieldId: 'density', value: '' },
      { fieldId: 'pressure', value: 'abc' },
      { fieldId: 'date', value: '2026-02-29' },
      { fieldId: 'unknown', value: '1' },
    ]);
    expect(result.ok).toBe(false);
    expect(result.issues.map(({ code }) => code)).toEqual(['REQUIRED', 'INVALID_NUMBER', 'INVALID_DATE', 'UNKNOWN_FIELD']);
  });

  it('文本和有效日期通过，超区间仅 warning 不阻断', () => {
    const text = field('text', '备注', { valueType: 'text', required: true });
    const date = field('date', '日期', { valueType: 'date' });
    const result = validateRecordValues([fields.pressure, text, date], {
      pressure: '400', text: ' 正常 ', date: '2024-02-29',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.issues).toEqual([expect.objectContaining({ code: 'ABOVE_RANGE', severity: 'warning' })]);
    expect(result.value.values).toContainEqual({ fieldId: 'text', value: '正常' });
  });

  it('可选空值被省略，重复字段被拒绝', () => {
    const optional = validateRecordValues([fields.pressure], []);
    expect(optional).toEqual({ ok: true, value: { fields: [fields.pressure], values: [] }, issues: [] });
    const duplicate = validateRecordValues([fields.pressure], [
      { fieldId: 'pressure', value: '1' }, { fieldId: 'pressure', value: '2' },
    ]);
    expect(duplicate.ok).toBe(false);
    expect(duplicate.issues).toContainEqual(expect.objectContaining({ code: 'DUPLICATE_FIELD' }));
  });
});
