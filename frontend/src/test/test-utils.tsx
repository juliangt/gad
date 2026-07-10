import type { ReactElement, ReactNode } from 'react';
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import {
  AuthProvider,
  AuthContext,
  type AuthContextValue,
} from '../auth/AuthProvider';

/** QueryClient fresco por test (sin retry infinito, sin refetch). */
function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: 0, gcTime: 0 },
      mutations: { retry: false },
    },
  });
}

interface Options {
  initialEntries?: string[];
  /** Si se pasa, se usa este valor de contexto en lugar del AuthProvider real. */
  authValue?: AuthContextValue;
}

export function renderWithProviders(ui: ReactElement, options: Options = {}) {
  const queryClient = makeQueryClient();
  const initialEntries = options.initialEntries ?? ['/'];

  const wrapper = ({ children }: { children: ReactNode }) => {
    const authed = options.authValue ? (
      <AuthContext.Provider value={options.authValue}>{children}</AuthContext.Provider>
    ) : (
      <AuthProvider>{children}</AuthProvider>
    );
    return (
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={initialEntries}>{authed}</MemoryRouter>
      </QueryClientProvider>
    );
  };
  return render(ui, { wrapper });
}
