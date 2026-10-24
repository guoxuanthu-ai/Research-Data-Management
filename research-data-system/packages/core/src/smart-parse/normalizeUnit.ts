import type { FieldDefinition } from '../contracts.js';
import { normalizeUnitName } from '../text/normalizeText.js';
import type { NormalizedUnitValue } from './types.js';

const NUMBER_WITH_UNIT = /^([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?)(.*)$/i;

export function normalizeUnit(value: string, field: FieldDefinition): NormalizedUnitValue {
  const trimmed = value.normalize('NFKC').trim();
  if (field.valueType !== 'number') return { value: trimmed, unit: null };
  const match = NUMBER_WITH_UNIT.exec(trimmed);
  if (!match) return { value: trimmed, unit: null };
  const unit = match[2]?.trim() ?? '';
  return { value: match[1] ?? trimmed, unit: unit || null };
}

export function unitsEqual(left: string | null, right: string | null): boolean {
  return normalizeUnitName(left ?? '') === normalizeUnitName(right ?? '');
}
