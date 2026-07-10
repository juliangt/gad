// frontend/src/features/plans/components/GpsIndicator.tsx
import { AlertCircle } from 'lucide-react';
import { cn } from '../../../lib/utils';

export type IndicatorStatus = 'searching' | 'fixed' | 'denied';

interface Props {
  status: IndicatorStatus;
  className?: string;
}

/**
 * Migrado de App.tsx:66-94. Mantiene los 3 estados visuales:
 * searching (ámbar, pulso), fixed (brand), denied (rojo).
 */
export function GpsIndicator({ status, className }: Props) {
  return (
    <div
      className={cn(
        'glass-panel rounded-full px-3 py-1.5 flex items-center gap-2 text-xs font-medium transition-all',
        status === 'searching' && 'text-amber-600 border-amber-200/50',
        status === 'fixed' && 'text-brand-600 border-brand-200/50',
        status === 'denied' && 'text-red-500 border-red-200/50',
        className,
      )}
      role="status"
      aria-live="polite"
    >
      {status === 'searching' && (
        <>
          <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
          Buscando señal...
        </>
      )}
      {status === 'fixed' && (
        <>
          <div className="w-2 h-2 rounded-full bg-brand-500" />
          Ubicación precisa
        </>
      )}
      {status === 'denied' && (
        <>
          <AlertCircle className="w-3.5 h-3.5" />
          Sin ubicación
        </>
      )}
    </div>
  );
}
