import { useContext } from 'react';
import { AuthContext, type AuthContextValue } from './AuthProvider';

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth debe usarse dentro de <AuthProvider>.');
  }
  return ctx;
}

export { AuthProvider } from './AuthProvider';
export type { AuthContextValue, AuthStatus } from './AuthProvider';
