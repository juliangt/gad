import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { formatRelativeTime, formatDistance, formatRating } from '../format';

describe('formatRelativeTime', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-09T18:00:00Z'));
  });
  afterEach(() => vi.useRealTimers());

  it('dice "ahora" para menos de 1 minuto', () => {
    const d = new Date('2026-07-09T17:59:30Z');
    expect(formatRelativeTime(d)).toBe('hace menos de un minuto');
  });

  it('dice "hace X minutos"', () => {
    const d = new Date('2026-07-09T17:50:00Z');
    expect(formatRelativeTime(d)).toBe('hace 10 minutos');
  });

  it('dice "hace X horas"', () => {
    const d = new Date('2026-07-09T14:00:00Z');
    expect(formatRelativeTime(d)).toBe('hace alrededor de 4 horas');
  });

  it('dice "hace X días" para >24h', () => {
    const d = new Date('2026-07-06T18:00:00Z');
    // date-fns v4 con locale es no añade "alrededor de" para días exactos.
    expect(formatRelativeTime(d)).toBe('hace 3 días');
  });
});

describe('formatDistance', () => {
  it('formatea metros cuando < 1000', () => {
    expect(formatDistance(350)).toBe('350 m');
  });

  it('redondea metros a entero', () => {
    expect(formatDistance(42.7)).toBe('43 m');
  });

  it('formatea kilómetros con un decimal cuando >= 1000', () => {
    expect(formatDistance(1200)).toBe('1,2 km');
  });

  it('formatea kilómetros grandes', () => {
    expect(formatDistance(5400)).toBe('5,4 km');
  });

  it('devuelve "0 m" para 0 o negativo', () => {
    expect(formatDistance(0)).toBe('0 m');
    expect(formatDistance(-10)).toBe('0 m');
  });
});

describe('formatRating', () => {
  it('formatea con coma decimal y una posición', () => {
    // 4.86 redondea a 4,9 (4.85 en IEEE754 es 4.8499... y redondea a 4,8).
    expect(formatRating(4.86)).toBe('4,9');
    expect(formatRating(4.0)).toBe('4,0');
  });

  it('trunca null/undefined a "—"', () => {
    expect(formatRating(null)).toBe('—');
    expect(formatRating(undefined)).toBe('—');
  });

  it('trunca NaN a "—"', () => {
    expect(formatRating(NaN)).toBe('—');
  });
});
