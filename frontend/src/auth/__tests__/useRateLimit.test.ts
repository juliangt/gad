import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useRateLimit } from '../useRateLimit';

describe('useRateLimit', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('arranca en 0 (no bloqueado)', () => {
    const { result } = renderHook(() => useRateLimit());
    expect(result.current.seconds).toBe(0);
    expect(result.current.blocked).toBe(false);
  });

  it('start(seconds) bloquea y decrementa cada segundo', () => {
    const { result } = renderHook(() => useRateLimit());
    act(() => result.current.start(3));
    expect(result.current.seconds).toBe(3);
    expect(result.current.blocked).toBe(true);

    act(() => vi.advanceTimersByTime(1000));
    expect(result.current.seconds).toBe(2);

    act(() => vi.advanceTimersByTime(1000));
    expect(result.current.seconds).toBe(1);
  });

  it('se desbloquea al llegar a 0', () => {
    const { result } = renderHook(() => useRateLimit());
    act(() => result.current.start(2));
    act(() => vi.advanceTimersByTime(2000));
    expect(result.current.seconds).toBe(0);
    expect(result.current.blocked).toBe(false);
  });

  it('ignora valores no positivos', () => {
    const { result } = renderHook(() => useRateLimit());
    act(() => result.current.start(0));
    expect(result.current.blocked).toBe(false);
    act(() => result.current.start(-5));
    expect(result.current.blocked).toBe(false);
  });
});
