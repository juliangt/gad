import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { PropsWithChildren } from 'react';
import * as client from '../../../api/client';
import { useReportUser } from '../hooks';
import type { ReportOut } from '../types';

vi.spyOn(client, 'apiPost');
const apiPost = vi.mocked(client.apiPost);

function createWrapper() {
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return function Wrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  };
}

beforeEach(() => vi.clearAllMocks());

describe('useReportUser', () => {
  it('POST /users/{id}/report con body', async () => {
    const out: ReportOut = {
      id: 'rep1',
      reporter_id: 'u1',
      reported_id: 'u2',
      reason: 'spam',
      description: null,
      status: 'open',
      payload: null,
      created_at: '2026-07-09T18:00:00Z',
    };
    apiPost.mockResolvedValueOnce(out);
    const { result } = renderHook(() => useReportUser(), { wrapper: createWrapper() });
    result.current.mutate({ userId: 'u2', reason: 'spam', description: null });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(apiPost).toHaveBeenCalledWith('/users/u2/report', {
      reason: 'spam',
      description: null,
    });
    expect(result.current.data).toEqual(out);
  });
});
