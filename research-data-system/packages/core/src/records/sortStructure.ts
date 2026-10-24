import type { FieldDefinition, ProcessStructure } from '../contracts.js';

export function sortFields(fields: FieldDefinition[]): FieldDefinition[] {
  return fields
    .map((field, index) => ({ field: { ...field }, index }))
    .sort((left, right) => left.field.sortOrder - right.field.sortOrder || left.index - right.index)
    .map(({ field }) => field);
}

export function sortStructure<T extends ProcessStructure>(processes: T[]): T[] {
  return processes
    .map((process, index) => ({ process, index }))
    .sort((left, right) => left.process.sortOrder - right.process.sortOrder || left.index - right.index)
    .map(({ process }) => ({ ...process, fields: sortFields(process.fields) }));
}
