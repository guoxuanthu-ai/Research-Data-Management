import type { FieldDefinition } from '../contracts.js';
import { normalizeUnitName } from '../text/normalizeText.js';

export interface ParsedFieldHeader {
  name: string;
  unit: string;
}

export function formatFieldHeader(field: Pick<FieldDefinition, 'name' | 'unit'>): string {
  if (!field.unit) return field.name;
  const existing = parseFieldHeader(field.name);
  if (existing?.unit && normalizeUnitName(existing.unit) === normalizeUnitName(field.unit)) return field.name;
  return `${field.name}（${field.unit}）`;
}

export function parseFieldHeader(header: string): ParsedFieldHeader | null {
  const match = /^(.*?)(?:[（(]([^()（）]*)[）)])?$/.exec(header.trim());
  const name = match?.[1]?.trim() ?? '';
  if (!name) return null;
  return { name, unit: match?.[2]?.trim() ?? '' };
}

export const fieldHeader = formatFieldHeader;
