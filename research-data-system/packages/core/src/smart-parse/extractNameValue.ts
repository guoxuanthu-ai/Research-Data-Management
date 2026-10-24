import type { NameValueSegment } from './types.js';

const NUMBER_START = /[+-]?(?:\d+(?:\.\d*)?|\.\d+)/;

export function extractNameValue(segment: string): NameValueSegment | null {
  const normalized = segment.normalize('NFKC').trim();
  const colon = normalized.search(/[:：]/);
  if (colon >= 0) {
    const name = normalized.slice(0, colon).trim();
    const value = normalized.slice(colon + 1).trim();
    return name && value ? { name, value } : null;
  }

  const whitespace = normalized.search(/\s/);
  if (whitespace >= 0) {
    const name = normalized.slice(0, whitespace).trim();
    const value = normalized.slice(whitespace).trim();
    return name && value ? { name, value } : null;
  }

  const number = NUMBER_START.exec(normalized);
  if (number && number.index > 0) {
    const name = normalized.slice(0, number.index).trim();
    const value = normalized.slice(number.index).trim();
    return name && value ? { name, value } : null;
  }
  return null;
}
