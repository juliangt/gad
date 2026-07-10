// frontend/src/features/plans/__tests__/useUserLocation.test.tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { ReactNode } from 'react';
import { useUserLocation } from '../useUserLocation';

// Desde src/features/plans/__tests__/ el módulo geo está en ../../../lib/geo.
vi.mock('../../../lib/geo', () => ({
  getCurrentPosition: vi.fn(),
}));

import { getCurrentPosition } from '../../../lib/geo';

const mockGeo = vi.mocked(getCurrentPosition);

function wrapper({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

describe('useUserLocation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('arranca en estado idle con location null', () => {
    const { result } = renderHook(() => useUserLocation(), { wrapper });
    expect(result.current.status).toBe('idle');
    expect(result.current.location).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it('pasa a requesting al llamar request() y a granted con coords al resolver', async () => {
    // Adaptado a la firma real: getCurrentPosition devuelve { latitude, longitude, accuracy }.
    mockGeo.mockResolvedValueOnce({
      latitude: -34.59,
      longitude: -58.43,
      accuracy: 10,
    });
    const { result } = renderHook(() => useUserLocation(), { wrapper });

    let p!: Promise<void>;
    act(() => {
      p = result.current.request();
    });
    expect(result.current.status).toBe('requesting');

    await act(async () => {
      await p;
    });
    expect(result.current.status).toBe('granted');
    expect(result.current.location).toEqual([-34.59, -58.43]);
  });

  it('pasa a denied si getCurrentPosition rechaza (permiso denegado)', async () => {
    mockGeo.mockRejectedValueOnce(new Error('User denied Geolocation'));
    const { result } = renderHook(() => useUserLocation(), { wrapper });

    await act(async () => {
      await result.current.request().catch(() => {});
    });
    expect(result.current.status).toBe('denied');
    expect(result.current.location).toBeNull();
    expect(result.current.error).toBeInstanceOf(Error);
  });

  it('setManualLocation fija coordenadas y pasa a granted (fallback)', () => {
    const { result } = renderHook(() => useUserLocation(), { wrapper });
    act(() => {
      result.current.setManualLocation(-34.6, -58.4);
    });
    expect(result.current.status).toBe('granted');
    expect(result.current.location).toEqual([-34.6, -58.4]);
  });

  it('reset vuelve a idle', async () => {
    mockGeo.mockResolvedValueOnce({
      latitude: -34.59,
      longitude: -58.43,
      accuracy: 10,
    });
    const { result } = renderHook(() => useUserLocation(), { wrapper });
    await act(async () => {
      await result.current.request();
    });
    act(() => result.current.reset());
    expect(result.current.status).toBe('idle');
    expect(result.current.location).toBeNull();
  });
});
