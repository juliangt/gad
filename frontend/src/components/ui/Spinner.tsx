import { Loader2 } from 'lucide-react';
import { cn } from '../../lib/utils';

export interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  'aria-label'?: string;
}

const sizeClass = {
  sm: 'w-4 h-4',
  md: 'w-6 h-6',
  lg: 'w-10 h-10',
} as const;

export function Spinner({ size = 'md', className, ...rest }: SpinnerProps) {
  return (
    <Loader2
      className={cn('animate-spin text-brand-600', sizeClass[size], className)}
      aria-label={rest['aria-label'] ?? 'Cargando'}
      role="status"
    />
  );
}
