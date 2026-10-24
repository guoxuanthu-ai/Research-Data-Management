export function normalizeText(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase('en-US').replace(/\s+/g, ' ').trim();
}

export function normalizeFieldName(value: string): string {
  return normalizeText(value)
    .replace(/\([^)]*\)|\[[^\]]*\]|【[^】]*】/g, '')
    .replace(/[\s_\-—–·:：]/g, '');
}

export function normalizeUnitName(value: string): string {
  return normalizeText(value).replace(/[\s()（）[\]【】]/g, '');
}
