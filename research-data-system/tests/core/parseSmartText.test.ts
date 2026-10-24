import { describe, expect, it } from 'vitest';
import { matchField, normalizeText, parseSmartText } from '@rds/core';
import { field, fields } from './fixtures.js';

const allFields = Object.values(fields);

describe('parseSmartText', () => {
  it('覆盖 PRD 示例并保留文本值', () => {
    const result = parseSmartText('粉料粒度：5，粉料配比 Fe80%，压制压力：200\n生坯密度 3.2，生坯感量：10', allFields);
    expect(result.matchedAssignments.map(({ fieldId, value }) => [fieldId, value])).toEqual([
      ['size', '5'], ['ratio', 'Fe80%'], ['pressure', '200'], ['density', '3.2'], ['weight', '10'],
    ]);
    expect(result.unmatchedSegments).toEqual([]);
  });

  it('支持三种参数分隔写法和全部条目分隔符', () => {
    const result = parseSmartText('压制压力：200、生坯密度 3.2；粉料粒度5,生坯感量：10\n粉料配比 Fe80%', allFields);
    expect(result.matchedAssignments).toHaveLength(5);
    expect(result.unmatchedSegments).toEqual([]);
  });

  it('执行 NFKC、全半角和大小写归一', () => {
    const density = field('english', 'Density（g/cm³）', { unit: 'g/cm³' });
    const result = parseSmartText('ＤＥＮＳＩＴＹ：３．２', [density]);
    expect(normalizeText('  Ａ  Ｂ ')).toBe('a b');
    expect(result.matchedAssignments[0]?.value).toBe('3.2');
  });

  it('模糊匹配压力，但并列候选产生歧义时不猜测', () => {
    expect(matchField('压力', [fields.pressure])?.field.id).toBe('pressure');
    const result = parseSmartText('压力200', [fields.pressure, field('sinter', '烧结压力')]);
    expect(result.matchedAssignments).toEqual([]);
    expect(result.unmatchedSegments).toEqual(['压力200']);
  });

  it('剥离单位，只在单位不一致时产生 UNIT_MISMATCH', () => {
    const matching = parseSmartText('压制压力200MPa', [fields.pressure]);
    const mismatch = parseSmartText('压制压力200kPa', [fields.pressure]);
    expect(matching.matchedAssignments[0]).toMatchObject({ value: '200', unit: 'MPa' });
    expect(matching.warnings).toEqual([]);
    expect(mismatch.matchedAssignments[0]?.value).toBe('200');
    expect(mismatch.warnings).toEqual([expect.objectContaining({ code: 'UNIT_MISMATCH', severity: 'warning' })]);
  });

  it('返回未匹配片段、重复字段冲突及区间提醒', () => {
    const result = parseSmartText('压制压力200；未知项123；压制压力：400', [fields.pressure]);
    expect(result.unmatchedSegments).toEqual(['未知项123']);
    expect(result.fieldConflicts).toEqual([{ fieldId: 'pressure', segments: ['压制压力200', '压制压力：400'] }]);
    expect(result.warnings).toContainEqual(expect.objectContaining({ code: 'ABOVE_RANGE', severity: 'warning' }));
  });
});
