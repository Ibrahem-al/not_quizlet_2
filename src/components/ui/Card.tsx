import { type ReactNode, type HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

interface CardProps extends Omit<HTMLAttributes<HTMLDivElement>, 'style' | 'onClick'> {
  variant?: 'default' | 'elevated' | 'outlined' | 'ghost';
  hover?: boolean;
  children: ReactNode;
  onClick?: () => void;
}

const variantStyles: Record<string, React.CSSProperties> = {
  default: {
    background: 'var(--color-surface)',
    border: '1px solid var(--color-border)',
    boxShadow: 'var(--shadow-card)',
  },
  elevated: {
    background: 'var(--color-surface)',
    border: '1px solid var(--color-border-light)',
    boxShadow: 'var(--shadow-md)',
  },
  outlined: {
    background: 'transparent',
    border: '1px solid var(--color-border)',
    boxShadow: 'none',
  },
  ghost: {
    background: 'transparent',
    border: 'none',
    boxShadow: 'none',
  },
};

export function Card({
  variant = 'default',
  hover = false,
  className,
  children,
  onClick,
  ...rest
}: CardProps) {
  return (
    <div
      {...rest}
      onClick={onClick}
      className={cn(
        'overflow-hidden',
        hover && 'sf-card-hover',
        onClick && 'cursor-pointer',
        className,
      )}
      style={{
        ...variantStyles[variant],
        borderRadius: 'var(--radius-card)',
        padding: '1.25rem',
      }}
    >
      {children}
    </div>
  );
}
