import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPost, setApplyAuth } from '../api/client';
import { createAuthInterceptor, subscribeAuthEvents } from '../api/auth-interceptor';
import {
  getAccessToken,
  getRefreshToken,
  setTokens,
  clearTokens,
} from './tokenStore';
import type { UserPublic } from '../types/common';

export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

interface TokenOut {
  access_token: string;
  refresh_token: string;
  token_type: 'bearer';
  expires_in: number;
  user_id: string;
}

export interface AuthContextValue {
  user: UserPublic | null;
  status: AuthStatus;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, displayName: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  /** POST /auth/change-password → el backend invalida los access tokens previos,
   *  así que limpiamos sesión (sin llamar /auth/logout) y forzamos re-login. */
  changePassword: (oldPassword: string, newPassword: string) => Promise<void>;
  /** POST /auth/oauth/google con {refresh_token: <auth_code>}. */
  loginWithGoogle: (authCode: string) => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserPublic | null>(null);
  const [status, setStatus] = useState<AuthStatus>('loading');
  const queryClient = useQueryClient();

  const invalidateMe = useCallback(() => {
    // Prepara a F2+ (que usa GET /me con key ['me']); barato si no existe aún.
    void queryClient.invalidateQueries({ queryKey: ['me'] });
  }, [queryClient]);

  const fetchMe = useCallback(async (): Promise<UserPublic | null> => {
    if (!getAccessToken()) return null;
    try {
      return await apiGet<UserPublic>('/auth/me');
    } catch {
      return null;
    }
  }, []);

  const refresh = useCallback(async () => {
    const refreshToken = getRefreshToken();
    if (!refreshToken) {
      setStatus('unauthenticated');
      setUser(null);
      return;
    }
    try {
      const tokens = await apiPost<TokenOut>(
        '/auth/refresh',
        { refresh_token: refreshToken },
        { publicEndpoint: true },
      );
      setTokens(tokens.access_token, tokens.refresh_token);
      const me = await apiGet<UserPublic>('/auth/me');
      setUser(me);
      setStatus('authenticated');
      invalidateMe();
    } catch {
      clearTokens();
      setUser(null);
      setStatus('unauthenticated');
    }
  }, [invalidateMe]);

  // Bootstrap: registrar interceptor + intentar recuperar sesión al montar.
  useEffect(() => {
    setApplyAuth(createAuthInterceptor());

    const unsub = subscribeAuthEvents((e) => {
      if (e.type === 'session_expired') {
        setUser(null);
        setStatus('unauthenticated');
      }
    });

    (async () => {
      const me = await fetchMe();
      if (me) {
        setUser(me);
        setStatus('authenticated');
        return;
      }
      await refresh();
    })();

    return unsub;
  }, [fetchMe, refresh]);

  const login = useCallback(
    async (email: string, password: string) => {
      const tokens = await apiPost<TokenOut>(
        '/auth/login',
        { email, password },
        { publicEndpoint: true },
      );
      setTokens(tokens.access_token, tokens.refresh_token);
      const me = await apiGet<UserPublic>('/auth/me');
      setUser(me);
      setStatus('authenticated');
      invalidateMe();
    },
    [invalidateMe],
  );

  const register = useCallback(
    async (email: string, password: string, displayName: string) => {
      const tokens = await apiPost<TokenOut>(
        '/auth/register',
        { email, password, display_name: displayName },
        { publicEndpoint: true },
      );
      setTokens(tokens.access_token, tokens.refresh_token);
      const me = await apiGet<UserPublic>('/auth/me');
      setUser(me);
      setStatus('authenticated');
      invalidateMe();
    },
    [invalidateMe],
  );

  const loginWithGoogle = useCallback(
    async (authCode: string) => {
      const tokens = await apiPost<TokenOut>(
        '/auth/oauth/google',
        { refresh_token: authCode },
        { publicEndpoint: true },
      );
      setTokens(tokens.access_token, tokens.refresh_token);
      const me = await apiGet<UserPublic>('/auth/me');
      setUser(me);
      setStatus('authenticated');
      invalidateMe();
    },
    [invalidateMe],
  );

  const logout = useCallback(async () => {
    const access = getAccessToken();
    if (access) {
      try {
        await apiPost('/auth/logout', { access_token: access });
      } catch {
        // Si el backend ya no acepta el token, igual limpiamos local.
      }
    }
    clearTokens();
    setUser(null);
    setStatus('unauthenticated');
    invalidateMe();
  }, [invalidateMe]);

  const changePassword = useCallback(
    async (oldPassword: string, newPassword: string) => {
      // El endpoint requiere Bearer (access actual); el api client lo inyecta.
      await apiPost('/auth/change-password', {
        old_password: oldPassword,
        new_password: newPassword,
      });
      // ⚠️ El backend invalidó TODOS los access tokens previos (incluido este).
      // No llamamos a /auth/logout (fallaría con 401). Limpiamos y forzamos re-login.
      clearTokens();
      setUser(null);
      setStatus('unauthenticated');
      invalidateMe();
    },
    [invalidateMe],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      status,
      login,
      register,
      logout,
      refresh,
      changePassword,
      loginWithGoogle,
    }),
    [user, status, login, register, logout, refresh, changePassword, loginWithGoogle],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
