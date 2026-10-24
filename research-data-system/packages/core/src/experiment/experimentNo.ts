import { issue } from '../result.js';
import type { CoreResult } from '../result.js';
import { isValidDate } from '../records/validateRecordValues.js';

export interface ExperimentNoParts {
  date: string;
  sequence: number;
}

const EXPERIMENT_NO = /^EXP-(\d{4})(\d{2})(\d{2})-(\d{3})$/;

export function formatExperimentNo(parts: ExperimentNoParts): CoreResult<string>;
export function formatExperimentNo(date: string, sequence: number): CoreResult<string>;
export function formatExperimentNo(partsOrDate: ExperimentNoParts | string, sequence?: number): CoreResult<string> {
  const parts = typeof partsOrDate === 'string' ? { date: partsOrDate, sequence: sequence ?? Number.NaN } : partsOrDate;
  const issues = [];
  if (!isValidDate(parts.date)) issues.push(issue('date', 'INVALID_DATE', '实验日期必须是 YYYY-MM-DD 格式的有效日期'));
  if (!Number.isInteger(parts.sequence) || parts.sequence < 1 || parts.sequence > 999) {
    issues.push(issue('sequence', 'INVALID_SEQUENCE', '实验序号必须是 1 至 999 的整数'));
  }
  if (issues.length) return { ok: false, issues };
  return { ok: true, value: `EXP-${parts.date.replaceAll('-', '')}-${String(parts.sequence).padStart(3, '0')}`, issues: [] };
}

export function parseExperimentNo(value: string): CoreResult<ExperimentNoParts> {
  const match = EXPERIMENT_NO.exec(value);
  if (!match) return { ok: false, issues: [issue('experimentNo', 'INVALID_EXPERIMENT_NO', '实验编号格式必须为 EXP-YYYYMMDD-NNN')] };
  const date = `${match[1]}-${match[2]}-${match[3]}`;
  const sequence = Number(match[4]);
  const result = formatExperimentNo({ date, sequence });
  return result.ok ? { ok: true, value: { date, sequence }, issues: [] } : { ok: false, issues: result.issues };
}

export function isValidExperimentNo(value: string): boolean {
  return parseExperimentNo(value).ok;
}

export const buildExperimentNo = formatExperimentNo;
