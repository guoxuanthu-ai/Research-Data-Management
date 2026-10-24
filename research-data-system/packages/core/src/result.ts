import type { ValidationIssue } from './contracts.js';

export type { ValidationIssue };

export type CoreResult<T> =
  | { ok: true; value: T; issues: ValidationIssue[] }
  | { ok: false; issues: ValidationIssue[] };

export function issue(
  path: string,
  code: string,
  message: string,
  severity: 'error' | 'warning' = 'error',
): ValidationIssue {
  return { path, code, message, severity };
}
