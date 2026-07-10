import { type ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface SectionCardProps {
  title: string;
  tone?: 'default' | 'danger';
  children: ReactNode;
}

export function SectionCard({ title, tone = 'default', children }: SectionCardProps) {
  return (
    <section
      className={cn(
        'p-4 rounded-2xl border',
        tone === 'danger'
          ? 'border-red-200 bg-red-50/40'
          : 'border-gray-100 bg-white shadow-sm',
      )}
    >
      <h2
        className={cn(
          'text-xs font-semibold uppercase tracking-wider mb-3',
          tone === 'danger' ? 'text-red-600' : 'text-gray-500',
        )}
      >
        {title}
      </h2>
      {children}
    </section>
  );
}
