import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import * as client from '../../../api/client';
import { useMe, useUpdateMe, useUploadAvatar, useBlocks, useBlock, useUser, meKey } from '../hooks';
import { createTestQueryClient, createWrapper } from './test-utils';
import type { UserDetail, BlockOut, UserPublicProfile } from '../types';

vi.mock('../../../api/client', () => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  apiPut: vi.fn(),
  apiPatch: vi.fn(),
  apiDelete: vi.fn(),
}));

const ME: UserDetail = {
  id: 'u1', email: 'martin@example.com', display_name: 'Martín',
  avatar_url: null, bio: null, birth_date: null, gender: 'undisclosed',
  reputation_score: 4.8, verification_level: 'email',
  preferences: {
    default_search_radius_m: 2000,
    default_plan_validity_mins: 120,
    activity_types: ['coffee', 'drinks'],
    group_size_preference: 'either', age_range_min: 18, age_range_max: 99,
    gender_preference: 'any', notify_new_plans: true, notify_messages: true,
    notify_pending_alerts: true,
  },
};

const BLOCK: BlockOut = { blocked_id: 'u2', created_at: '2026-07-09T12:00:00Z' };

beforeEach(() => vi.clearAllMocks());

describe('useMe', () => {
  it('trae UserDetail desde GET /me', async () => {
    (client.apiGet as any).mockResolvedValueOnce(ME);
    const { result } = renderHook(() => useMe(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(ME);
    expect(client.apiGet).toHaveBeenCalledWith('/me');
  });

  it('expone error cuando /me falla', async () => {
    (client.apiGet as any).mockRejectedValueOnce(new Error('401'));
    const { result } = renderHook(() => useMe(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeTruthy();
  });
});

describe('useUpdateMe', () => {
  it('hace PATCH /me y actualiza la caché de me', async () => {
    const qc = createTestQueryClient();
    // Precargamos /me en caché. Como gcTime: 0 limpiaría una query sin observers,
    // mantenemos useMe montada para que la key ['me'] tenga un suscriptor activo.
    (client.apiGet as any).mockResolvedValue(ME);
    qc.setQueryData(meKey, ME);
    const updated = { ...ME, display_name: 'Martín G.' };
    (client.apiPatch as any).mockResolvedValueOnce(updated);
    const { result } = renderHook(
      () => ({ me: useMe(), update: useUpdateMe() }),
      { wrapper: createWrapper(qc) },
    );
    await waitFor(() => expect(result.current.me.isSuccess).toBe(true));
    result.current.update.mutate({ display_name: 'Martín G.' });
    await waitFor(() => expect(result.current.update.isSuccess).toBe(true));
    expect(client.apiPatch).toHaveBeenCalledWith('/me', { display_name: 'Martín G.' });
    expect(qc.getQueryData(meKey)).toEqual(updated);
  });
});

describe('useUploadAvatar', () => {
  it('envía FormData con el archivo a POST /me/avatar', async () => {
    const updated = { ...ME, avatar_url: 'https://cdn/avatar.png' };
    (client.apiPost as any).mockImplementation(async (_path: string, body: any) => {
      expect(body).toBeInstanceOf(FormData);
      expect((body as FormData).get('file')).toBeInstanceOf(File);
      return updated;
    });
    const { result } = renderHook(() => useUploadAvatar(), { wrapper: createWrapper() });
    const file = new File(['x'], 'a.png', { type: 'image/png' });
    result.current.mutate(file);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(client.apiPost).toHaveBeenCalledWith('/me/avatar', expect.any(FormData));
  });
});

describe('useBlocks', () => {
  it('trae BlockOut[] desde GET /me/blocks', async () => {
    (client.apiGet as any).mockResolvedValueOnce([BLOCK]);
    const { result } = renderHook(() => useBlocks(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([BLOCK]);
    expect(client.apiGet).toHaveBeenCalledWith('/me/blocks');
  });
});

describe('useBlock', () => {
  it('hace POST /users/{id}/block', async () => {
    (client.apiPost as any).mockResolvedValueOnce(BLOCK);
    const { result } = renderHook(() => useBlock(), { wrapper: createWrapper() });
    result.current.mutate('u2');
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(client.apiPost).toHaveBeenCalledWith('/users/u2/block');
  });
});

describe('useUser', () => {
  it('trae UserPublicProfile desde GET /users/{id}', async () => {
    const pub: UserPublicProfile = {
      id: 'u2', display_name: 'Julieta', avatar_url: null, bio: null,
      reputation_score: 4.9, verification_level: 'google',
    };
    (client.apiGet as any).mockResolvedValueOnce(pub);
    const { result } = renderHook(() => useUser('u2'), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(pub);
    expect(client.apiGet).toHaveBeenCalledWith('/users/u2');
  });

  it('no consulta cuando falta el id', () => {
    const { result } = renderHook(() => useUser(''), { wrapper: createWrapper() });
    expect(result.current.fetchStatus).toBe('idle');
    expect(client.apiGet).not.toHaveBeenCalled();
  });
});
