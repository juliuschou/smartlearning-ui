import { describe, expect, it, beforeEach, vi, type Mock } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LogoutButton } from '@/components/auth/LogoutButton';

/**
 * US-F6 logout button component tests.
 *
 * Scope: logout calls `POST /auth/logout` WITH CSRF (`mutate: true`), clears
 * the query cache, and navigates (replace) to `/login` on success.
 */

const replace = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
}));

vi.mock('@/lib/api/client', () => ({
  apiRequest: vi.fn(),
  ApiRequestError: class ApiRequestError extends Error {
    readonly code: string;
    readonly field?: string;
    readonly status: number;
    // Mirrors the real constructor: (error: ApiError, status: number).
    constructor(
      error: { code: string; message: string; field?: string },
      status: number,
    ) {
      super(error.message);
      this.name = 'ApiRequestError';
      this.code = error.code;
      this.status = status;
      this.field = error.field;
    }
  },
}));

import { apiRequest } from '@/lib/api/client';

function renderButton() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  // Seed the cache so we can assert it is cleared after a successful logout.
  queryClient.setQueryData(['session'], { username: 'alice' });
  render(
    <QueryClientProvider client={queryClient}>
      <LogoutButton />
    </QueryClientProvider>,
  );
  return queryClient;
}

function stubCsrfCookie() {
  Object.defineProperty(document, 'cookie', {
    writable: true,
    value: '__Host-csrf=test-csrf-token',
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  replace.mockClear();
  stubCsrfCookie();
});

describe('LogoutButton', () => {
  it('calls /auth/logout WITH CSRF and navigates to /login on success', async () => {
    const user = userEvent.setup();
    (apiRequest as unknown as Mock).mockResolvedValueOnce(null);

    renderButton();
    await user.click(screen.getByRole('button', { name: '登出' }));

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/login'));

    expect(apiRequest).toHaveBeenCalledTimes(1);
    const [path, opts] = (apiRequest as unknown as Mock).mock.calls[0];
    expect(path).toBe('/auth/logout');
    expect(opts).toMatchObject({ method: 'POST', mutate: true });
  });

  it('clears the query cache on success', async () => {
    const user = userEvent.setup();
    (apiRequest as unknown as Mock).mockResolvedValueOnce(null);

    const queryClient = renderButton();
    expect(queryClient.getQueryData(['session'])).toEqual({
      username: 'alice',
    });

    await user.click(screen.getByRole('button', { name: '登出' }));

    await waitFor(() => {
      expect(queryClient.getQueryData(['session'])).toBeUndefined();
    });
  });

  it('still navigates to /login when logout rejects (session already gone)', async () => {
    const user = userEvent.setup();
    const { ApiRequestError } = await import('@/lib/api/client');
    (apiRequest as unknown as Mock).mockRejectedValueOnce(
      new ApiRequestError(
        { code: 'UNAUTHORIZED', message: 'no session', blocking: true },
        401,
      ),
    );

    renderButton();
    await user.click(screen.getByRole('button', { name: '登出' }));

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/login'));
    expect(screen.getByText('登出失敗，請再試一次。')).toBeInTheDocument();
  });
});
