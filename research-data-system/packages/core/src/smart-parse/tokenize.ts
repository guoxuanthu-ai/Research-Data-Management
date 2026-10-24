export function tokenizeSmartText(text: string): string[] {
  return text
    .split(/[\r\n,，、;；]+/)
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);
}

export const tokenize = tokenizeSmartText;
