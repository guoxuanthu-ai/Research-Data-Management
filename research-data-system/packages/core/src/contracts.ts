export type SubjectType = 'product' | 'experiment';
export type ValueType = 'number' | 'text' | 'date';

export interface ValidationIssue {
  path: string;
  code: string;
  message: string;
  severity?: 'error' | 'warning';
}

export interface FieldDefinition {
  id: string;
  name: string;
  unit: string;
  valueType: ValueType;
  required: boolean;
  minValue: number | null;
  maxValue: number | null;
  sortOrder: number;
}

export interface ProcessStructure {
  id: string;
  processDefId?: string | null;
  name: string;
  sortOrder: number;
  fields: FieldDefinition[];
}

export interface TemplateDto {
  id: string;
  version: number;
  processes: ProcessStructure[];
}

export interface RecordValueDto {
  fieldId: string;
  value: string;
}

export interface RecordDto {
  id?: string;
  processDefId: string | null;
  processName: string;
  processSort: number;
  sourceTemplateId: string | null;
  sourceTemplateVersion: number | null;
  fields: FieldDefinition[];
  values: RecordValueDto[];
  deletedAt: string | null;
  lifecycleId?: string;
  stageKey?: 'powder' | 'pressing' | 'heat_treatment' | `custom:${string}` | null;
}

export interface SubjectDetailDto {
  type: SubjectType;
  templateId?: string;
  code: string;
  name: string;
  purpose: string;
  ownerName: string;
  date: string;
  remark: string;
  records: RecordDto[];
}

export interface SmartAssignment {
  fieldId: string;
  fieldName: string;
  value: string;
  rawSegment: string;
  unit: string | null;
  score: number;
}

export interface SmartParseResult {
  matchedAssignments: SmartAssignment[];
  unmatchedSegments: string[];
  warnings: ValidationIssue[];
  fieldConflicts: Array<{ fieldId: string; segments: string[] }>;
}
