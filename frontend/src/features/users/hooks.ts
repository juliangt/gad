import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPatch, apiPut, apiPost, apiDelete } from '../../api/client';
import type {
  BlockOut,
  PreferencesIn,
  PreferencesOut,
  UserDetail,
  UserPublicProfile,
  UserUpdateIn,
} from './types';

// Query keys jerárquicas (invalidación granular).
export const meKey = ['me'] as const;
export const blocksKey = ['me', 'blocks'] as const;
export const userKey = (id: string) => ['users', id] as const;

/** Perfil completo del usuario autenticado (GET /me). Fuente canónica del perfil. */
export function useMe() {
  return useQuery({
    queryKey: meKey,
    queryFn: () => apiGet<UserDetail>('/me'),
    staleTime: 30_000,
  });
}

/** PATCH /me — actualiza caché de ['me'] para feedback instantáneo. */
export function useUpdateMe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: UserUpdateIn) => apiPatch<UserDetail>('/me', patch),
    onSuccess: (data) => qc.setQueryData(meKey, data),
  });
}

/** POST /me/avatar (multipart) — actualiza caché de ['me'] con el UserDetail devuelto. */
export function useUploadAvatar() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => {
      const form = new FormData();
      form.append('file', file);
      return apiPost<UserDetail>('/me/avatar', form);
    },
    onSuccess: (data) => qc.setQueryData(meKey, data),
  });
}

/** PUT /me/preferences — invalida ['me'] para refrescar las preferencias embebidas. */
export function useUpdatePreferences() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (prefs: PreferencesIn) =>
      apiPut<PreferencesOut>('/me/preferences', prefs),
    onSuccess: () => qc.invalidateQueries({ queryKey: meKey }),
  });
}

/** DELETE /me (soft-delete) — limpia toda la caché. El logout + redirect lo maneja la página. */
export function useDeleteMe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiDelete<void>('/me'),
    onSuccess: () => qc.clear(),
  });
}

/** GET /users/{id} — perfil público. */
export function useUser(userId: string) {
  return useQuery({
    queryKey: userKey(userId),
    queryFn: () => apiGet<UserPublicProfile>(`/users/${userId}`),
    enabled: Boolean(userId),
  });
}

/** POST /users/{id}/block — invalida ['me','blocks']. */
export function useBlock() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => apiPost<BlockOut>(`/users/${userId}/block`),
    onSuccess: () => qc.invalidateQueries({ queryKey: blocksKey }),
  });
}

/** GET /me/blocks. */
export function useBlocks() {
  return useQuery({
    queryKey: blocksKey,
    queryFn: () => apiGet<BlockOut[]>('/me/blocks'),
  });
}

/** DELETE /me/blocks/{user_id} — invalida ['me','blocks']. */
export function useUnblock() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => apiDelete<{ message: string }>(`/me/blocks/${userId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: blocksKey }),
  });
}
