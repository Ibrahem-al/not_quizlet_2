import { type ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface BadgeProps {
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info';
  children: ReactNode;
  className?: string;
}

const variantStyles: Record<string, React.CSSProperties> = {
  default: {
    background: 'var(--color-muted)',
    color: 'var(--color-text-secondary)',
  },
  success: {
    background: 'var(--color-success-light)',
    color: 'var(--color-success)',
  },
  warning: {
    background: 'var(--color-warning-light)',
    color: 'var(--color-warning)',
  },
  danger: {
    background: 'var(--color-danger-light)',
    color: 'var(--color-danger)',
  },
  info: {
    background: 'var(--color-primary-light)',
    color: 'var(--color-primary)',
  },
};

export function Badge({ variant = 'default', children, className }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
        className,
      )}
      style={variantStyles[variant]}
    >
      {children}
    </span>
  );
}
