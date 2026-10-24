import type { FieldDefinition } from '../contracts.js';
import { editDistance } from '../text/editDistance.js';
import { normalizeFieldName } from '../text/normalizeText.js';
import type { FieldMatch } from './types.js';

function scoreName(input: string, candidate: string): number {
  if (input === candidate) return 1;
  if (candidate.startsWith(input) || input.startsWith(candidate)) {
    return 0.88 + Math.min(input.length, candidate.length) / Math.max(input.length, candidate.length) * 0.1;
  }
  if (candidate.includes(input) || input.includes(candidate)) {
    return 0.68 + Math.min(input.length, candidate.length) / Math.max(input.length, candidate.length) * 0.19;
  }
  const allowed = input.length <= 3 ? 0 : input.length <= 7 ? 1 : 2;
  if (allowed === 0) return 0;
  const distance = editDistance(input, candidate, allowed);
  return distance <= allowed ? 0.6 - distance * 0.1 : 0;
}

export function matchField(inputName: string, fields: FieldDefinition[]): FieldMatch | null {
  const input = normalizeFieldName(inputName);
  if (!input) return null;
  const matches = fields
    .map((field) => ({ field, score: scoreName(input, normalizeFieldName(field.name)) }))
    .filter((match) => match.score > 0)
    .sort((left, right) => right.score - left.score || left.field.sortOrder - right.field.sortOrder);
  const best = matches[0];
  if (!best) return null;
  if (matches.some((match, index) => index > 0 && match.score === best.score)) return null;
  return best;
}
