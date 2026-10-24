import { describe, expect, it } from 'vitest';
import {
  BASIC_INFO_SHEET,
  buildExportWorkbook,
  formatFieldHeader,
  mapImportWorkbook,
  parseFieldHeader,
} from '@rds/core';
import type { WorkbookModel } from '@rds/core';
import { fields, process, subject } from './fixtures.js';

describe('Excel workbook mapping', () => {
  it('表头包含单位且可逆解析', () => {
    expect(formatFieldHeader(fields.pressure)).toBe('压制压力（MPa）');
    expect(parseFieldHeader('生坯密度（g/cm³）')).toEqual({ name: '生坯密度', unit: 'g/cm³' });
    expect(formatFieldHeader(fields.ratio)).toBe('粉料配比');
  });

  it('导出基本信息和工序 Sheet，并可再次导入', () => {
    const workbook = buildExportWorkbook(subject());
    expect(workbook.sheets.map(({ name }) => name)).toEqual([BASIC_INFO_SHEET, '压制']);
    expect(workbook.sheets[1]?.rows[0]).toEqual(['主体编号', '主体名称', '生命周期ID', '压制压力（MPa）', '生坯密度（g/cm³）']);
    const imported = mapImportWorkbook(workbook, [process]);
    expect(imported.issues).toEqual([]);
    expect(imported.errors).toEqual([]);
    expect(imported.candidates).toHaveLength(1);
    expect(imported.candidates[0]).toMatchObject({
      subjectKey: 'EXP-20261024-001', processName: '压制', processDefId: 'pressing', lifecycleId: 'lifecycle-1',
      values: [{ fieldId: 'pressure', value: '200' }, { fieldId: 'density', value: '3.2' }],
    });
  });

  it('逐行报告必填和类型错误，合法行仍可映射', () => {
    const workbook: WorkbookModel = { sheets: [
      { name: BASIC_INFO_SHEET, rows: [
        ['字段', '值'], ['主体类型', 'experiment'], ['主体编号', 'EXP-1'], ['主体名称', '实验'], [],
      ] },
      { name: '压制', rows: [
        ['主体编号', '主体名称', '生坯密度（g/cm³）', '压制压力（MPa）'],
        ['EXP-1', '实验', '', 'bad'],
        ['EXP-1', '实验', 3.2, 200],
      ] },
    ] };
    const result = mapImportWorkbook(workbook, [process]);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatchObject({ sheetName: '压制', rowNo: 2 });
    expect(result.errors[0]?.issues.map(({ code }) => code)).toEqual(['REQUIRED', 'INVALID_NUMBER']);
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]?.rowNo).toBe(3);
  });

  it('缺少基本信息时返回结构问题', () => {
    const result = mapImportWorkbook({ sheets: [] });
    expect(result.issues).toEqual([expect.objectContaining({ code: 'MISSING_BASIC_INFO' })]);
    expect(result.candidates).toEqual([]);
  });
});
