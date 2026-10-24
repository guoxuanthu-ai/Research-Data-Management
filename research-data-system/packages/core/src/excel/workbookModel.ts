export type WorkbookCell = string | number | boolean | null;

export interface WorksheetModel {
  name: string;
  rows: WorkbookCell[][];
}

export interface WorkbookModel {
  sheets: WorksheetModel[];
}

export const BASIC_INFO_SHEET = '基本信息';
export const SUBJECT_CODE_HEADER = '主体编号';
export const SUBJECT_NAME_HEADER = '主体名称';
export const LIFECYCLE_ID_HEADER = '生命周期ID';
