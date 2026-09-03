import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { MyCoursesView } from "@/features/student/MyCoursesView";

/**
 * MyCoursesView component tests — student 我的課程 list.
 *
 * Scope: loading, empty, error, data, pagination, page contraction, and the
 * FE-4.1 CP2 join entry (null/waiting/active/invalid discovery, pending,
 * duplicate click, server-ID navigation, 409 race + refresh, safe error text).
 * The network layer is stubbed at the `apiRequest` boundary and the session is
 * stubbed so the hook is enabled for a student role. The real-backend flow
 * lives in `test/browser/`.
 */

const navigationMocks = vi.hoisted(() => ({
  replace: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => navigationMocks,
}));

const mocks = vi.hoisted(() => ({
  apiRequest: vi.fn(),
  sessionRole: "student" as string | null,
}));

vi.mock("@/lib/auth/session", () => ({
  useSession: () => ({
    session: mocks.sessionRole
      ? {
          accountId: "student-1",
          username: "student-one",
          displayName: "Student One",
          role: mocks.sessionRole,
          canCreateCourse: false,
          mustChangePassword: false,
          sessionId: "session-1",
          expiresAt: "",
        }
      : null,
    isLoading: false,
    isAuthenticated: mocks.sessionRole !== null,
    refetch: vi.fn(),
  }),
}));

vi.mock("@/lib/api/client", () => ({
  apiRequest: mocks.apiRequest,
  ApiRequestError: class ApiRequestError extends Error {
    readonly code: string;
    readonly field?: string;
    readonly status: number;
    readonly retryAfterSeconds?: number;

    constructor(
      error: {
        code: string;
        message: string;
        field?: string;
        retryAfterSeconds?: number;
      },
      status: number,
    ) {
      super(error.message);
      this.name = "ApiRequestError";
      this.code = error.code;
      this.status = status;
      this.field = error.field;
      this.retryAfterSeconds = error.retryAfterSeconds;
    }
  },
}));

import { apiRequest } from "@/lib/api/client";

function renderView() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MyCoursesView />
    </QueryClientProvider>,
  );
}

function myCoursesPage(
  rows: Array<Record<string, unknown>>,
  meta: Partial<{
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  }> = {},
) {
  return {
    data: rows,
    meta: {
      page: meta.page ?? 1,
      pageSize: meta.pageSize ?? 20,
      total: meta.total ?? rows.length,
      totalPages: meta.totalPages ?? (rows.length > 0 ? 1 : 0),
    },
  };
}

const draftCourse = {
  enrollmentId: "enrollment-1",
  courseId: "course-1",
  name: "微積分一",
  description: "基礎微積分\n完整課程說明",
  status: "draft",
  ownerAccountId: "teacher-1",
  enrolledAt: "2026-09-01T00:00:00.000Z",
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
  currentJoinableSession: null,
};

const archivedCourse = {
  enrollmentId: "enrollment-2",
  courseId: "course-2",
  name: "已封存課程",
  description: null,
  status: "archived",
  ownerAccountId: "teacher-1",
  enrolledAt: "2026-08-15T00:00:00.000Z",
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-20T00:00:00.000Z",
  currentJoinableSession: null,
};

const waitingCourse = {
  ...draftCourse,
  enrollmentId: "enrollment-3",
  courseId: "course-3",
  name: "等候中課程",
  description: null,
  currentJoinableSession: {
    id: "session-waiting",
    sessionCode: "WAIT12",
    status: "waiting",
  },
};

const activeCourse = {
  ...draftCourse,
  enrollmentId: "enrollment-4",
  courseId: "course-4",
  name: "進行中課程",
  description: null,
  currentJoinableSession: {
    id: "session-active",
    sessionCode: "ACTIVE1",
    status: "active",
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.sessionRole = "student";
});

describe("MyCoursesView — loading state", () => {
  it("renders only an accessible loading status while the request is pending", () => {
    (apiRequest as unknown as Mock).mockImplementation(
      () => new Promise(() => undefined),
    );

    renderView();

    const loading = screen.getByRole("status");
    expect(loading).toHaveTextContent("載入我的課程中…");
    expect(loading).toHaveAttribute("aria-live", "polite");
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
    expect(screen.queryByText(/尚未加選/)).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("MyCoursesView — roster states", () => {
  it("renders data with complete text, localized status labels, and semantic times", async () => {
    (apiRequest as unknown as Mock).mockResolvedValueOnce(
      myCoursesPage([draftCourse, archivedCourse]),
    );

    renderView();

    const list = await screen.findByRole("list", { name: "我的課程列表" });
    expect(list).toBeInTheDocument();
    expect(screen.getByText("微積分一")).toBeInTheDocument();
    expect(screen.getByText(/基礎微積分/)).toBeInTheDocument();
    expect(screen.getByText(/完整課程說明/)).toBeInTheDocument();
    expect(screen.getByText("已封存課程")).toBeInTheDocument();
    expect(screen.getByText("草稿")).toBeInTheDocument();
    expect(screen.getByText("已封存")).toBeInTheDocument();
    expect(screen.queryByText("draft")).not.toBeInTheDocument();
    expect(screen.queryByText("archived")).not.toBeInTheDocument();
    expect(
      document.querySelector('time[dateTime="2026-09-01T00:00:00.000Z"]'),
    ).toHaveTextContent("2026");
    expect(
      document.querySelector('time[dateTime="2026-08-15T00:00:00.000Z"]'),
    ).toHaveTextContent("2026");
    expect(apiRequest).toHaveBeenCalledWith(
      "/me/courses?page=1&pageSize=20",
      expect.anything(),
    );
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /加入|進入|開始/ }),
    ).not.toBeInTheDocument();
  });

  it("renders the valid empty state without pagination or self-enrollment controls", async () => {
    (apiRequest as unknown as Mock).mockResolvedValueOnce(
      myCoursesPage([], { total: 0, totalPages: 0 }),
    );

    renderView();

    expect(
      await screen.findByText(
        "尚未加選任何課程。加選由老師或管理員操作，請聯絡你的授課老師。",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("renders a stable error message without raw backend detail or empty state", async () => {
    const { ApiRequestError } = await import("@/lib/api/client");
    (apiRequest as unknown as Mock).mockRejectedValueOnce(
      new ApiRequestError(
        {
          code: "FORBIDDEN",
          message: "internal backend detail",
          blocking: true,
        },
        403,
      ),
    );

    renderView();

    const error = await screen.findByRole("alert");
    expect(error).toHaveAttribute("id", "my-courses-error");
    expect(error).toHaveTextContent("你沒有權限執行此操作。");
    expect(error).not.toHaveTextContent("internal backend detail");
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
    expect(screen.queryByText(/尚未加選/)).not.toBeInTheDocument();
  });
});

describe("MyCoursesView — pagination", () => {
  it("moves between pages and disables controls at both boundaries", async () => {
    const pageOne = myCoursesPage([draftCourse], {
      page: 1,
      total: 21,
      totalPages: 2,
    });
    const pageTwo = myCoursesPage([archivedCourse], {
      page: 2,
      total: 21,
      totalPages: 2,
    });
    (apiRequest as unknown as Mock).mockImplementation((path: string) => {
      if (path === "/me/courses?page=1&pageSize=20") {
        return Promise.resolve(pageOne);
      }
      if (path === "/me/courses?page=2&pageSize=20") {
        return Promise.resolve(pageTwo);
      }
      throw new Error(`Unexpected request: ${path}`);
    });

    const user = userEvent.setup();
    renderView();

    const navigation = await screen.findByRole("navigation", {
      name: "我的課程分頁",
    });
    expect(navigation).toHaveTextContent("第 1 / 2 頁，共 21 門課程");
    const previous = screen.getByRole("button", { name: "上一頁" });
    const next = screen.getByRole("button", { name: "下一頁" });
    expect(previous).toBeDisabled();
    expect(next).toBeEnabled();

    await user.click(next);
    expect(await screen.findByText("已封存課程")).toBeInTheDocument();
    const pageTwoNavigation = screen.getByRole("navigation", {
      name: "我的課程分頁",
    });
    expect(pageTwoNavigation).toHaveTextContent("第 2 / 2 頁，共 21 門課程");
    const pageTwoNext = screen.getByRole("button", { name: "下一頁" });
    const pageTwoPrevious = screen.getByRole("button", { name: "上一頁" });
    expect(pageTwoNext).toBeDisabled();
    expect(pageTwoPrevious).toBeEnabled();

    await user.click(pageTwoPrevious);
    expect(await screen.findByText("微積分一")).toBeInTheDocument();
    const pageOneNavigation = screen.getByRole("navigation", {
      name: "我的課程分頁",
    });
    expect(pageOneNavigation).toHaveTextContent("第 1 / 2 頁，共 21 門課程");
    expect(screen.getByRole("button", { name: "上一頁" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "下一頁" })).toBeEnabled();
    expect(apiRequest).toHaveBeenCalledWith(
      "/me/courses?page=2&pageSize=20",
      expect.anything(),
    );
  });

  it("contracts an out-of-range page instead of showing the global empty state", async () => {
    const firstPage = myCoursesPage([draftCourse], {
      page: 1,
      total: 21,
      totalPages: 2,
    });
    const contractedPage = myCoursesPage([], {
      page: 2,
      total: 1,
      totalPages: 1,
    });
    (apiRequest as unknown as Mock).mockImplementation((path: string) => {
      if (path === "/me/courses?page=1&pageSize=20") {
        return Promise.resolve(firstPage);
      }
      if (path === "/me/courses?page=2&pageSize=20") {
        return Promise.resolve(contractedPage);
      }
      throw new Error(`Unexpected request: ${path}`);
    });

    const user = userEvent.setup();
    renderView();
    await user.click(await screen.findByRole("button", { name: "下一頁" }));

    await waitFor(() => {
      const firstPageCalls = (apiRequest as unknown as Mock).mock.calls.filter(
        ([path]) => path === "/me/courses?page=1&pageSize=20",
      );
      expect(firstPageCalls).toHaveLength(2);
    });
    expect(await screen.findByText("微積分一")).toBeInTheDocument();
    expect(screen.queryByText(/尚未加選/)).not.toBeInTheDocument();
    expect(
      screen.getByRole("navigation", { name: "我的課程分頁" }),
    ).toHaveTextContent("第 1 / 2 頁，共 21 門課程");
  });
});

describe("MyCoursesView — query gating", () => {
  it("does not fetch /me/courses for a non-student session", async () => {
    mocks.sessionRole = "admin";
    renderView();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
    await waitFor(() => expect(apiRequest).not.toHaveBeenCalled());
  });
});

describe("MyCoursesView — FE-4.1 join entry (CP2)", () => {
  it("renders no join button when discovery is null", async () => {
    (apiRequest as unknown as Mock).mockResolvedValueOnce(
      myCoursesPage([draftCourse, archivedCourse]),
    );

    renderView();

    await screen.findByRole("list", { name: "我的課程列表" });
    expect(screen.getByText("微積分一")).toBeInTheDocument();
    expect(screen.getByText("已封存課程")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /等候中課堂入口|進入課堂/ }),
    ).not.toBeInTheDocument();
  });

  it("renders a waiting-room entry for a waiting session", async () => {
    (apiRequest as unknown as Mock).mockResolvedValueOnce(
      myCoursesPage([waitingCourse]),
    );

    renderView();

    const entry = await screen.findByRole("button", {
      name: "等候中課堂入口",
    });
    expect(entry).toBeInTheDocument();
    expect(entry).toBeEnabled();
  });

  it("renders an enter-classroom entry for an active session", async () => {
    (apiRequest as unknown as Mock).mockResolvedValueOnce(
      myCoursesPage([activeCourse]),
    );

    renderView();

    const entry = await screen.findByRole("button", { name: "進入課堂" });
    expect(entry).toBeInTheDocument();
    expect(entry).toBeEnabled();
  });

  it("fails closed and renders no entry for an unexpected terminal status", async () => {
    const invalidCourse = {
      ...draftCourse,
      enrollmentId: "enrollment-5",
      courseId: "course-5",
      name: "異常狀態課程",
      description: null,
      currentJoinableSession: {
        id: "session-closed",
        sessionCode: "CLOSED1",
        status: "closed",
      },
    };
    (apiRequest as unknown as Mock).mockResolvedValueOnce(
      myCoursesPage([invalidCourse]),
    );

    renderView();

    await screen.findByRole("list", { name: "我的課程列表" });
    expect(screen.getByText("異常狀態課程")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /等候中課堂入口|進入課堂/ }),
    ).not.toBeInTheDocument();
  });

  it("joins with the discovery session code and navigates to the server-returned ID", async () => {
    (apiRequest as unknown as Mock)
      .mockResolvedValueOnce(myCoursesPage([activeCourse]))
      .mockResolvedValueOnce({
        participantId: "participant-1",
        participantToken: null,
        liveSession: {
          id: "session-active",
          status: "active",
          sessionCode: "ACTIVE1",
        },
        currentQuestion: null,
      });

    const user = userEvent.setup();
    renderView();

    const entry = await screen.findByRole("button", { name: "進入課堂" });
    await user.click(entry);

    await waitFor(() =>
      expect(navigationMocks.replace).toHaveBeenCalledWith(
        "/student/live/session-active",
      ),
    );
    expect(apiRequest).toHaveBeenCalledWith("/live-sessions/ACTIVE1/join", {
      method: "POST",
      body: {},
      mutate: true,
    });
  });

  it("disables the entry and ignores a duplicate click while pending", async () => {
    let resolveJoin!: (value: {
      participantId: string;
      participantToken: null;
      liveSession: {
        id: string;
        status: string;
        sessionCode: string;
      };
      currentQuestion: null;
    }) => void;
    (apiRequest as unknown as Mock)
      .mockResolvedValueOnce(myCoursesPage([activeCourse]))
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveJoin = resolve;
        }),
      );

    const user = userEvent.setup();
    renderView();

    const entry = await screen.findByRole("button", { name: "進入課堂" });
    await user.click(entry);
    await waitFor(() => expect(entry).toBeDisabled());
    expect(entry).toHaveTextContent("加入中…");

    entry.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(apiRequest).toHaveBeenCalledTimes(2); // 1 roster + 1 join

    resolveJoin({
      participantId: "participant-1",
      participantToken: null,
      liveSession: {
        id: "session-active",
        status: "active",
        sessionCode: "ACTIVE1",
      },
      currentQuestion: null,
    });
    await waitFor(() =>
      expect(navigationMocks.replace).toHaveBeenCalledWith(
        "/student/live/session-active",
      ),
    );
  });

  it("shows a curated SESSION_NOT_JOINABLE race error with a discovery refresh and no raw message", async () => {
    const { ApiRequestError } = await import("@/lib/api/client");
    (apiRequest as unknown as Mock)
      .mockResolvedValueOnce(myCoursesPage([activeCourse]))
      .mockRejectedValueOnce(
        new ApiRequestError(
          {
            code: "SESSION_NOT_JOINABLE",
            message: "internal session detail",
            blocking: true,
          },
          409,
        ),
      );

    const user = userEvent.setup();
    renderView();

    const entry = await screen.findByRole("button", { name: "進入課堂" });
    await user.click(entry);

    const error = await screen.findByRole("alert");
    expect(error).toHaveTextContent("此課堂目前無法加入。");
    expect(error).not.toHaveTextContent("internal session detail");
    expect(navigationMocks.replace).not.toHaveBeenCalled();

    const refresh = screen.getByRole("button", {
      name: "重新整理課堂狀態",
    });
    await user.click(refresh);
    await waitFor(() => {
      const rosterCalls = (apiRequest as unknown as Mock).mock.calls.filter(
        ([path]) => path === "/me/courses?page=1&pageSize=20",
      );
      expect(rosterCalls).toHaveLength(2);
    });
  });

  it("shows a generic stable message for a non-race join error without a refresh link", async () => {
    const { ApiRequestError } = await import("@/lib/api/client");
    (apiRequest as unknown as Mock)
      .mockResolvedValueOnce(myCoursesPage([activeCourse]))
      .mockRejectedValueOnce(
        new ApiRequestError(
          {
            code: "FORBIDDEN",
            message: "internal authorization detail",
            blocking: true,
          },
          403,
        ),
      );

    const user = userEvent.setup();
    renderView();

    const entry = await screen.findByRole("button", { name: "進入課堂" });
    await user.click(entry);

    const error = await screen.findByRole("alert");
    expect(error).toHaveTextContent("你沒有權限執行此操作。");
    expect(error).not.toHaveTextContent("internal authorization detail");
    expect(
      screen.queryByRole("button", { name: "重新整理課堂狀態" }),
    ).not.toBeInTheDocument();
    expect(navigationMocks.replace).not.toHaveBeenCalled();
  });
});
