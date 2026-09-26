import { type ReactNode, type ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'style'> {
  variant?: 'primary' | 'secondary' | 'outline' | 'danger' | 'ghost';
  size?: 'sm' | 'default' | 'lg' | 'icon';
  children: ReactNode;
  icon?: ReactNode;
}

const variantStyles: Record<string, React.CSSProperties> = {
  primary: {
    background: 'var(--color-primary)',
    color: '#ffffff',
    border: 'none',
  },
  secondary: {
    background: 'var(--color-muted)',
    color: 'var(--color-text)',
    border: 'none',
  },
  outline: {
    background: 'transparent',
    color: 'var(--color-text)',
    border: '1px solid var(--color-border)',
  },
  danger: {
    background: 'var(--color-danger)',
    color: '#ffffff',
    border: 'none',
  },
  ghost: {
    background: 'transparent',
    color: 'var(--color-text)',
    border: 'none',
  },
};

const sizeClasses: Record<string, string> = {
  sm: 'h-8 px-3 text-sm',
  default: 'h-10 px-4',
  lg: 'h-12 px-6 text-lg',
  icon: 'h-10 w-10',
};

// Hover/press scale is plain CSS: this component renders on every page, and
// animating it with framer-motion pulled that library into every route.
export function Button({
  variant = 'primary',
  size = 'default',
  children,
  className,
  disabled = false,
  type = 'button',
  icon,
  onFocus,
  onBlur,
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      type={type}
      disabled={disabled}
      className={cn(
        'inline-flex items-center justify-center gap-2 font-medium cursor-pointer',
        'transition-[color,background-color,border-color,transform] duration-150',
        !disabled && 'hover:scale-[1.02] active:scale-[0.97] motion-reduce:transform-none',
        sizeClasses[size],
        disabled && 'opacity-50 pointer-events-none',
        className,
      )}
      style={{
        ...variantStyles[variant],
        borderRadius: 'var(--radius-button)',
        fontFamily: 'var(--font-sans)',
        outline: 'none',
      }}
      onFocus={(e) => {
        if (e.currentTarget.matches(':focus-visible')) {
          e.currentTarget.style.boxShadow = 'var(--shadow-focus)';
        }
        onFocus?.(e);
      }}
      onBlur={(e) => {
        e.currentTarget.style.boxShadow = '';
        onBlur?.(e);
      }}
    >
      {icon && <span className="flex-shrink-0">{icon}</span>}
      {children}
    </button>
  );
}
