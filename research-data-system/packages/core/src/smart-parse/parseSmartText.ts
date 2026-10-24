import type { FieldDefinition, SmartAssignment, SmartParseResult, ValidationIssue } from '../contracts.js';
import { validateFieldValue } from '../records/validateRecordValues.js';
import { extractNameValue } from './extractNameValue.js';
import { matchField } from './matchField.js';
import { normalizeUnit, unitsEqual } from './normalizeUnit.js';
import { tokenizeSmartText } from './tokenize.js';
import type { NameValueSegment, SmartParseRequest } from './types.js';

function extractDirectText(segment: string, fields: FieldDefinition[]): NameValueSegment | null {
  const normalized = segment.normalize('NFKC');
  const lower = normalized.toLocaleLowerCase('en-US');
  const candidates = fields
    .filter((field) => field.valueType === 'text')
    .map((field) => ({ field, name: field.name.replace(/\([^)]*\)|【[^】]*】/g, '').trim() }))
    .sort((left, right) => right.name.length - left.name.length);
  for (const candidate of candidates) {
    if (!candidate.name || !lower.startsWith(candidate.name.toLocaleLowerCase('en-US'))) continue;
    const value = normalized.slice(candidate.name.length).trim();
    if (value) return { name: candidate.name, value };
  }
  return null;
}

export function parseSmartText(request: SmartParseRequest): SmartParseResult;
export function parseSmartText(text: string, fields: FieldDefinition[]): SmartParseResult;
export function parseSmartText(requestOrText: SmartParseRequest | string, inputFields?: FieldDefinition[]): SmartParseResult {
  const text = typeof requestOrText === 'string' ? requestOrText : requestOrText.text;
  const fields = typeof requestOrText === 'string' ? inputFields ?? [] : requestOrText.fields;
  const matchedAssignments: SmartAssignment[] = [];
  const unmatchedSegments: string[] = [];
  const warnings: ValidationIssue[] = [];

  for (const rawSegment of tokenizeSmartText(text)) {
    const extracted = extractNameValue(rawSegment) ?? extractDirectText(rawSegment, fields);
    if (!extracted) {
      unmatchedSegments.push(rawSegment);
      continue;
    }
    const match = matchField(extracted.name, fields);
    if (!match) {
      unmatchedSegments.push(rawSegment);
      continue;
    }
    const normalized = normalizeUnit(extracted.value, match.field);
    matchedAssignments.push({
      fieldId: match.field.id,
      fieldName: match.field.name,
      value: normalized.value,
      rawSegment,
      unit: normalized.unit,
      score: match.score,
    });
    if (normalized.unit !== null && !unitsEqual(normalized.unit, match.field.unit)) {
      warnings.push({
        path: match.field.id,
        code: 'UNIT_MISMATCH',
        message: `${match.field.name} 的识别单位 ${normalized.unit} 与预设单位 ${match.field.unit || '（空）'} 不一致，请确认`,
        severity: 'warning',
      });
    }
    warnings.push(...validateFieldValue(match.field, normalized.value));
  }

  const segmentsByField = new Map<string, string[]>();
  for (const assignment of matchedAssignments) {
    const segments = segmentsByField.get(assignment.fieldId) ?? [];
    segments.push(assignment.rawSegment);
    segmentsByField.set(assignment.fieldId, segments);
  }
  const fieldConflicts = [...segmentsByField]
    .filter(([, segments]) => segments.length > 1)
    .map(([fieldId, segments]) => ({ fieldId, segments }));
  return { matchedAssignments, unmatchedSegments, warnings, fieldConflicts };
}

export const smartParse = parseSmartText;
