import { expect, it } from 'vitest';
import { diffAudit } from '@rds/core';

it('生成确定性的结构化审计 diff', () => {
  const before = { name: '旧名称', nested: { value: 1, removed: true }, values: ['a'] };
  const after = { name: '旧名称', nested: { value: 2, added: 'x' }, values: ['a', 'b'] };
  expect(diffAudit(before, after)).toEqual([
    { path: 'nested.added', type: 'added', before: undefined, after: 'x' },
    { path: 'nested.removed', type: 'removed', before: true, after: undefined },
    { path: 'nested.value', type: 'changed', before: 1, after: 2 },
    { path: 'values[1]', type: 'added', before: undefined, after: 'b' },
  ]);
  expect(diffAudit(before, before)).toEqual([]);
});
