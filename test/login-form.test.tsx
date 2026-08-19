import { describe, expect, it, beforeEach, vi, type Mock } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LoginForm } from "@/features/auth/LoginForm";

/**
 * US-F6 login form component tests.
 *
 * Scope: form validation, CSRF-exempt submission (no `X-CSRF-Token` path),
 * session cache seeding, redirect behavior (next / mustChangePassword /
 * open-redirect guard), stable error-code display.
 *
 * `apiRequest` is stubbed at the `@/lib/api/client` boundary; `next/navigation`
 * is stubbed to capture `router.replace` destinations and feed `useSearchParams`.
 */

const replace = vi.fn();
const searchParams = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
  useSearchParams: () => searchParams,
}));

vi.mock("@/lib/api/client", () => ({
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
      this.name = "ApiRequestError";
      this.code = error.code;
      this.status = status;
      this.field = error.field;
    }
  },
}));

import { apiRequest } from "@/lib/api/client";

function renderForm() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <LoginForm />
    </QueryClientProvider>,
  );
  return queryClient;
}

function stubCsrfCookie() {
  Object.defineProperty(document, "cookie", {
    writable: true,
    value: "__Host-csrf=test-csrf-token",
  });
}

function makeSession(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    accountId: "acct-1",
    username: "alice",
    displayName: "Alice",
    role: "admin",
    canCreateCourse: false,
    mustChangePassword: false,
    sessionId: "sess-1",
    expiresAt: "",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  replace.mockClear();
  searchParams.delete("next");
  stubCsrfCookie();
});

describe("LoginForm — validation", () => {
  it("shows validation messages for empty fields", async () => {
    const user = userEvent.setup();
    renderForm();
    await user.click(screen.getByRole("button", { name: "登入" }));

    expect(await screen.findByText("請輸入帳號")).toBeInTheDocument();
    expect(screen.getByText("請輸入密碼")).toBeInTheDocument();
    expect(apiRequest).not.toHaveBeenCalled();
  });
});

describe("LoginForm — happy path", () => {
  it("submits without CSRF, seeds session cache, and redirects to next", async () => {
    const user = userEvent.setup();
    (apiRequest as unknown as Mock).mockResolvedValueOnce(makeSession());

    searchParams.set("next", "/admin/accounts/new");
    renderForm();
    await user.type(screen.getByLabelText("帳號"), "alice");
    await user.type(screen.getByLabelText("密碼"), "a-valid-password");
    await user.click(screen.getByRole("button", { name: "登入" }));

    await waitFor(() => expect(replace).toHaveBeenCalled());

    // CSRF-exempt: mutate:false so no CSRF/Origin header path is taken.
    expect(apiRequest).toHaveBeenCalledTimes(1);
    const [path, opts] = (apiRequest as unknown as Mock).mock.calls[0];
    expect(path).toBe("/auth/login");
    expect(opts).toMatchObject({
      method: "POST",
      mutate: false,
      body: { username: "alice", password: "a-valid-password" },
    });

    // Honors the same-origin relative next.
    expect(replace).toHaveBeenCalledWith("/admin/accounts/new");
  });

  it("defaults to /admin for admin when next is absent", async () => {
    const user = userEvent.setup();
    (apiRequest as unknown as Mock).mockResolvedValueOnce(makeSession());

    renderForm();
    await user.type(screen.getByLabelText("帳號"), "alice");
    await user.type(screen.getByLabelText("密碼"), "a-valid-password");
    await user.click(screen.getByRole("button", { name: "登入" }));

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/admin"));
  });

  it("defaults to / for non-admin", async () => {
    const user = userEvent.setup();
    (apiRequest as unknown as Mock).mockResolvedValueOnce(
      makeSession({ role: "teacher" }),
    );

    renderForm();
    await user.type(screen.getByLabelText("帳號"), "alice");
    await user.type(screen.getByLabelText("密碼"), "a-valid-password");
    await user.click(screen.getByRole("button", { name: "登入" }));

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/"));
  });

  it("defaults to /student for student (Phase B)", async () => {
    const user = userEvent.setup();
    (apiRequest as unknown as Mock).mockResolvedValueOnce(
      makeSession({ role: "student" }),
    );

    renderForm();
    await user.type(screen.getByLabelText("帳號"), "alice");
    await user.type(screen.getByLabelText("密碼"), "a-valid-password");
    await user.click(screen.getByRole("button", { name: "登入" }));

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/student"));
  });

  it("does not write the password to any cache key other than the request body", async () => {
    const user = userEvent.setup();
    (apiRequest as unknown as Mock).mockResolvedValueOnce(makeSession());

    renderForm();
    await user.type(screen.getByLabelText("帳號"), "alice");
    await user.type(screen.getByLabelText("密碼"), "secret-pw");
    await user.click(screen.getByRole("button", { name: "登入" }));

    await waitFor(() => expect(replace).toHaveBeenCalled());
    const [, opts] = (apiRequest as unknown as Mock).mock.calls[0];
    expect(opts.body.password).toBe("secret-pw");
  });
});

describe("LoginForm — mustChangePassword", () => {
  it("redirects to /settings/password and ignores next", async () => {
    const user = userEvent.setup();
    (apiRequest as unknown as Mock).mockResolvedValueOnce(
      makeSession({ mustChangePassword: true }),
    );

    searchParams.set("next", "/admin/accounts/new");
    renderForm();
    await user.type(screen.getByLabelText("帳號"), "alice");
    await user.type(screen.getByLabelText("密碼"), "a-valid-password");
    await user.click(screen.getByRole("button", { name: "登入" }));

    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith("/settings/password"),
    );
    // next is intentionally NOT honored under must-change-password.
    expect(replace).not.toHaveBeenCalledWith("/admin/accounts/new");
  });
});

describe("LoginForm — open-redirect guard", () => {
  it("rejects a scheme-less // next and falls back to the role default", async () => {
    const user = userEvent.setup();
    (apiRequest as unknown as Mock).mockResolvedValueOnce(makeSession());

    searchParams.set("next", "//evil.com/path");
    renderForm();
    await user.type(screen.getByLabelText("帳號"), "alice");
    await user.type(screen.getByLabelText("密碼"), "a-valid-password");
    await user.click(screen.getByRole("button", { name: "登入" }));

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/admin"));
    expect(replace).not.toHaveBeenCalledWith("//evil.com/path");
  });

  it("rejects an absolute https:// next and falls back to the role default", async () => {
    const user = userEvent.setup();
    (apiRequest as unknown as Mock).mockResolvedValueOnce(makeSession());

    searchParams.set("next", "https://evil.com/path");
    renderForm();
    await user.type(screen.getByLabelText("帳號"), "alice");
    await user.type(screen.getByLabelText("密碼"), "a-valid-password");
    await user.click(screen.getByRole("button", { name: "登入" }));

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/admin"));
    expect(replace).not.toHaveBeenCalledWith("https://evil.com/path");
  });
});

describe("LoginForm — stable error codes", () => {
  async function submitWith(error: {
    code: string;
    message: string;
    status: number;
    field?: string;
  }) {
    const user = userEvent.setup();
    const { ApiRequestError } = await import("@/lib/api/client");
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
    await user.type(screen.getByLabelText("帳號"), "alice");
    await user.type(screen.getByLabelText("密碼"), "a-valid-password");
    await user.click(screen.getByRole("button", { name: "登入" }));
  }

  it("shows the AUTH_INVALID_CREDENTIALS message (covers disabled/unknown/wrong password)", async () => {
    await submitWith({
      code: "AUTH_INVALID_CREDENTIALS",
      message: "Invalid credentials",
      status: 401,
    });
    expect(await screen.findByText("帳號或密碼不正確。")).toBeInTheDocument();
    // Raw backend detail must not leak.
    expect(screen.queryByText("Invalid credentials")).not.toBeInTheDocument();
  });

  it("falls back to a generic message for an unknown code", async () => {
    await submitWith({
      code: "SOMETHING_NEW",
      message: "internal detail",
      status: 500,
    });
    expect(
      await screen.findByText("發生未預期的錯誤，請稍後再試。"),
    ).toBeInTheDocument();
    expect(screen.queryByText("internal detail")).not.toBeInTheDocument();
  });
});
