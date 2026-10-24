import { forwardRef, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { cx } from '../../utils/cx';

export function Field({ label, hint, error, required, children, className }: { label?: string; hint?: string; error?: string; required?: boolean; children: ReactNode; className?: string }) {
  return <label className={cx('block min-w-0', className)}>{label && <span className="mb-1.5 block text-sm font-medium text-ink-700">{label}{required && <span className="ml-1 text-danger-500">*</span>}</span>}{children}{error ? <span className="mt-1.5 block text-xs text-danger-700">{error}</span> : hint ? <span className="mt-1.5 block text-xs text-ink-400">{hint}</span> : null}</label>;
}
const base = 'min-h-touch w-full rounded-lg border bg-white px-3 text-sm text-ink-900 placeholder:text-ink-300 transition-colors disabled:cursor-not-allowed disabled:bg-ink-50 disabled:text-ink-400 hover:border-ink-300 focus:border-brand-500';
export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { error?: boolean; unit?: string }>(function Input({ className, error, unit, ...props }, ref) {
  return <span className="relative block">{unit && <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-ink-400">{unit}</span>}<input ref={ref} className={cx(base, error ? 'border-danger-500' : 'border-ink-200', unit && 'pr-16', className)} {...props} /></span>;
});
export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className, children, ...props }, ref) {
  return <select ref={ref} className={cx(base, 'cursor-pointer appearance-none bg-[linear-gradient(45deg,transparent_50%,theme(colors.ink.400)_50%),linear-gradient(135deg,theme(colors.ink.400)_50%,transparent_50%)] bg-[position:calc(100%-16px)_50%,calc(100%-11px)_50%] bg-[size:5px_5px,5px_5px] bg-no-repeat pr-9', className)} {...props}>{children}</select>;
});
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...props }, ref) {
  return <textarea ref={ref} className={cx(base, 'min-h-24 resize-y py-2.5 leading-6', className)} {...props} />;
});
