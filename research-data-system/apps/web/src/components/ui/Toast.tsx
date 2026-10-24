import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { createId } from '../../utils/id';
import { Icon } from './Icon';
import { cx } from '../../utils/cx';
type Toast = { id: string; message: string; tone: 'success' | 'error' | 'info' };
const ToastContext = createContext<{ toast: (message: string, tone?: Toast['tone']) => void } | null>(null);
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const remove = useCallback((id: string) => setItems((current) => current.filter((item) => item.id !== id)), []);
  const toast = useCallback((message: string, tone: Toast['tone'] = 'success') => { const id = createId(); setItems((current) => [...current.slice(-2), { id, message, tone }]); window.setTimeout(() => remove(id), 4500); }, [remove]);
  const value = useMemo(() => ({ toast }), [toast]);
  return <ToastContext.Provider value={value}>{children}<div className="pointer-events-none fixed inset-x-4 top-4 z-[70] flex flex-col items-center gap-2 sm:left-auto sm:right-6 sm:items-end">{items.map((item) => <div key={item.id} role="status" className={cx('pointer-events-auto flex min-h-touch w-full max-w-sm items-center gap-3 rounded-xl border bg-white px-4 py-3 shadow-lift', item.tone === 'success' ? 'border-brand-100 text-brand-800' : item.tone === 'error' ? 'border-red-100 text-danger-700' : 'border-ink-100 text-ink-700')}><Icon name={item.tone === 'success' ? 'check' : item.tone === 'error' ? 'alert' : 'clock'} size={18} /><span className="flex-1 text-sm">{item.message}</span><button onClick={() => remove(item.id)} className="p-2 text-ink-400" aria-label="关闭提示"><Icon name="close" size={16} /></button></div>)}</div></ToastContext.Provider>;
}
export function useToast() { const context = useContext(ToastContext); if (!context) throw new Error('useToast must be used inside ToastProvider'); return context; }
