import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider, type UseQueryResult } from '@tanstack/react-query';
import type { PropsWithChildren } from 'react';
import * as client from '../../../api/client';
import {
  useTrustedContacts,
  useAddTrustedContact,
  useDeleteTrustedContact,
  usePing,
  usePeerLocation,
  useCreateShareLink,
  useRevokeShareLink,
  useSos,
  usePublicLocation,
} from '../hooks';
import type {
  TrustedContactOut,
  PeerLocationOut,
  ShareLinkOut,
  SosOut,
  PublicLocationOut,
} from '../types';

vi.spyOn(client, 'apiGet');
vi.spyOn(client, 'apiPost');
vi.spyOn(client, 'apiDelete');

const mocked = {
  apiGet: vi.mocked(client.apiGet),
  apiPost: vi.mocked(client.apiPost),
  apiDelete: vi.mocked(client.apiDelete),
};

function createWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return function Wrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  };
}

const CONTACT: TrustedContactOut = {
  id: 'c1',
  contact_type: 'email',
  contact_value: 'amigo@example.com',
  label: 'Amigo',
  created_at: '2026-07-09T18:00:00Z',
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useTrustedContacts', () => {
  it('trae la lista desde GET /me/trusted-contacts', async () => {
    mocked.apiGet.mockResolvedValueOnce([CONTACT]);
    const { result } = renderHook(() => useTrustedContacts(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([CONTACT]);
    expect(mocked.apiGet).toHaveBeenCalledWith('/me/trusted-contacts');
  });
});

describe('useAddTrustedContact', () => {
  it('POST /me/trusted-contacts y invalida trusted-contacts', async () => {
    mocked.apiPost.mockResolvedValueOnce(CONTACT);
    const invalidate = vi.fn();
    const { result } = renderHook(
      () => useAddTrustedContact(invalidate),
      { wrapper: createWrapper() },
    );
    result.current.mutate({
      contact_type: 'email',
      contact_value: 'amigo@example.com',
      label: 'Amigo',
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mocked.apiPost).toHaveBeenCalledWith('/me/trusted-contacts', {
      contact_type: 'email',
      contact_value: 'amigo@example.com',
      label: 'Amigo',
    });
    expect(invalidate).toHaveBeenCalledWith(['trusted-contacts']);
  });
});

describe('useDeleteTrustedContact', () => {
  it('DELETE /me/trusted-contacts/{id} y invalida', async () => {
    mocked.apiDelete.mockResolvedValueOnce({ message: 'Contacto eliminado' });
    const invalidate = vi.fn();
    const { result } = renderHook(
      () => useDeleteTrustedContact(invalidate),
      { wrapper: createWrapper() },
    );
    result.current.mutate('c1');
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mocked.apiDelete).toHaveBeenCalledWith('/me/trusted-contacts/c1');
    expect(invalidate).toHaveBeenCalledWith(['trusted-contacts']);
  });
});

describe('usePing', () => {
  it('POST /safety/{id}/ping con lat/lng', async () => {
    mocked.apiPost.mockResolvedValueOnce({ message: 'Ubicación actualizada' });
    const invalidate = vi.fn();
    const { result } = renderHook(() => usePing(invalidate), { wrapper: createWrapper() });
    result.current.mutate({ matchId: 'm1', lat: -34.6, lng: -58.4 });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mocked.apiPost).toHaveBeenCalledWith('/safety/m1/ping', { lat: -34.6, lng: -58.4 });
    // Ping NO invalida peer (lo hace PeerLocation por polling); pero por defecto no invalida nada.
    expect(invalidate).not.toHaveBeenCalled();
  });
});

describe('usePeerLocation', () => {
  it('GET /safety/{id}/peer', async () => {
    const peer: PeerLocationOut = { lat: -34.6, lng: -58.4, last_ping_at: '2026-07-09T18:00:00Z' };
    mocked.apiGet.mockResolvedValueOnce(peer);
    const { result } = renderHook(
      () => usePeerLocation('m1', { enabled: true, intervalMs: false }),
      { wrapper: createWrapper() },
    ) as { result: { current: UseQueryResult<PeerLocationOut> } };
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(peer);
    expect(mocked.apiGet).toHaveBeenCalledWith('/safety/m1/peer');
  });

  it('no consulta cuando enabled=false', async () => {
    const { result } = renderHook(
      () => usePeerLocation('m1', { enabled: false, intervalMs: false }),
      { wrapper: createWrapper() },
    );
    expect(result.current.fetchStatus).toBe('idle');
    expect(mocked.apiGet).not.toHaveBeenCalled();
  });
});

describe('useCreateShareLink', () => {
  it('POST /safety/{id}/share-link → {token,url}', async () => {
    const out: ShareLinkOut = { token: 'tok-123', url: '/s/tok-123' };
    mocked.apiPost.mockResolvedValueOnce(out);
    const invalidate = vi.fn();
    const { result } = renderHook(
      () => useCreateShareLink(invalidate),
      { wrapper: createWrapper() },
    );
    result.current.mutate('m1');
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mocked.apiPost).toHaveBeenCalledWith('/safety/m1/share-link');
    expect(invalidate).toHaveBeenCalledWith(['safety', 'share-link', 'm1']);
  });
});

describe('useRevokeShareLink', () => {
  it('DELETE /safety/{id}/share-link?token=X', async () => {
    mocked.apiDelete.mockResolvedValueOnce({ message: 'Link revocado' });
    const invalidate = vi.fn();
    const { result } = renderHook(
      () => useRevokeShareLink(invalidate),
      { wrapper: createWrapper() },
    );
    result.current.mutate({ matchId: 'm1', token: 'tok-123' });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mocked.apiDelete).toHaveBeenCalledWith('/safety/m1/share-link', {
      query: { token: 'tok-123' },
    });
    expect(invalidate).toHaveBeenCalledWith(['safety', 'share-link', 'm1']);
  });
});

describe('useSos', () => {
  it('POST /safety/{id}/sos con PingIn → SosOut', async () => {
    const out: SosOut = { event_id: 'e1', message: 'Alerta enviada' };
    mocked.apiPost.mockResolvedValueOnce(out);
    const { result } = renderHook(() => useSos(), { wrapper: createWrapper() });
    result.current.mutate({ matchId: 'm1', lat: -34.6, lng: -58.4 });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(out);
    expect(mocked.apiPost).toHaveBeenCalledWith('/safety/m1/sos', { lat: -34.6, lng: -58.4 });
  });
});

describe('usePublicLocation (PÚBLICO)', () => {
  it('GET /s/{token} con publicEndpoint: true (sin auth)', async () => {
    const pub: PublicLocationOut = {
      match_id: 'm1',
      user_display_name: 'Martín',
      lat: -34.6,
      lng: -58.4,
      last_ping_at: '2026-07-09T18:00:00Z',
      expired: false,
    };
    mocked.apiGet.mockResolvedValueOnce(pub);
    const { result } = renderHook(() => usePublicLocation('tok-123'), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(pub);
    expect(mocked.apiGet).toHaveBeenCalledWith('/s/tok-123', { publicEndpoint: true });
  });
});
