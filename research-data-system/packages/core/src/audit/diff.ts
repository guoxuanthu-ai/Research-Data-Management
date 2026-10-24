export interface AuditChange {
  path: string;
  type: 'added' | 'removed' | 'changed';
  before: unknown;
  after: unknown;
}

function isContainer(value: unknown): value is Record<string, unknown> | unknown[] {
  return typeof value === 'object' && value !== null;
}

function keysOf(value: Record<string, unknown> | unknown[]): string[] {
  return Array.isArray(value) ? value.map((_, index) => String(index)) : Object.keys(value);
}

function childPath(path: string, key: string, array: boolean): string {
  if (array) return `${path}[${key}]`;
  return path ? `${path}.${key}` : key;
}

export function diffAudit(before: unknown, after: unknown): AuditChange[] {
  const changes: AuditChange[] = [];
  const visit = (left: unknown, right: unknown, path: string): void => {
    if (Object.is(left, right)) return;
    if (isContainer(left) && isContainer(right) && Array.isArray(left) === Array.isArray(right)) {
      const keys = new Set([...keysOf(left), ...keysOf(right)]);
      for (const key of [...keys].sort((a, b) => a.localeCompare(b, 'en', { numeric: true }))) {
        const leftRecord = left as Record<string, unknown>;
        const rightRecord = right as Record<string, unknown>;
        const hasLeft = Object.hasOwn(leftRecord, key);
        const hasRight = Object.hasOwn(rightRecord, key);
        const nextPath = childPath(path, key, Array.isArray(left));
        if (!hasLeft) changes.push({ path: nextPath, type: 'added', before: undefined, after: rightRecord[key] });
        else if (!hasRight) changes.push({ path: nextPath, type: 'removed', before: leftRecord[key], after: undefined });
        else visit(leftRecord[key], rightRecord[key], nextPath);
      }
      return;
    }
    const type = left === undefined ? 'added' : right === undefined ? 'removed' : 'changed';
    changes.push({ path, type, before: left, after: right });
  };
  visit(before, after, '');
  return changes;
}

export const auditDiff = diffAudit;
export const createAuditDiff = diffAudit;
