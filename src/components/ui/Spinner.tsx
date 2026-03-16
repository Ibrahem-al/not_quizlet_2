import { cn } from '@/lib/utils';

interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const sizeMap: Record<string, string> = {
  sm: 'w-4 h-4',
  md: 'w-6 h-6',
  lg: 'w-10 h-10',
};

export function Spinner({ size = 'md', className }: SpinnerProps) {
  return (
    <div
      className={cn(sizeMap[size], 'rounded-full', className)}
      style={{
        border: '2px solid var(--color-border)',
        borderTopColor: 'var(--color-primary)',
        animation: 'spin 0.6s linear infinite',
      }}
    />
  );
}
