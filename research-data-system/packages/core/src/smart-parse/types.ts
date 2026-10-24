import type { FieldDefinition, SmartParseResult } from '../contracts.js';

export interface SmartParseRequest {
  text: string;
  fields: FieldDefinition[];
}

export type { SmartParseResult };

export interface NameValueSegment {
  name: string;
  value: string;
}

export interface FieldMatch {
  field: FieldDefinition;
  score: number;
}

export interface NormalizedUnitValue {
  value: string;
  unit: string | null;
}
