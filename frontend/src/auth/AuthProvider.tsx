import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
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
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserPublic | null>(null);
  const [status, setStatus] = useState<AuthStatus>('loading');

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
    } catch {
      clearTokens();
      setUser(null);
      setStatus('unauthenticated');
    }
  }, []);

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
      // 1) ¿Hay access token en memoria? (recarga tibia dentro de los 15 min no aplica
      //    porque se pierde; pero cubre el caso de login en la misma sesión).
      const me = await fetchMe();
      if (me) {
        setUser(me);
        setStatus('authenticated');
        return;
      }
      // 2) Sin access válido → intentar refresh.
      await refresh();
    })();

    return unsub;
  }, [fetchMe, refresh]);

  const login = useCallback(async (email: string, password: string) => {
    const tokens = await apiPost<TokenOut>(
      '/auth/login',
      { email, password },
      { publicEndpoint: true },
    );
    setTokens(tokens.access_token, tokens.refresh_token);
    const me = await apiGet<UserPublic>('/auth/me');
    setUser(me);
    setStatus('authenticated');
  }, []);

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
    },
    [],
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
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ user, status, login, register, logout, refresh }),
    [user, status, login, register, logout, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
