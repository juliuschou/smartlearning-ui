import { describe, expect, it, beforeEach, vi, type Mock } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AccountCreateForm } from '@/features/admin/AccountCreateForm';

/**
 * US-F5 component tests.
 *
 * Scope: form submission behavior — role options (admin/teacher only, never
 * student), tempPassword cleared on success, stable error-code display for
 * 403/409/422, field validation. These are pure component tests; the
 * real-backend flow lives in `test/browser/`.
 *
 * The network layer is stubbed at the `apiRequest` boundary by mocking
 * `@/lib/api/client` so tests don't depend on a running backend.
 */

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

function renderForm() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <AccountCreateForm />
    </QueryClientProvider>,
  );
}

function stubCsrfCookie() {
  Object.defineProperty(document, 'cookie', {
    writable: true,
    value: '__Host-csrf=test-csrf-token',
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  stubCsrfCookie();
});

describe('AccountCreateForm — role options', () => {
  it('offers only 老師 and 管理員 (never 學生/student)', () => {
    renderForm();
    const roleSelect = screen.getByLabelText('角色') as HTMLSelectElement;
    const options = Array.from(roleSelect.options).map((o) => o.value);
    expect(options).toEqual(['teacher', 'admin']);
    expect(options).not.toContain('student');
  });
});

describe('AccountCreateForm — validation', () => {
  it('shows validation messages for empty required fields', async () => {
    const user = userEvent.setup();
    renderForm();
    await user.click(screen.getByRole('button', { name: '建立帳號' }));

    expect(await screen.findByText('請輸入帳號名稱')).toBeInTheDocument();
    expect(screen.getByText('請輸入顯示名稱')).toBeInTheDocument();
    expect(screen.getByText('臨時密碼至少 12 字元')).toBeInTheDocument();
  });

  it('rejects a temp password shorter than 12 chars', async () => {
    const user = userEvent.setup();
    renderForm();
    await user.type(screen.getByLabelText('帳號名稱'), 'alice');
    await user.type(screen.getByLabelText('顯示名稱'), 'Alice');
    await user.type(screen.getByLabelText('臨時密碼'), 'short');
    await user.click(screen.getByRole('button', { name: '建立帳號' }));

    expect(await screen.findByText('臨時密碼至少 12 字元')).toBeInTheDocument();
    expect(apiRequest).not.toHaveBeenCalled();
  });
});

describe('AccountCreateForm — happy path', () => {
  it('submits, clears tempPassword, and shows mustChangePassword on success', async () => {
    const user = userEvent.setup();
    (apiRequest as unknown as Mock).mockResolvedValueOnce({
      id: 'acct-1',
      username: 'alice',
      displayName: 'Alice',
      role: 'teacher',
      status: 'ACTIVE',
      canCreateCourse: true,
      mustChangePassword: true,
      disabledAt: null,
      createdAt: '2026-08-19T00:00:00.000Z',
    });

    renderForm();
    await user.type(screen.getByLabelText('帳號名稱'), 'alice');
    await user.type(screen.getByLabelText('顯示名稱'), 'Alice');
    await user.type(screen.getByLabelText('臨時密碼'), 'a-valid-12-char-pw');

    const pwInput = screen.getByLabelText('臨時密碼') as HTMLInputElement;
    expect(pwInput.value).toBe('a-valid-12-char-pw');

    await user.click(screen.getByRole('button', { name: '建立帳號' }));

    // The success banner surfaces mustChangePassword.
    expect(
      await screen.findByText(/mustChangePassword=true/),
    ).toBeInTheDocument();
    expect(screen.getByText(/已建立帳號「alice」/)).toBeInTheDocument();

    // Password is cleared immediately on success — never persisted.
    await waitFor(() => {
      expect(
        (screen.getByLabelText('臨時密碼') as HTMLInputElement).value,
      ).toBe('');
    });

    // The payload sent over the wire is the form values (no password leak in body beyond tempPassword).
    expect(apiRequest).toHaveBeenCalledTimes(1);
    const [path, opts] = (apiRequest as unknown as Mock).mock.calls[0];
    expect(path).toBe('/admin/accounts');
    expect(opts).toMatchObject({
      method: 'POST',
      mutate: true,
      body: {
        username: 'alice',
        displayName: 'Alice',
        role: 'teacher',
        canCreateCourse: true,
        tempPassword: 'a-valid-12-char-pw',
      },
    });
  });
});

describe('AccountCreateForm — stable error codes', () => {
  async function submitWith(error: {
    code: string;
    message: string;
    status: number;
    field?: string;
  }) {
    const user = userEvent.setup();
    // Use the mocked ApiRequestError class so the form's `instanceof` check
    // matches and the ErrorAlert renders.
    const { ApiRequestError } = await import('@/lib/api/client');
    (apiRequest as unknown as Mock).mockRejectedValueOnce(
      new ApiRequestError(
        {
          code: error.code,
          message: error.message,
          blocking: true,
          field: error.field,
        },
        error.status,
      ),
    );
    renderForm();
    await user.type(screen.getByLabelText('帳號名稱'), 'alice');
    await user.type(screen.getByLabelText('顯示名稱'), 'Alice');
    await user.type(screen.getByLabelText('臨時密碼'), 'a-valid-12-char-pw');
    await user.click(screen.getByRole('button', { name: '建立帳號' }));
  }

  it('shows the stable 403 (forbidden) message for non-admin', async () => {
    await submitWith({ code: 'FORBIDDEN', message: 'Forbidden', status: 403 });
    expect(
      await screen.findByText('你沒有權限執行此操作。'),
    ).toBeInTheDocument();
  });

  it('shows the stable 409 (conflict) message for a duplicate username', async () => {
    await submitWith({
      code: 'CONFLICT',
      message: 'Username already exists',
      status: 409,
      field: 'username',
    });
    expect(
      await screen.findByText('此帳號名稱已被使用，請換一個。'),
    ).toBeInTheDocument();
  });

  it('shows the stable validation message for a 422', async () => {
    await submitWith({
      code: 'VALIDATION_FAILED',
      message: 'Invalid',
      status: 422,
      field: 'tempPassword',
    });
    expect(
      await screen.findByText('輸入內容不符合要求，請檢查欄位後再試一次。'),
    ).toBeInTheDocument();
  });

  it('falls back to a generic message for an unknown code', async () => {
    await submitWith({
      code: 'SOMETHING_NEW',
      message: 'internal detail',
      status: 500,
    });
    expect(
      await screen.findByText('發生未預期的錯誤，請稍後再試。'),
    ).toBeInTheDocument();
    // Raw internal detail must not leak.
    expect(screen.queryByText('internal detail')).not.toBeInTheDocument();
  });
});
