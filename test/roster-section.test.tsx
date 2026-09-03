import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { CourseRosterSection } from "@/features/enrollments/CourseRosterSection";

/**
 * CourseRosterSection component tests — FE-2.2 teacher enrollment roster UI.
 *
 * Scope: loading, empty, error (404/403/409), roster table with active/removed
 * rows, pagination, student search, enroll feedback (new/duplicate/reactivation),
 * and the remove confirmation dialog. The network layer is stubbed at the
 * `apiRequest` boundary and the session is stubbed so the hooks are enabled for
 * a teacher role. The real-backend flow lives in `test/browser/`.
 */

const mocks = vi.hoisted(() => ({
  apiRequest: vi.fn(),
  sessionRole: "teacher" as string | null,
}));

vi.mock("@/lib/auth/session", () => ({
  useSession: () => ({
    session: mocks.sessionRole
      ? {
          accountId: "teacher-1",
          username: "teacher-one",
          displayName: "Teacher One",
          role: mocks.sessionRole,
          canCreateCourse: true,
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

import { ApiRequestError, apiRequest } from "@/lib/api/client";

const COURSE_ID = "course-1";

function renderSection() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <CourseRosterSection courseId={COURSE_ID} />
    </QueryClientProvider>,
  );
}

function enrollmentPage(
  rows: Array<Record<string, unknown>>,
  meta: Partial<{ page: number; total: number; totalPages: number }> = {},
) {
  return {
    data: rows,
    meta: {
      page: meta.page ?? 1,
      pageSize: 20,
      total: meta.total ?? rows.length,
      totalPages: meta.totalPages ?? (rows.length > 0 ? 1 : 0),
    },
  };
}

const activeEnrollment = {
  id: "enrollment-1",
  courseId: COURSE_ID,
  studentAccountId: "student-1",
  status: "active",
  enrolledAt: "2026-09-01T00:00:00.000Z",
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z",
  student: { id: "student-1", username: "amy", displayName: "林美美" },
};

const removedEnrollment = {
  ...activeEnrollment,
  id: "enrollment-2",
  studentAccountId: "student-2",
  status: "removed",
  student: { id: "student-2", username: "bob", displayName: "王大明" },
};

function searchPage(
  rows: Array<Record<string, unknown>>,
  meta: Partial<{ total: number; totalPages: number }> = {},
) {
  return enrollmentPage(rows, meta);
}

const searchHit = {
  id: "student-3",
  username: "cathy",
  displayName: "陳小美",
  enrollmentStatus: null,
};

const searchDuplicate = {
  id: "student-1",
  username: "amy",
  displayName: "林美美",
  enrollmentStatus: "active",
};

const searchRemoved = {
  id: "student-2",
  username: "bob",
  displayName: "王大明",
  enrollmentStatus: "removed",
};

/** Route apiRequest mocks: roster GET vs search GET vs mutation POST/DELETE. */
function mockTransport(
  handler: (url: string, init?: { method?: string }) => unknown,
) {
  (apiRequest as unknown as Mock).mockImplementation(
    (url: string, init?: { method?: string }) => handler(url, init),
  );
}

function rosterHandler(rows: Array<Record<string, unknown>>, meta = {}) {
  return (url: string) => {
    if (url.startsWith(`/courses/${COURSE_ID}/enrollments?`)) {
      return Promise.resolve(enrollmentPage(rows, meta));
    }
    return new Promise(() => undefined);
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.sessionRole = "teacher";
});

describe("CourseRosterSection — roster states", () => {
  it("renders an accessible loading status first", () => {
    mockTransport(() => new Promise(() => undefined));

    renderSection();

    const loading = screen.getByRole("status");
    expect(loading).toHaveTextContent("載入名冊中…");
    expect(loading).toHaveAttribute("aria-live", "polite");
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("renders the roster table with active/removed labels and only active remove buttons", async () => {
    mockTransport(rosterHandler([activeEnrollment, removedEnrollment]));

    renderSection();

    const table = await screen.findByRole("table", { name: "課程名冊" });
    expect(table).toBeInTheDocument();
    expect(screen.getByText("林美美")).toBeInTheDocument();
    expect(screen.getByText("王大明")).toBeInTheDocument();
    expect(screen.getByText(/在學中/)).toBeInTheDocument();
    expect(screen.getByText(/已移除/)).toBeInTheDocument();
    expect(
      document.querySelector('time[dateTime="2026-09-01T00:00:00.000Z"]'),
    ).toBeInTheDocument();
    // Remove is offered only for the active row.
    expect(screen.getAllByRole("button", { name: "移除" })).toHaveLength(1);
  });

  it("renders the empty state and search panel without a table", async () => {
    mockTransport(rosterHandler([], { total: 0, totalPages: 0 }));

    renderSection();

    expect(await screen.findByText(/名冊目前沒有學生/)).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.getByLabelText("搜尋學生")).toBeInTheDocument();
  });

  it("renders the 404 course-not-accessible state", async () => {
    mockTransport(() => {
      throw new ApiRequestError(
        { code: "NOT_FOUND", message: "not found", blocking: true },
        404,
      );
    });

    renderSection();

    expect(
      await screen.findByText("無法存取這門課程的名冊"),
    ).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("renders a stable 403 error via ErrorAlert without raw backend text", async () => {
    mockTransport(() => {
      throw new ApiRequestError(
        { code: "FORBIDDEN", message: "internal detail", blocking: true },
        403,
      );
    });

    renderSection();

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("你沒有權限執行此操作。");
    expect(alert).not.toHaveTextContent("internal detail");
  });

  it("renders a stable 409 archived-course error via ErrorAlert", async () => {
    mockTransport(() => {
      throw new ApiRequestError(
        { code: "COURSE_NOT_EDITABLE", message: "archived", blocking: true },
        409,
      );
    });

    renderSection();

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("課程已封存，無法修改名冊。");
  });
});

describe("CourseRosterSection — pagination", () => {
  it("renders pagination controls respecting meta bounds", async () => {
    mockTransport((url) => {
      const page = Number(new URL(`https://x/${url}`).searchParams.get("page"));
      return Promise.resolve(
        enrollmentPage([activeEnrollment], { page, total: 25, totalPages: 2 }),
      );
    });

    renderSection();

    const next = await screen.findByRole("button", { name: "下一頁" });
    const previous = screen.getByRole("button", { name: "上一頁" });
    expect(previous).toBeDisabled();
    expect(screen.getByText(/第 1 \/ 2 頁/)).toBeInTheDocument();

    await userEvent.click(next);
    expect(await screen.findByText(/第 2 \/ 2 頁/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "下一頁" })).toBeDisabled();
    expect(apiRequest).toHaveBeenCalledWith(
      `/courses/${COURSE_ID}/enrollments?page=2&pageSize=20`,
      expect.anything(),
    );
  });
});

describe("CourseRosterSection — student search and enroll", () => {
  it("does not issue a search request for a 1-character query and shows the hint", async () => {
    mockTransport(rosterHandler([activeEnrollment]));

    renderSection();

    await screen.findByRole("table");
    await userEvent.type(screen.getByLabelText("搜尋學生"), "a");
    expect(apiRequest).not.toHaveBeenCalledWith(
      expect.stringContaining("/students/search"),
      expect.anything(),
    );
  });

  it("searches after debounce and renders results with course-relative status", async () => {
    mockTransport((url) => {
      if (url.includes("/students/search")) {
        return Promise.resolve(searchPage([searchHit]));
      }
      return Promise.resolve(enrollmentPage([activeEnrollment]));
    });

    renderSection();

    await screen.findByRole("table");
    await userEvent.type(screen.getByLabelText("搜尋學生"), "小美");
    expect(await screen.findByText("陳小美")).toBeInTheDocument();
    expect(screen.getByText(/未加選/)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "加入名冊" }),
    ).toBeInTheDocument();
    expect(apiRequest).toHaveBeenCalledWith(
      `/courses/${COURSE_ID}/students/search?q=${encodeURIComponent("小美")}&page=1&pageSize=20`,
      expect.anything(),
    );
  });

  it("shows new-enrollment success feedback after add", async () => {
    mockTransport((url, init) => {
      if (url.includes("/students/search")) {
        return Promise.resolve(searchPage([searchHit]));
      }
      if (init?.method === "POST") {
        return Promise.resolve(activeEnrollment);
      }
      return Promise.resolve(enrollmentPage([activeEnrollment]));
    });

    renderSection();

    await screen.findByRole("table");
    await userEvent.type(screen.getByLabelText("搜尋學生"), "小美");
    await userEvent.click(
      await screen.findByRole("button", { name: "加入名冊" }),
    );
    expect(await screen.findByText("已加入 陳小美。")).toBeInTheDocument();
    expect(apiRequest).toHaveBeenCalledWith(
      `/courses/${COURSE_ID}/enrollments`,
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("shows duplicate feedback when the student is already active", async () => {
    mockTransport((url, init) => {
      if (url.includes("/students/search")) {
        return Promise.resolve(searchPage([searchDuplicate]));
      }
      if (init?.method === "POST") {
        return Promise.resolve(activeEnrollment);
      }
      return Promise.resolve(enrollmentPage([activeEnrollment]));
    });

    renderSection();

    await screen.findByRole("table");
    await userEvent.type(screen.getByLabelText("搜尋學生"), "amy");
    await userEvent.click(
      await screen.findByRole("button", { name: "再次加選" }),
    );
    expect(
      await screen.findByText(/已在名冊中，未重複新增/),
    ).toBeInTheDocument();
  });

  it("shows reactivation feedback when the student was previously removed", async () => {
    mockTransport((url, init) => {
      if (url.includes("/students/search")) {
        return Promise.resolve(searchPage([searchRemoved]));
      }
      if (init?.method === "POST") {
        return Promise.resolve(activeEnrollment);
      }
      return Promise.resolve(enrollmentPage([activeEnrollment]));
    });

    renderSection();

    await screen.findByRole("table");
    await userEvent.type(screen.getByLabelText("搜尋學生"), "bob");
    await userEvent.click(
      await screen.findByRole("button", { name: "重新加選" }),
    );
    expect(await screen.findByText("已重新加選 王大明。")).toBeInTheDocument();
  });

  it("surfaces a stable archived-course error when add is rejected with 409", async () => {
    mockTransport((url) => {
      if (url.includes("/students/search")) {
        return Promise.resolve(searchPage([searchHit]));
      }
      if (url.endsWith("/enrollments")) {
        throw new ApiRequestError(
          { code: "COURSE_NOT_EDITABLE", message: "archived", blocking: true },
          409,
        );
      }
      return Promise.resolve(enrollmentPage([activeEnrollment]));
    });

    renderSection();

    await screen.findByRole("table");
    await userEvent.type(screen.getByLabelText("搜尋學生"), "小美");
    await userEvent.click(
      await screen.findByRole("button", { name: "加入名冊" }),
    );
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("課程已封存，無法修改名冊。");
  });
});

describe("CourseRosterSection — remove confirmation", () => {
  it("requires confirmation, cancels without DELETE, then removes on confirm", async () => {
    let deleted = false;
    mockTransport((url, init) => {
      if (url.includes("/students/search")) {
        return Promise.resolve(searchPage([]));
      }
      if (init?.method === "DELETE") {
        deleted = true;
        return Promise.resolve(null);
      }
      return Promise.resolve(enrollmentPage([activeEnrollment]));
    });

    renderSection();

    await screen.findByRole("table");
    await userEvent.click(screen.getByRole("button", { name: "移除" }));

    const dialog = screen.getByRole("dialog", { name: "確認移除學生" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveTextContent("林美美");

    // Cancel must not issue the DELETE.
    await userEvent.click(screen.getByRole("button", { name: "取消" }));
    expect(dialog).not.toBeInTheDocument();
    expect(deleted).toBe(false);

    await userEvent.click(screen.getByRole("button", { name: "移除" }));
    await userEvent.click(screen.getByRole("button", { name: "確認移除" }));
    await waitFor(() => {
      expect(deleted).toBe(true);
    });
    expect(
      screen.queryByRole("dialog", { name: "確認移除學生" }),
    ).not.toBeInTheDocument();
    expect(apiRequest).toHaveBeenCalledWith(
      `/courses/${COURSE_ID}/enrollments/student-1`,
      expect.objectContaining({ method: "DELETE" }),
    );
  });

  it("closes the dialog on Escape without deleting", async () => {
    let deleted = false;
    mockTransport((url, init) => {
      if (init?.method === "DELETE") {
        deleted = true;
        return Promise.resolve(null);
      }
      return Promise.resolve(enrollmentPage([activeEnrollment]));
    });

    renderSection();

    await screen.findByRole("table");
    await userEvent.click(screen.getByRole("button", { name: "移除" }));
    await userEvent.keyboard("{Escape}");
    expect(
      screen.queryByRole("dialog", { name: "確認移除學生" }),
    ).not.toBeInTheDocument();
    expect(deleted).toBe(false);
  });

  it("surfaces a stable error inside the dialog when remove fails and stays open", async () => {
    mockTransport((url, init) => {
      if (init?.method === "DELETE") {
        throw new ApiRequestError(
          { code: "INTERNAL_ERROR", message: "boom", blocking: true },
          500,
        );
      }
      return Promise.resolve(enrollmentPage([activeEnrollment]));
    });

    renderSection();

    await screen.findByRole("table");
    await userEvent.click(screen.getByRole("button", { name: "移除" }));
    await userEvent.click(screen.getByRole("button", { name: "確認移除" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("伺服器發生問題，請稍後再試。");
    expect(
      screen.getByRole("dialog", { name: "確認移除學生" }),
    ).toBeInTheDocument();
  });
});
