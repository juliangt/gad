import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Countdown para UX de rate limit (429 + Retry-After).
 * `start(segundos)` bloquea el botón durante ese tiempo; `seconds` baja cada segundo.
 */
export function useRateLimit(): {
  seconds: number;
  blocked: boolean;
  start: (seconds: number) => void;
  reset: () => void;
} {
  const [seconds, setSeconds] = useState(0);
  const timerRef = useRef<number | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const reset = useCallback(() => {
    clearTimer();
    setSeconds(0);
  }, [clearTimer]);

  const start = useCallback(
    (secs: number) => {
      const s = Math.ceil(secs);
      if (!Number.isFinite(s) || s <= 0) return;
      clearTimer();
      setSeconds(s);
      timerRef.current = window.setInterval(() => {
        setSeconds((prev) => {
          if (prev <= 1) {
            if (timerRef.current !== null) {
              window.clearInterval(timerRef.current);
              timerRef.current = null;
            }
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    },
    [clearTimer],
  );

  useEffect(() => clearTimer, [clearTimer]);

  return { seconds, blocked: seconds > 0, start, reset };
}
