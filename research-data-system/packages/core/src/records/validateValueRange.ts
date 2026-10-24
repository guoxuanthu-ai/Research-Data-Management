import type { FieldDefinition } from '../contracts.js';
import { issue } from '../result.js';
import type { ValidationIssue } from '../result.js';

export function validateValueRange(field: FieldDefinition, value: number, path = field.id): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (field.minValue !== null && value < field.minValue) {
    issues.push(issue(path, 'BELOW_RANGE', `${field.name} 小于建议下限 ${field.minValue}`, 'warning'));
  }
  if (field.maxValue !== null && value > field.maxValue) {
    issues.push(issue(path, 'ABOVE_RANGE', `${field.name} 大于建议上限 ${field.maxValue}`, 'warning'));
  }
  return issues;
}
