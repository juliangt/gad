import type { ReactNode } from 'react';
import { cn } from '../../lib/utils';

export type BadgeVariant = 'neutral' | 'brand' | 'success' | 'warning' | 'danger';

export interface BadgeProps {
  variant?: BadgeVariant;
  className?: string;
  children: ReactNode;
}

const variantClass: Record<BadgeVariant, string> = {
  neutral: 'bg-gray-100 text-gray-600',
  brand: 'bg-brand-50 text-brand-600',
  success: 'bg-green-50 text-green-700',
  warning: 'bg-amber-50 text-amber-700',
  danger: 'bg-red-50 text-red-700',
};

export function Badge({ variant = 'neutral', className, children }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium',
        variantClass[variant],
        className,
      )}
    >
      {children}
    </span>
  );
}
