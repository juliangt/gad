import { useMutation } from '@tanstack/react-query';
import { apiPost } from '../api/client';
import type { OKMessage } from '../types/common';

/** POST /auth/password-reset/request → siempre 202 (no filtra si el email existe). */
export function usePasswordResetRequest() {
  return useMutation({
    mutationFn: (email: string) =>
      apiPost<OKMessage>(
        '/auth/password-reset/request',
        { email },
        { publicEndpoint: true },
      ),
  });
}

/** POST /auth/password-reset/confirm con {token, new_password}. Errores: 401 invalid_token. */
export function usePasswordResetConfirm() {
  return useMutation({
    mutationFn: (vars: { token: string; new_password: string }) =>
      apiPost<OKMessage>(
        '/auth/password-reset/confirm',
        vars,
        { publicEndpoint: true },
      ),
  });
}
