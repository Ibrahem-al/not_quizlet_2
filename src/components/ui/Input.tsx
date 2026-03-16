import { forwardRef, type ReactNode, type InputHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  helperText?: string;
  error?: string;
  icon?: ReactNode;
  className?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, helperText, error, icon, className, id, ...props }, ref) => {
    const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label
            htmlFor={inputId}
            className="text-sm font-medium"
            style={{ color: 'var(--color-text-secondary)' }}
          >
            {label}
          </label>
        )}
        <div className="relative">
          {icon && (
            <span
              className="absolute left-3 top-1/2 -translate-y-1/2 flex items-center pointer-events-none"
              style={{ color: 'var(--color-text-tertiary)' }}
            >
              {icon}
            </span>
          )}
          <input
            ref={ref}
            id={inputId}
            className={cn(
              'w-full h-10 px-3 text-base transition-colors',
              icon ? 'pl-10' : '',
              className,
            )}
            style={{
              background: 'var(--color-surface)',
              color: 'var(--color-text)',
              border: `1px solid ${error ? 'var(--color-danger)' : 'var(--color-border)'}`,
              borderRadius: 'var(--radius-md)',
              fontFamily: 'var(--font-sans)',
              outline: 'none',
            }}
            onFocus={(e) => {
              if (!error) {
                e.target.style.borderColor = 'var(--color-primary)';
                e.target.style.boxShadow = 'var(--shadow-focus)';
              }
            }}
            onBlur={(e) => {
              e.target.style.borderColor = error
                ? 'var(--color-danger)'
                : 'var(--color-border)';
              e.target.style.boxShadow = '';
            }}
            {...props}
          />
        </div>
        {error && (
          <p className="text-sm" style={{ color: 'var(--color-danger)' }}>
            {error}
          </p>
        )}
        {!error && helperText && (
          <p className="text-sm" style={{ color: 'var(--color-text-tertiary)' }}>
            {helperText}
          </p>
        )}
      </div>
    );
  },
);

Input.displayName = 'Input';
