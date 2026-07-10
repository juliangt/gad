import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useThrottledWatchPosition } from '../useThrottledWatchPosition';

/** Mock de la API de geolocation del navegador. */
type PosCb = (pos: GeolocationPosition) => void;
type ErrCb = (err: GeolocationPositionError) => void;

function makeGeo() {
  let posCb: PosCb | null = null;
  let errCb: ErrCb | null = null;
  // Standard Geolocation.watchPosition(success, error?, options?) contract:
  // the success callback is arg 0, the error callback is arg 1.
  const watch = vi.fn((onPos: PosCb, onErr: ErrCb) => {
    posCb = onPos;
    errCb = onErr;
    return 42; // watchId
  });
  const clear = vi.fn();
  function emit(lat: number, lng: number) {
    posCb?.({
      coords: { latitude: lat, longitude: lng, accuracy: 10, altitude: null, altitudeAccuracy: null, heading: null, speed: null },
      timestamp: Date.now(),
    } as unknown as GeolocationPosition);
  }
  function emitError(code: number) {
    errCb?.({ code, message: 'denied', PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 } as unknown as GeolocationPositionError);
  }
  return { watch, clear, emit, emitError };
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('useThrottledWatchPosition', () => {
  it('arranca watchPosition al activar y emite el primer update enseguida', () => {
    const geo = makeGeo();
    vi.stubGlobal('navigator', { geolocation: { watchPosition: geo.watch, clearWatch: geo.clear } });
    const onPosition = vi.fn();
    const { result } = renderHook(() =>
      useThrottledWatchPosition({ onPosition, throttleMs: 60_000 }),
    );
    expect(result.current.active).toBe(false);

    act(() => result.current.start());
    expect(geo.watch).toHaveBeenCalledTimes(1);
    expect(result.current.active).toBe(true);

    act(() => geo.emit(-34.6, -58.4));
    expect(onPosition).toHaveBeenCalledTimes(1);
    expect(onPosition).toHaveBeenCalledWith(-34.6, -58.4);
    expect(result.current.lastPosition).toEqual({ lat: -34.6, lng: -58.4 });
  });

  it('throttlea: segundo update dentro de la ventana se ignora', () => {
    const geo = makeGeo();
    vi.stubGlobal('navigator', { geolocation: { watchPosition: geo.watch, clearWatch: geo.clear } });
    const onPosition = vi.fn();
    const { result } = renderHook(() =>
      useThrottledWatchPosition({ onPosition, throttleMs: 60_000 }),
    );
    act(() => result.current.start());
    act(() => geo.emit(-34.6, -58.4)); // 1º → emite
    act(() => geo.emit(-34.61, -58.41)); // 2º a los 0ms → ignorado
    expect(onPosition).toHaveBeenCalledTimes(1);
  });

  it('pasado el throttle, el siguiente update se emite', () => {
    const geo = makeGeo();
    vi.stubGlobal('navigator', { geolocation: { watchPosition: geo.watch, clearWatch: geo.clear } });
    const onPosition = vi.fn();
    const { result } = renderHook(() =>
      useThrottledWatchPosition({ onPosition, throttleMs: 60_000 }),
    );
    act(() => result.current.start());
    act(() => geo.emit(-34.6, -58.4)); // 1º emite (t=0)
    vi.advanceTimersByTime(59_999);
    act(() => geo.emit(-34.61, -58.41)); // aún dentro → ignorado
    expect(onPosition).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(2); // t=60001
    act(() => geo.emit(-34.62, -58.42)); // fuera de ventana → emite
    expect(onPosition).toHaveBeenCalledTimes(2);
  });

  it('stop() llama clearWatch y desactiva', () => {
    const geo = makeGeo();
    vi.stubGlobal('navigator', { geolocation: { watchPosition: geo.watch, clearWatch: geo.clear } });
    const { result } = renderHook(() =>
      useThrottledWatchPosition({ onPosition: vi.fn(), throttleMs: 60_000 }),
    );
    act(() => result.current.start());
    act(() => result.current.stop());
    expect(geo.clear).toHaveBeenCalledWith(42);
    expect(result.current.active).toBe(false);
  });

  it('si no hay geolocation, emite onError y no arranca', () => {
    vi.stubGlobal('navigator', {});
    const onError = vi.fn();
    const { result } = renderHook(() =>
      useThrottledWatchPosition({ onPosition: vi.fn(), onError, throttleMs: 60_000 }),
    );
    act(() => result.current.start());
    expect(onError).toHaveBeenCalledTimes(1);
    expect(result.current.active).toBe(false);
  });

  it('error PERMISSION_DENIED → onError con flag', () => {
    const geo = makeGeo();
    vi.stubGlobal('navigator', { geolocation: { watchPosition: geo.watch, clearWatch: geo.clear } });
    const onError = vi.fn();
    const { result } = renderHook(() =>
      useThrottledWatchPosition({ onPosition: vi.fn(), onError, throttleMs: 60_000 }),
    );
    act(() => result.current.start());
    act(() => geo.emitError(1)); // PERMISSION_DENIED
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ denied: true }));
    expect(result.current.active).toBe(false);
  });

  it('desmontar limpia el watch (clearWatch)', () => {
    const geo = makeGeo();
    vi.stubGlobal('navigator', { geolocation: { watchPosition: geo.watch, clearWatch: geo.clear } });
    const { result, unmount } = renderHook(() =>
      useThrottledWatchPosition({ onPosition: vi.fn(), throttleMs: 60_000 }),
    );
    act(() => result.current.start());
    unmount();
    expect(geo.clear).toHaveBeenCalled();
  });

  it('stop() con un último update pendiente lo flushea (opcional, via flushPending)', () => {
    const geo = makeGeo();
    vi.stubGlobal('navigator', { geolocation: { watchPosition: geo.watch, clearWatch: geo.clear } });
    const onPosition = vi.fn();
    const { result } = renderHook(() =>
      useThrottledWatchPosition({ onPosition, throttleMs: 60_000 }),
    );
    act(() => result.current.start());
    act(() => geo.emit(-34.6, -58.4)); // emite t=0
    act(() => geo.emit(-34.7, -58.5)); // throttleado (queda como pendiente)
    act(() => result.current.stop());
    expect(onPosition).toHaveBeenLastCalledWith(-34.7, -58.5); // flush del último pendiente
  });
});
