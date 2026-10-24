import type { ReactNode } from 'react';
import { cx } from '../../utils/cx';
export interface Column<T> { key: string; title: ReactNode; render: (row: T) => ReactNode; className?: string; }
export function DataTable<T>({ columns, rows, rowKey, onRowClick }: { columns: Column<T>[]; rows: T[]; rowKey: (row: T) => string; onRowClick?: (row: T) => void }) {
  return <div className="scrollbar-thin overflow-x-auto"><table className="w-full min-w-[720px] border-collapse text-left"><thead><tr className="border-b border-ink-100 bg-ink-50/60">{columns.map((column) => <th key={column.key} className={cx('whitespace-nowrap px-5 py-3 text-xs font-semibold text-ink-500', column.className)}>{column.title}</th>)}</tr></thead><tbody className="divide-y divide-ink-100">{rows.map((row) => <tr key={rowKey(row)} onClick={() => onRowClick?.(row)} className={cx('bg-white transition-colors', onRowClick && 'cursor-pointer hover:bg-brand-50/40')}>{columns.map((column) => <td key={column.key} className={cx('px-5 py-4 align-middle text-sm text-ink-700', column.className)}>{column.render(row)}</td>)}</tr>)}</tbody></table></div>;
}
