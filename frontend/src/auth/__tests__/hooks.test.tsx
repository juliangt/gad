import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { usePasswordResetRequest, usePasswordResetConfirm } from '../hooks';

// Mock del api client: capturamos los args con los que se llama apiPost.
const apiPostMock = vi.fn();
vi.mock('../../api/client', () => ({
  apiPost: (...args: unknown[]) => apiPostMock(...args),
  apiGet: vi.fn(),
  apiPatch: vi.fn(),
  apiDelete: vi.fn(),
  apiPut: vi.fn(),
  setApplyAuth: vi.fn(),
}));

function wrapper(client: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

function newClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
}

describe('usePasswordResetRequest', () => {
  beforeEach(() => apiPostMock.mockReset());

  it('llama POST /auth/password-reset/request con {email}', async () => {
    apiPostMock.mockResolvedValueOnce({ message: 'Si el email existe...' });
    const { result } = renderHook(() => usePasswordResetRequest(), {
      wrapper: wrapper(newClient()),
    });

    await result.current.mutateAsync('user@example.com');

    expect(apiPostMock).toHaveBeenCalledWith(
      '/auth/password-reset/request',
      { email: 'user@example.com' },
      { publicEndpoint: true },
    );
  });

  it('propaga ApiError en rate limit', async () => {
    const err = Object.assign(new Error('limite'), {
      code: 'rate_limit_exceeded',
      status: 429,
      detail: 'limite',
      retryAfter: 20,
    });
    apiPostMock.mockRejectedValueOnce(err);
    const { result } = renderHook(() => usePasswordResetRequest(), {
      wrapper: wrapper(newClient()),
    });

    await expect(result.current.mutateAsync('user@example.com')).rejects.toThrow('limite');
  });
});

describe('usePasswordResetConfirm', () => {
  beforeEach(() => apiPostMock.mockReset());

  it('llama POST /auth/password-reset/confirm con {token, new_password}', async () => {
    apiPostMock.mockResolvedValueOnce({ message: 'Contraseña restablecida' });
    const { result } = renderHook(() => usePasswordResetConfirm(), {
      wrapper: wrapper(newClient()),
    });

    await result.current.mutateAsync({ token: 'tok123', new_password: 'nuevaClave123' });

    expect(apiPostMock).toHaveBeenCalledWith(
      '/auth/password-reset/confirm',
      { token: 'tok123', new_password: 'nuevaClave123' },
      { publicEndpoint: true },
    );
  });
});
