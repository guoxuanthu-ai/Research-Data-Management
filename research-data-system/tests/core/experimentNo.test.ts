import { describe, expect, it } from 'vitest';
import { formatExperimentNo, isValidExperimentNo, parseExperimentNo } from '@rds/core';

describe('experiment number', () => {
  it('格式化并解析 EXP-YYYYMMDD-NNN', () => {
    expect(formatExperimentNo('2026-10-24', 1)).toEqual({ ok: true, value: 'EXP-20261024-001', issues: [] });
    expect(formatExperimentNo({ date: '2024-02-29', sequence: 999 })).toMatchObject({ ok: true, value: 'EXP-20240229-999' });
    expect(parseExperimentNo('EXP-20261024-001')).toMatchObject({ ok: true, value: { date: '2026-10-24', sequence: 1 } });
  });

  it.each([0, 1000, 1.5, Number.NaN])('拒绝越界或非整数序号 %s', (sequence) => {
    expect(formatExperimentNo('2026-10-24', sequence)).toMatchObject({ ok: false });
  });

  it('拒绝无效日期、零序号和错误格式', () => {
    expect(formatExperimentNo('2026-02-29', 1).ok).toBe(false);
    expect(isValidExperimentNo('EXP-20261024-000')).toBe(false);
    expect(isValidExperimentNo('EXP-2026-10-24-001')).toBe(false);
  });
});
