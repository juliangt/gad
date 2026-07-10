import { AlertCircle, RefreshCw } from 'lucide-react';
import { Button } from './Button';

export interface ErrorStateProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
  retryLabel?: string;
}

export function ErrorState({
  title = 'Algo salió mal',
  message = 'No pudimos cargar esto. Probá de nuevo.',
  onRetry,
  retryLabel = 'Reintentar',
}: ErrorStateProps) {
  return (
    <div className="flex flex-col items-center justify-center text-center px-6 py-12">
      <AlertCircle className="w-10 h-10 text-red-400 mb-4" />
      <h3 className="text-base font-semibold text-gray-900">{title}</h3>
      <p className="text-sm text-gray-500 mt-1 max-w-xs">{message}</p>
      {onRetry && (
        <Button variant="secondary" size="sm" onClick={onRetry} className="mt-4">
          <RefreshCw className="w-4 h-4" />
          {retryLabel}
        </Button>
      )}
    </div>
  );
}
