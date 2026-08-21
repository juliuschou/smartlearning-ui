import { describe, expect, it, beforeEach, vi, type Mock } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ChangePasswordForm } from "@/features/auth/ChangePasswordForm";

/**
 * US-F7 change-password form tests.
 *
 * Scope: Unicode-aware client validation, CSRF-enabled mutation options,
 * session-cache seeding, force/voluntary success behavior, and stable error
 * rendering. The API boundary is mocked so these tests remain deterministic;
 * backend policy and rate-limit behavior is covered in the backend suites.
 */

const replace = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
}));

vi.mock("@/lib/api/client", () => ({
  apiRequest: vi.fn(),
  ApiRequestError: class ApiRequestError extends Error {
    readonly code: string;
    readonly field?: string;
    readonly retryAfterSeconds?: number | null;
    readonly status: number;

    constructor(
      error: {
        code: string;
        message: string;
        field?: string;
        retryAfterSeconds?: number | null;
      },
      status: number,
    ) {
      super(error.message);
      this.name = "ApiRequestError";
      this.code = error.code;
      this.field = error.field;
      this.retryAfterSeconds = error.retryAfterSeconds;
      this.status = status;
    }
  },
}));

import { apiRequest, ApiRequestError } from "@/lib/api/client";

function makeSession(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    accountId: "acct-1",
    username: "teacher",
    displayName: "Teacher",
    role: "teacher",
    canCreateCourse: true,
    mustChangePassword: false,
    sessionId: "sess-1",
    expiresAt: "2026-08-20T12:00:00.000Z",
    ...overrides,
  };
}

function renderForm(session = makeSession()) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  queryClient.setQueryData(["session"], session);
  render(
    <QueryClientProvider client={queryClient}>
      <ChangePasswordForm />
    </QueryClientProvider>,
  );
  return queryClient;
}

function stubCsrfCookie() {
  Object.defineProperty(document, "cookie", {
    configurable: true,
    writable: true,
    value: "__Host-csrf=test-csrf-token",
  });
}

async function fillValidForm(
  user: ReturnType<typeof userEvent.setup>,
  values: {
    currentPassword?: string;
    newPassword?: string;
    confirmPassword?: string;
  } = {},
) {
  await user.type(
    screen.getByLabelText("目前密碼"),
    values.currentPassword ?? "current-password-123",
  );
  await user.type(
    screen.getByLabelText("新密碼"),
    values.newPassword ?? "new-password-123",
  );
  await user.type(
    screen.getByLabelText("確認新密碼"),
    values.confirmPassword ?? values.newPassword ?? "new-password-123",
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  replace.mockClear();
  stubCsrfCookie();
});

describe("ChangePasswordForm — validation", () => {
  it("shows required and length messages without submitting", async () => {
    const user = userEvent.setup();
    renderForm();

    await user.click(screen.getByRole("button", { name: "變更密碼" }));

    expect(await screen.findByText("請輸入目前的密碼")).toBeInTheDocument();
    expect(screen.getByText("新密碼至少 12 字元")).toBeInTheDocument();
    expect(screen.getByText("請再次輸入新密碼")).toBeInTheDocument();
    expect(apiRequest).not.toHaveBeenCalled();
  });

  it("rejects a password with fewer than 12 Unicode code points", async () => {
    const user = userEvent.setup();
    renderForm();
    await fillValidForm(user, {
      newPassword: "🙂🙂🙂🙂🙂🙂",
      confirmPassword: "🙂🙂🙂🙂🙂🙂",
    });

    await user.click(screen.getByRole("button", { name: "變更密碼" }));

    expect(await screen.findByText("新密碼至少 12 字元")).toBeInTheDocument();
    expect(apiRequest).not.toHaveBeenCalled();
  });

  it("requires confirmation to match and the new password to differ", async () => {
    const user = userEvent.setup();
    renderForm();
    await fillValidForm(user, {
      currentPassword: "same-password-123",
      newPassword: "same-password-123",
      confirmPassword: "different-password-123",
    });

    await user.click(screen.getByRole("button", { name: "變更密碼" }));

    expect(
      await screen.findByText("兩次輸入的新密碼不一致"),
    ).toBeInTheDocument();
    expect(apiRequest).not.toHaveBeenCalled();
  });

  it("rejects a new password equal to the current password", async () => {
    const user = userEvent.setup();
    renderForm();
    await fillValidForm(user, {
      currentPassword: "same-password-123",
      newPassword: "same-password-123",
      confirmPassword: "same-password-123",
    });

    await user.click(screen.getByRole("button", { name: "變更密碼" }));

    expect(
      await screen.findByText("新密碼不得與目前密碼相同"),
    ).toBeInTheDocument();
    expect(apiRequest).not.toHaveBeenCalled();
  });
});

describe("ChangePasswordForm — mutation and success", () => {
  it("submits with the CSRF mutation path and seeds the rotated session", async () => {
    const user = userEvent.setup();
    const returnedSession = makeSession({
      sessionId: "rotated",
      expiresAt: "later",
    });
    (apiRequest as unknown as Mock).mockResolvedValueOnce(returnedSession);
    const queryClient = renderForm();

    await fillValidForm(user);
    await user.click(screen.getByRole("button", { name: "變更密碼" }));

    expect(await screen.findByText("密碼已成功變更。")).toBeInTheDocument();
    expect(apiRequest).toHaveBeenCalledTimes(1);
    const [path, opts] = (apiRequest as unknown as Mock).mock.calls[0];
    expect(path).toBe("/auth/change-password");
    expect(opts).toMatchObject({
      method: "POST",
      mutate: true,
      body: {
        currentPassword: "current-password-123",
        newPassword: "new-password-123",
      },
    });
    expect(queryClient.getQueryData(["session"])).toEqual(returnedSession);
    expect(replace).not.toHaveBeenCalled();
  });

  it("redirects a forced-change student after the returned session clears the flag", async () => {
    const user = userEvent.setup();
    const returnedSession = makeSession({
      role: "student",
      mustChangePassword: false,
      sessionId: "rotated",
    });
    (apiRequest as unknown as Mock).mockResolvedValueOnce(returnedSession);
    renderForm(makeSession({ role: "student", mustChangePassword: true }));

    await fillValidForm(user);
    await user.click(screen.getByRole("button", { name: "變更密碼" }));

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/student"));
    expect(
      screen.getByText("密碼已成功變更。即將為你導向…"),
    ).toBeInTheDocument();
  });

  it("redirects a forced-change teacher after the returned session clears the flag", async () => {
    const user = userEvent.setup();
    const returnedSession = makeSession({
      role: "teacher",
      mustChangePassword: false,
      sessionId: "rotated",
    });
    (apiRequest as unknown as Mock).mockResolvedValueOnce(returnedSession);
    renderForm(makeSession({ role: "teacher", mustChangePassword: true }));

    await fillValidForm(user);
    await user.click(screen.getByRole("button", { name: "變更密碼" }));

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/teacher"));
    expect(
      screen.getByText("密碼已成功變更。即將為你導向…"),
    ).toBeInTheDocument();
  });
});

describe("ChangePasswordForm — stable error codes", () => {
  it("shows the curated invalid-credentials message", async () => {
    const user = userEvent.setup();
    (apiRequest as unknown as Mock).mockRejectedValueOnce(
      new ApiRequestError(
        {
          code: "AUTH_INVALID_CREDENTIALS",
          message: "Invalid credentials",
          blocking: true,
        },
        401,
      ),
    );
    renderForm();

    await fillValidForm(user);
    await user.click(screen.getByRole("button", { name: "變更密碼" }));

    expect(await screen.findByText("帳號或密碼不正確。")).toBeInTheDocument();
    expect(screen.queryByText("Invalid credentials")).not.toBeInTheDocument();
  });

  it("surfaces field-scoped common-password feedback inline", async () => {
    const user = userEvent.setup();
    const message = "此密碼太常見，請改用其他密碼";
    (apiRequest as unknown as Mock).mockRejectedValueOnce(
      new ApiRequestError(
        {
          code: "VALIDATION_FAILED",
          message,
          field: "newPassword",
          blocking: true,
        },
        400,
      ),
    );
    renderForm();

    await fillValidForm(user);
    await user.click(screen.getByRole("button", { name: "變更密碼" }));

    expect(await screen.findByText(message)).toBeInTheDocument();
  });

  it("shows a curated rate-limit message with the retry hint", async () => {
    const user = userEvent.setup();
    (apiRequest as unknown as Mock).mockRejectedValueOnce(
      new ApiRequestError(
        {
          code: "RATE_LIMITED",
          message: "Too many attempts",
          retryAfterSeconds: 12,
          blocking: true,
        },
        429,
      ),
    );
    renderForm();

    await fillValidForm(user);
    await user.click(screen.getByRole("button", { name: "變更密碼" }));

    expect(
      await screen.findByText("嘗試次數過多，請稍後再試。（約 12 秒後可再試）"),
    ).toBeInTheDocument();
    expect(screen.queryByText("Too many attempts")).not.toBeInTheDocument();
  });
});
