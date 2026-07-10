import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '../auth/AuthProvider';
import { ExploreStub } from '../pages/ExploreStub';

function renderApp() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const router = createMemoryRouter(
    [{ path: '/', element: <ExploreStub /> }],
    { initialEntries: ['/'] },
  );
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </QueryClientProvider>,
  );
}

describe('App smoke', () => {
  it('renderiza sin crashear', () => {
    const { getByText } = renderApp();
    expect(getByText(/Explorar — próximamente/i)).toBeInTheDocument();
  });
});
