import { describe, it, expect, vi, beforeEach } from 'vitest';
import { haversine, getCurrentPosition } from '../geo';

describe('haversine', () => {
  it('devuelve 0 para el mismo punto', () => {
    expect(haversine(-34.59, -58.43, -34.59, -58.43)).toBe(0);
  });

  it('calcula distancia entre dos puntos de Buenos Aires (~1km)', () => {
    // Obelisco (-34.6037, -58.3816) → Plaza de Mayo (-34.6084, -58.3736)
    const d = haversine(-34.6037, -58.3816, -34.6084, -58.3736);
    // Aproximadamente 900m; toleramos ±15%.
    expect(d).toBeGreaterThan(800);
    expect(d).toBeLessThan(1000);
  });

  it('calcula distancia larga (BA → Córdoba ~650km)', () => {
    const d = haversine(-34.6037, -58.3816, -31.4201, -64.1888);
    expect(d).toBeGreaterThan(640_000);
    expect(d).toBeLessThan(665_000);
  });

  it('es simétrica', () => {
    const a = haversine(10, 20, 30, 40);
    const b = haversine(30, 40, 10, 20);
    expect(a).toBeCloseTo(b, 1);
  });
});

describe('getCurrentPosition', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('resuelve con coords cuando el navegador las da', async () => {
    const coords = { latitude: -34.59, longitude: -58.43, accuracy: 10 };
    vi.stubGlobal('navigator', {
      geolocation: {
        getCurrentPosition: (success: (p: { coords: typeof coords }) => void) =>
          success({ coords }),
      },
    });

    await expect(getCurrentPosition()).resolves.toEqual({
      latitude: -34.59,
      longitude: -58.43,
      accuracy: 10,
    });
  });

  it('rechaza con error de permiso cuando se deniega', async () => {
    vi.stubGlobal('navigator', {
      geolocation: {
        getCurrentPosition: (
          _success: unknown,
          error: (e: { code: number; message: string }) => void,
        ) => error({ code: 1, message: 'User denied' }),
      },
    });

    await expect(getCurrentPosition()).rejects.toThrow();
  });

  it('rechaza con timeout si no responde en el plazo', async () => {
    vi.stubGlobal('navigator', {
      geolocation: {
        getCurrentPosition: () => {
          // nunca llama a success ni error
        },
      },
    });
    vi.useFakeTimers();

    const promise = getCurrentPosition(50); // 50ms
    vi.advanceTimersByTime(60);
    await expect(promise).rejects.toThrow();
    vi.useRealTimers();
  });

  it('rechaza si no hay geolocation disponible', async () => {
    vi.stubGlobal('navigator', {});
    await expect(getCurrentPosition()).rejects.toThrow();
  });
});
