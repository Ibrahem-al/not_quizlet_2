import { type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface ButtonProps {
  variant?: 'primary' | 'secondary' | 'outline' | 'danger' | 'ghost';
  size?: 'sm' | 'default' | 'lg' | 'icon';
  children: ReactNode;
  className?: string;
  disabled?: boolean;
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  type?: 'button' | 'submit' | 'reset';
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

export function Button({
  variant = 'primary',
  size = 'default',
  children,
  className,
  disabled = false,
  onClick,
  type = 'button',
  icon,
}: ButtonProps) {
  return (
    <motion.button
      type={type}
      onClick={onClick}
      disabled={disabled}
      whileTap={disabled ? undefined : { scale: 0.97 }}
      whileHover={disabled ? undefined : { scale: 1.02 }}
      className={cn(
        'inline-flex items-center justify-center gap-2 font-medium cursor-pointer transition-colors',
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
        if (e.target.matches(':focus-visible')) {
          e.target.style.boxShadow = 'var(--shadow-focus)';
        }
      }}
      onBlur={(e) => {
        e.target.style.boxShadow = '';
      }}
    >
      {icon && <span className="flex-shrink-0">{icon}</span>}
      {children}
    </motion.button>
  );
}
