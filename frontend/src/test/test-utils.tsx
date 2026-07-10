import type { ReactElement, ReactNode } from 'react';
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '../auth/AuthProvider';

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
}

export function renderWithProviders(ui: ReactElement, options: Options = {}) {
  const queryClient = makeQueryClient();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <MemoryRouter initialEntries={options.initialEntries ?? ['/']}>
          {children}
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
  return render(ui, { wrapper });
}
