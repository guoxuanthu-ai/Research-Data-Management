import * as XLSX from 'xlsx';
import type { WorkbookModel } from '../core.js';
import { ApiError } from '../../http/errors.js';

export function decodeWorkbook(buffer: Buffer): WorkbookModel {
  if (buffer.length < 4 || buffer[0] !== 0x50 || buffer[1] !== 0x4b) {
    throw new ApiError(400, 'IMPORT_INVALID', '文件不是有效的 .xlsx 工作簿');
  }
  try {
    const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: false, raw: false });
    return { sheets: workbook.SheetNames.map((name) => ({
      name,
      rows: XLSX.utils.sheet_to_json(workbook.Sheets[name]!, { header: 1, defval: '', raw: false }) as unknown[][],
    })) };
  } catch {
    throw new ApiError(400, 'IMPORT_INVALID', 'Excel 文件无法解析');
  }
}

export function encodeWorkbook(model: WorkbookModel): Buffer {
  const workbook = XLSX.utils.book_new();
  for (const sheet of model.sheets) {
    const worksheet = XLSX.utils.aoa_to_sheet(sheet.rows);
    XLSX.utils.book_append_sheet(workbook, worksheet, sheet.name.slice(0, 31) || 'Sheet');
  }
  if (!model.sheets.length) XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([]), '基本信息');
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx', compression: true }) as Buffer;
}
