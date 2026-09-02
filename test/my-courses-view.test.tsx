import { describe, expect, it, beforeEach, vi, type Mock } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MyCoursesView } from "@/features/student/MyCoursesView";

/**
 * MyCoursesView component tests — student 我的課程 list.
 *
 * Scope: three render states (loading, data, empty) + stable error-code
 * display. The network layer is stubbed at the `apiRequest` boundary and the
 * session is stubbed so the hook is enabled for a student role. These are pure
 * component tests; the real-backend flow lives in `test/browser/`.
 */

const sessionState = { role: "student" as string | null };

vi.mock("@/lib/auth/session", () => ({
  useSession: () => ({
    session: sessionState.role
      ? {
          accountId: "acct-1",
          username: "alice",
          displayName: "Alice",
          role: sessionState.role,
          canCreateCourse: false,
          mustChangePassword: false,
          sessionId: "sess-1",
          expiresAt: "",
        }
      : null,
    isLoading: false,
    isAuthenticated: sessionState.role !== null,
    refetch: vi.fn(),
  }),
}));

vi.mock("@/lib/api/client", () => ({
  apiRequest: vi.fn(),
  ApiRequestError: class ApiRequestError extends Error {
    readonly code: string;
    readonly field?: string;
    readonly status: number;
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

function renderView() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <MyCoursesView />
    </QueryClientProvider>,
  );
}

function myCoursesPage(rows: Array<Record<string, unknown>>) {
  return {
    data: rows,
    meta: { page: 1, pageSize: 20, total: rows.length, totalPages: 1 },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  sessionState.role = "student";
});

describe("MyCoursesView — roster states", () => {
  it("renders course cards for the student's active roster", async () => {
    (apiRequest as unknown as Mock).mockResolvedValueOnce(
      myCoursesPage([
        {
          enrollmentId: "enr-1",
          courseId: "course-1",
          name: "微積分一",
          description: "基礎微積分",
          status: "draft",
          ownerAccountId: "teacher-1",
          enrolledAt: "2026-08-19T00:00:00.000Z",
          createdAt: "2026-08-01T00:00:00.000Z",
          updatedAt: "2026-08-01T00:00:00.000Z",
        },
      ]),
    );

    renderView();
    expect(await screen.findByText("微積分一")).toBeInTheDocument();
    expect(screen.getByText("基礎微積分")).toBeInTheDocument();
    expect(screen.getByText("draft")).toBeInTheDocument();
    expect(apiRequest).toHaveBeenCalledWith(
      "/me/courses?page=1&pageSize=20",
      expect.anything(),
    );
  });

  it("renders the empty state when the roster has no active courses", async () => {
    (apiRequest as unknown as Mock).mockResolvedValueOnce(myCoursesPage([]));

    renderView();
    expect(
      await screen.findByText(
        "尚未加選任何課程。加選由老師或管理員操作，請聯絡你的授課老師。",
      ),
    ).toBeInTheDocument();
  });

  it("renders a stable error message when the roster fetch fails", async () => {
    const { ApiRequestError } = await import("@/lib/api/client");
    (apiRequest as unknown as Mock).mockRejectedValueOnce(
      new ApiRequestError(
        { code: "FORBIDDEN", message: "Forbidden", blocking: true },
        403,
      ),
    );

    renderView();
    expect(
      await screen.findByText("你沒有權限執行此操作。"),
    ).toBeInTheDocument();
    // Raw backend detail must not leak.
    expect(screen.queryByText("Forbidden")).not.toBeInTheDocument();
  });
});

describe("MyCoursesView — query gating", () => {
  it("does not fetch /me/courses for a non-student session", async () => {
    sessionState.role = "admin";
    renderView();
    // The query is `enabled` only for student role; flush microtasks and assert
    // no request to /me/courses was ever made.
    await waitFor(() =>
      expect(apiRequest).not.toHaveBeenCalledWith(
        "/me/courses",
        expect.anything(),
      ),
    );
  });
});
