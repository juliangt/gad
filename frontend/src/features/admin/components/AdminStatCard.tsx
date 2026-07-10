import type { LucideIcon } from 'lucide-react';
import { cn } from '../../../lib/utils';

export type StatTone = 'brand' | 'success' | 'warning' | 'danger' | 'info';

export interface AdminStatCardProps {
  label: string;
  value: number | string;
  icon: LucideIcon;
  tone?: StatTone;
}

const TONE: Record<StatTone, string> = {
  brand: 'bg-brand-50 text-brand-700',
  success: 'bg-emerald-50 text-emerald-700',
  warning: 'bg-amber-50 text-amber-700',
  danger: 'bg-red-50 text-red-700',
  info: 'bg-sky-50 text-sky-700',
};

export function AdminStatCard({ label, value, icon: Icon, tone = 'brand' }: AdminStatCardProps) {
  return (
    <div className="glass-panel rounded-2xl p-4 flex items-center gap-4">
      <div className={cn('w-12 h-12 rounded-xl flex items-center justify-center', TONE[tone])}>
        <Icon className="w-6 h-6" aria-hidden="true" />
      </div>
      <div>
        <p className="text-2xl font-bold text-gray-900 leading-tight">{value}</p>
        <p className="text-sm text-gray-600">{label}</p>
      </div>
    </div>
  );
}
