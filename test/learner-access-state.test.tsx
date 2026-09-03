import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  isLearnerAccessError,
  LearnerAccessState,
} from "@/features/live-student/LearnerAccessState";
import { ApiRequestError } from "@/lib/api/client";

/**
 * LearnerAccessState component tests (FE-4.1 CP4).
 *
 * Verifies the frozen stable-code → access-state mapping: not-enrolled,
 * removed-enrollment, wrong-role forbidden, disabled account, and expired /
 * missing session. Expired/missing sessions redirect to login with a safe
 * same-origin `next`; the rest render a dedicated access UI. Raw backend
 * messages, IDs, cookies, CSRF, and tokens are never rendered.
 */

const navigationMocks = vi.hoisted(() => ({
  replace: vi.fn(),
  pathname: "/student/live/session-1",
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: navigationMocks.replace }),
  usePathname: () => navigationMocks.pathname,
}));

function accessError(code: string, status: number): ApiRequestError {
  return new ApiRequestError(
    { code, message: "internal backend detail", blocking: true },
    status,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("isLearnerAccessError", () => {
  it("classifies the frozen access-loss codes", () => {
    for (const code of [
      "ENROLLMENT_REQUIRED",
      "ENROLLMENT_REMOVED",
      "FORBIDDEN",
      "AUTH_ACCOUNT_DISABLED",
      "AUTH_SESSION_EXPIRED",
      "UNAUTHORIZED",
    ]) {
      expect(isLearnerAccessError(accessError(code, 401))).toBe(true);
    }
  });

  it("does not classify non-access codes", () => {
    for (const code of [
      "SESSION_NOT_JOINABLE",
      "NOT_FOUND",
      "INTERNAL_ERROR",
      "NETWORK_ERROR",
    ]) {
      expect(isLearnerAccessError(accessError(code, 409))).toBe(false);
    }
  });
});

describe("LearnerAccessState", () => {
  it("renders a not-enrolled access state without leaking course data", () => {
    render(
      <LearnerAccessState
        error={accessError("ENROLLMENT_REQUIRED", 403)}
        id="access-test"
      />,
    );
    const alert = screen.getByRole("alert");
    expect(alert).toHaveAttribute("id", "access-test");
    expect(screen.getByText("無法進入課堂")).toBeInTheDocument();
    expect(
      screen.getByText("你尚未加選此課程，無法進入課堂。"),
    ).toBeInTheDocument();
    // No raw backend message, no IDs, no cookies/CSRF/token.
    expect(
      screen.queryByText("internal backend detail"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(/session-1|course-1|csrf|token|cookie/i),
    ).not.toBeInTheDocument();
  });

  it("renders a removed-enrollment access state", () => {
    render(
      <LearnerAccessState
        error={accessError("ENROLLMENT_REMOVED", 403)}
        id="access-test"
      />,
    );
    expect(screen.getByText("無法進入課堂")).toBeInTheDocument();
    expect(
      screen.getByText("你的課程加選已被移除，無法進入課堂。"),
    ).toBeInTheDocument();
  });

  it("renders a wrong-role forbidden state without mislabeling it as unenrolled", () => {
    render(
      <LearnerAccessState
        error={accessError("FORBIDDEN", 403)}
        id="access-test"
      />,
    );
    expect(screen.getByText("無法進入課堂")).toBeInTheDocument();
    // FORBIDDEN must not be conflated with ENROLLMENT_REQUIRED.
    expect(screen.queryByText(/尚未加選|加選已被移除/)).not.toBeInTheDocument();
    expect(screen.getByText("你沒有權限執行此操作。")).toBeInTheDocument();
  });

  it("renders a disabled-account state distinct from an expired session", () => {
    render(
      <LearnerAccessState
        error={accessError("AUTH_ACCOUNT_DISABLED", 401)}
        id="access-test"
      />,
    );
    expect(screen.getByText("帳號已停用")).toBeInTheDocument();
    expect(
      screen.getByText("此帳號已停用，請聯絡管理員。"),
    ).toBeInTheDocument();
    // Not conflated with an expired/missing session (no login redirect).
    expect(navigationMocks.replace).not.toHaveBeenCalled();
  });

  it("redirects to login with a safe next on an expired session", async () => {
    render(
      <LearnerAccessState
        error={accessError("AUTH_SESSION_EXPIRED", 401)}
        id="access-test"
      />,
    );
    await waitFor(() =>
      expect(navigationMocks.replace).toHaveBeenCalledWith(
        "/login?next=%2Fstudent%2Flive%2Fsession-1",
      ),
    );
    // No access UI is rendered for a session-loss redirect.
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("redirects to login with a safe next on a missing session", async () => {
    render(
      <LearnerAccessState
        error={accessError("UNAUTHORIZED", 401)}
        id="access-test"
      />,
    );
    await waitFor(() =>
      expect(navigationMocks.replace).toHaveBeenCalledWith(
        "/login?next=%2Fstudent%2Flive%2Fsession-1",
      ),
    );
  });
});
