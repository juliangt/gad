// frontend/src/features/reviews/components/StarRating.tsx
import { useState } from 'react';
import { Star } from 'lucide-react';
import { cn } from '../../../lib/utils';

export interface StarRatingProps {
  /** Valor controlado (modo input). */
  value?: number;
  /** Valor inicial (modo display, sin onChange). */
  defaultValue?: number;
  onChange?: (value: number) => void;
  /** Solo lectura. Default: si no hay onChange, es display. */
  readOnly?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const sizeClass = {
  sm: 'w-4 h-4',
  md: 'w-6 h-6',
  lg: 'w-8 h-8',
} as const;

/**
 * StarRating reutilizable.
 *  - Display (readOnly o sin onChange): muestra `value`/`defaultValue` estrellas.
 *  - Input: hover + click para setear 1..5; soporta 0 (deselect al clicar el mismo).
 */
export function StarRating({
  value,
  defaultValue = 0,
  onChange,
  readOnly,
  size = 'md',
  className,
}: StarRatingProps) {
  const isInput = !readOnly && Boolean(onChange);
  const [hover, setHover] = useState<number | null>(null);

  const controlled = value ?? defaultValue;
  const shown = hover ?? controlled;

  const handleClick = (n: number) => {
    if (!isInput || !onChange) return;
    // Clicar la misma estrella la mantiene (no allow 0 en rating de review).
    onChange(n);
  };

  return (
    <div
      className={cn('inline-flex items-center gap-0.5', className)}
      onMouseLeave={() => isInput && setHover(null)}
      role={isInput ? 'radiogroup' : 'img'}
      aria-label={isInput ? `Calificación: ${controlled} de 5` : `${controlled} de 5 estrellas`}
    >
      {[1, 2, 3, 4, 5].map((n) => {
        const filled = n <= shown;
        return (
          <button
            key={n}
            type="button"
            disabled={!isInput}
            tabIndex={isInput ? 0 : -1}
            onClick={() => handleClick(n)}
            onMouseEnter={() => isInput && setHover(n)}
            className={cn(
              'p-0.5 transition-transform',
              isInput && 'hover:scale-110 cursor-pointer',
              !isInput && 'cursor-default',
            )}
            aria-label={`${n} estrella${n > 1 ? 's' : ''}`}
            aria-pressed={isInput ? controlled === n : undefined}
          >
            <Star
              className={cn(
                sizeClass[size],
                filled ? 'text-amber-400 fill-amber-400' : 'text-gray-300 fill-transparent',
              )}
            />
          </button>
        );
      })}
    </div>
  );
}
