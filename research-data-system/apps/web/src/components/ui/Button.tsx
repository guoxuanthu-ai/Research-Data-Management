import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cx } from '../../utils/cx';
import { Icon, type IconName } from './Icon';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
interface Props extends ButtonHTMLAttributes<HTMLButtonElement> { variant?: Variant; icon?: IconName; loading?: boolean; children?: ReactNode; }
export const Button = forwardRef<HTMLButtonElement, Props>(function Button({ variant = 'primary', icon, loading, className, children, disabled, type = 'button', ...props }, ref) {
  const variants: Record<Variant, string> = {
    primary: 'bg-brand-700 text-white shadow-sm hover:bg-brand-800 active:bg-brand-900 disabled:bg-brand-300',
    secondary: 'border border-ink-200 bg-white text-ink-800 hover:border-brand-300 hover:bg-brand-50 active:bg-brand-100 disabled:text-ink-300',
    ghost: 'text-ink-600 hover:bg-ink-50 hover:text-ink-900 active:bg-ink-100 disabled:text-ink-300',
    danger: 'bg-danger-700 text-white hover:bg-red-800 active:bg-red-900 disabled:bg-red-300',
  };
  return <button ref={ref} type={type} disabled={disabled || loading} className={cx('inline-flex min-h-touch shrink-0 items-center justify-center gap-2 rounded-lg px-4 text-sm font-medium transition-colors duration-150 disabled:cursor-not-allowed', variants[variant], className)} {...props}>
    {loading ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" /> : icon ? <Icon name={icon} size={17} /> : null}{children}
  </button>;
});
