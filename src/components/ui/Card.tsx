import { type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface CardProps {
  variant?: 'default' | 'elevated' | 'outlined' | 'ghost';
  hover?: boolean;
  className?: string;
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
}: CardProps) {
  return (
    <motion.div
      onClick={onClick}
      whileHover={
        hover
          ? { y: -2, boxShadow: 'var(--shadow-card-hover)' }
          : undefined
      }
      transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
      className={cn(
        'overflow-hidden',
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
    </motion.div>
  );
}
