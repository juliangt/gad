import { Suspense, type ReactNode } from 'react';
import { Spinner } from '../ui/Spinner';

/**
 * Fallback de carga consolidado para rutas lazy.
 * Se mantiene la misma estructura que el `PageSuspense` inline original de F0.
 */
export function PageSuspense({ children }: { children: ReactNode }) {
  return (
    <Suspense
      fallback={
        <div
          className="w-full h-[100dvh] flex items-center justify-center"
          role="status"
          aria-live="polite"
        >
          <Spinner className="w-8 h-8" />
        </div>
      }
    >
      {children}
    </Suspense>
  );
}
