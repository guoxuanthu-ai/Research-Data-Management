import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Button } from './Button';
import { Icon } from './Icon';
import { cx } from '../../utils/cx';

export function Modal({ open, onClose, title, description, children, footer, size = 'md' }: { open: boolean; onClose: () => void; title: string; description?: string; children: ReactNode; footer?: ReactNode; size?: 'sm' | 'md' | 'lg' | 'xl' }) {
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.setTimeout(() => panel.current?.querySelector<HTMLElement>('input,button,select,textarea')?.focus(), 0);
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key === 'Tab' && panel.current) {
        const items = Array.from(panel.current.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href]'));
        const first = items[0], last = items[items.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    document.addEventListener('keydown', keydown);
    return () => { document.body.style.overflow = oldOverflow; document.removeEventListener('keydown', keydown); previous?.focus(); };
  }, [open, onClose]);
  if (!open) return null;
  const widths = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-3xl', xl: 'max-w-5xl' };
  return createPortal(<div className="fixed inset-0 z-50 flex items-end justify-center bg-ink-950/40 p-0 backdrop-blur-[2px] sm:items-center sm:p-6" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div ref={panel} role="dialog" aria-modal="true" aria-label={title} className={cx('flex max-h-[92dvh] w-full animate-in flex-col rounded-t-2xl bg-white shadow-lift duration-200 sm:rounded-2xl', widths[size])}>
      <div className="flex items-start justify-between gap-4 border-b border-ink-100 px-5 py-4 sm:px-6"><div><h2 className="text-lg font-semibold text-ink-950">{title}</h2>{description && <p className="mt-1 text-sm text-ink-500">{description}</p>}</div><Button variant="ghost" className="-mr-2 -mt-1 h-11 w-11 px-0" onClick={onClose} aria-label="关闭"><Icon name="close" /></Button></div>
      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">{children}</div>
      {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-ink-100 bg-ink-50/50 px-5 py-4 sm:px-6">{footer}</div>}
    </div>
  </div>, document.body);
}

export function ConfirmDialog({ open, onClose, onConfirm, title, description, confirmText = '确认删除', loading }: { open: boolean; onClose: () => void; onConfirm: () => void; title: string; description: string; confirmText?: string; loading?: boolean }) {
  return <Modal open={open} onClose={onClose} title={title} size="sm" footer={<><Button variant="secondary" onClick={onClose}>取消</Button><Button variant={confirmText.includes('删除') ? 'danger' : 'primary'} loading={loading ?? false} onClick={onConfirm}>{confirmText}</Button></>}><p className="leading-6 text-ink-600">{description}</p></Modal>;
}
