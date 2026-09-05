import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PropsWithChildren } from "react";
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { LearnerLiveSessionView } from "@/features/live-student/LearnerLiveSessionView";
import { ApiRequestError } from "@/lib/api/client";
import type {
  ParticipantLiveSessionSnapshot,
  StudentLiveSessionStatus,
} from "@/lib/api/types";

const mocks = vi.hoisted(() => ({
  apiRequest: vi.fn(),
  replace: vi.fn(),
  pathname: "/student/live/session-1",
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mocks.replace }),
  usePathname: () => mocks.pathname,
}));

vi.mock("@/lib/api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/client")>();
  return { ...actual, apiRequest: mocks.apiRequest };
});

const apiRequestMock = mocks.apiRequest as unknown as Mock;

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}

function wrapperFor(queryClient: QueryClient) {
  return function QueryWrapper({
    children,
  }: PropsWithChildren): React.JSX.Element {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

function snapshot(
  overrides: Partial<ParticipantLiveSessionSnapshot> = {},
): ParticipantLiveSessionSnapshot {
  return {
    id: "session-1",
    courseId: "course-1",
    status: "active",
    sessionCode: "ABCD12",
    startedAt: "2026-09-03T09:00:00.000Z",
    closedAt: null,
    autoClosed: false,
    createdAt: "2026-09-03T08:00:00.000Z",
    updatedAt: "2026-09-03T09:00:00.000Z",
    sessionQuestions: [],
    ...overrides,
  };
}

function openQuestion() {
  return {
    id: "sq-1",
    liveSessionId: "session-1",
    questionDefinitionId: "question-1",
    position: 0,
    status: "open" as const,
    snapshotType: "poll" as const,
    snapshotPrompt: "你最喜歡哪個科目？",
    snapshotSelectionMode: "single",
    openedAt: "2026-09-03T09:01:00.000Z",
    closedAt: null,
    hasSubmitted: false,
    options: [
      {
        id: "01945f3e-0000-7000-8000-000000000002",
        optionRef: "A",
        text: "數學",
        position: 0,
      },
    ],
  };
}

function terminalError() {
  return new ApiRequestError(
    { code: "SESSION_NOT_JOINABLE", message: "internal", blocking: true },
    409,
  );
}

function status(
  overrides: Partial<StudentLiveSessionStatus> = {},
): StudentLiveSessionStatus {
  return {
    id: "session-1",
    status: "closed",
    startedAt: "2026-09-03T09:00:00.000Z",
    closedAt: "2026-09-03T10:00:00.000Z",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

function renderView() {
  return render(<LearnerLiveSessionView liveSessionId="session-1" />, {
    wrapper: wrapperFor(makeQueryClient()),
  });
}

describe("LearnerLiveSessionView (FE-4.1 CP3)", () => {
  it("renders a loading state before the snapshot resolves", () => {
    apiRequestMock.mockReturnValue(new Promise(() => {}));
    renderView();
    expect(screen.getByRole("status")).toHaveTextContent("載入課堂中…");
  });

  it("renders the waiting state from snapshot.status", async () => {
    apiRequestMock.mockResolvedValueOnce(snapshot({ status: "waiting" }));
    renderView();
    await waitFor(() =>
      expect(screen.getByText("等待開始")).toBeInTheDocument(),
    );
    expect(screen.getByText(/等待老師開始課堂/)).toBeInTheDocument();
    expect(screen.getByText(/ABCD12/)).toBeInTheDocument();
  });

  it("renders active with no open question as waiting for the teacher to open one", async () => {
    apiRequestMock.mockResolvedValueOnce(snapshot({ status: "active" }));
    renderView();
    await waitFor(() => expect(screen.getByText("進行中")).toBeInTheDocument());
    expect(screen.getByText(/等待老師開題/)).toBeInTheDocument();
    expect(screen.queryByText("目前題目")).not.toBeInTheDocument();
  });

  it("renders an open question with prompt, options, and hasSubmitted", async () => {
    apiRequestMock.mockResolvedValueOnce(
      snapshot({ status: "active", sessionQuestions: [openQuestion()] }),
    );
    renderView();
    await waitFor(() =>
      expect(screen.getByText("你最喜歡哪個科目？")).toBeInTheDocument(),
    );
    expect(screen.getByText("數學")).toBeInTheDocument();
    expect(screen.getByText("尚未作答。")).toBeInTheDocument();
  });

  it("shows hasSubmitted when the participant already answered", async () => {
    apiRequestMock.mockResolvedValueOnce(
      snapshot({
        status: "active",
        sessionQuestions: [{ ...openQuestion(), hasSubmitted: true }],
      }),
    );
    renderView();
    await waitFor(() =>
      expect(screen.getByText("你已作答。")).toBeInTheDocument(),
    );
  });

  it("renders the closed terminal state via the student-status receipt", async () => {
    apiRequestMock.mockRejectedValueOnce(terminalError());
    apiRequestMock.mockResolvedValueOnce(status({ status: "closed" }));
    renderView();
    await waitFor(() => {
      expect(screen.getByText("已結束")).toBeInTheDocument();
      expect(screen.getByText(/課堂已結束，此頁面為唯讀/)).toBeInTheDocument();
    });
    expect(screen.getByRole("link", { name: "返回我的課程" })).toHaveAttribute(
      "href",
      "/student",
    );
  });

  it("renders the cancelled terminal state defensively", async () => {
    apiRequestMock.mockRejectedValueOnce(terminalError());
    apiRequestMock.mockResolvedValueOnce(status({ status: "cancelled" }));
    renderView();
    await waitFor(() => {
      expect(screen.getByText("已取消")).toBeInTheDocument();
      expect(screen.getByText(/此課堂已取消/)).toBeInTheDocument();
    });
  });

  it("shows a generic not-found message on a 404 snapshot", async () => {
    apiRequestMock.mockRejectedValueOnce(
      new ApiRequestError(
        { code: "NOT_FOUND", message: "internal", blocking: true },
        404,
      ),
    );
    renderView();
    await waitFor(() =>
      expect(screen.getByText("找不到這堂課")).toBeInTheDocument(),
    );
  });

  it("surfaces a curated error for a non-terminal snapshot error", async () => {
    apiRequestMock.mockRejectedValueOnce(
      new ApiRequestError(
        { code: "INTERNAL_ERROR", message: "internal", blocking: true },
        500,
      ),
    );
    renderView();
    // A non-access, non-terminal error falls back to the curated message for
    // its stable code — never the raw backend message.
    await waitFor(() =>
      expect(
        screen.getByText("伺服器發生問題，請稍後再試。"),
      ).toBeInTheDocument(),
    );
    expect(screen.queryByText("internal")).not.toBeInTheDocument();
  });

  it("renders a not-enrolled access state for a snapshot ENROLLMENT_REQUIRED", async () => {
    apiRequestMock.mockRejectedValueOnce(
      new ApiRequestError(
        { code: "ENROLLMENT_REQUIRED", message: "internal", blocking: true },
        403,
      ),
    );
    renderView();
    await waitFor(() =>
      expect(
        screen.getByText("你尚未加選此課程，無法進入課堂。"),
      ).toBeInTheDocument(),
    );
    expect(screen.queryByText("internal")).not.toBeInTheDocument();
  });

  it("renders a removed-enrollment access state for a snapshot ENROLLMENT_REMOVED", async () => {
    apiRequestMock.mockRejectedValueOnce(
      new ApiRequestError(
        { code: "ENROLLMENT_REMOVED", message: "internal", blocking: true },
        403,
      ),
    );
    renderView();
    await waitFor(() =>
      expect(
        screen.getByText("你的課程加選已被移除，無法進入課堂。"),
      ).toBeInTheDocument(),
    );
  });

  it("renders a wrong-role forbidden state without mislabeling it as unenrolled", async () => {
    apiRequestMock.mockRejectedValueOnce(
      new ApiRequestError(
        { code: "FORBIDDEN", message: "internal", blocking: true },
        403,
      ),
    );
    renderView();
    await waitFor(() =>
      expect(screen.getByText("你沒有權限執行此操作。")).toBeInTheDocument(),
    );
    expect(screen.queryByText(/尚未加選|加選已被移除/)).not.toBeInTheDocument();
  });

  it("renders a disabled-account state distinct from an expired session", async () => {
    apiRequestMock.mockRejectedValueOnce(
      new ApiRequestError(
        { code: "AUTH_ACCOUNT_DISABLED", message: "internal", blocking: true },
        401,
      ),
    );
    renderView();
    await waitFor(() =>
      expect(screen.getByText("帳號已停用")).toBeInTheDocument(),
    );
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it("redirects to login with a safe next on an expired snapshot session", async () => {
    apiRequestMock.mockRejectedValueOnce(
      new ApiRequestError(
        { code: "AUTH_SESSION_EXPIRED", message: "internal", blocking: true },
        401,
      ),
    );
    renderView();
    await waitFor(() =>
      expect(mocks.replace).toHaveBeenCalledWith(
        "/login?next=%2Fstudent%2Flive%2Fsession-1",
      ),
    );
  });

  it("redirects to login with a safe next on a missing snapshot session", async () => {
    apiRequestMock.mockRejectedValueOnce(
      new ApiRequestError(
        { code: "UNAUTHORIZED", message: "internal", blocking: true },
        401,
      ),
    );
    renderView();
    await waitFor(() =>
      expect(mocks.replace).toHaveBeenCalledWith(
        "/login?next=%2Fstudent%2Flive%2Fsession-1",
      ),
    );
  });

  it("renders an access state for a terminal student-status access loss", async () => {
    // Snapshot rejects as terminal (SESSION_NOT_JOINABLE), then the
    // student-status receipt reports enrollment removed.
    apiRequestMock.mockRejectedValueOnce(terminalError());
    apiRequestMock.mockRejectedValueOnce(
      new ApiRequestError(
        { code: "ENROLLMENT_REMOVED", message: "internal", blocking: true },
        403,
      ),
    );
    renderView();
    await waitFor(() =>
      expect(
        screen.getByText("你的課程加選已被移除，無法進入課堂。"),
      ).toBeInTheDocument(),
    );
  });

  it("refetches the snapshot on manual refresh", async () => {
    apiRequestMock.mockResolvedValueOnce(snapshot({ status: "waiting" }));
    renderView();
    await waitFor(() =>
      expect(screen.getByText("等待開始")).toBeInTheDocument(),
    );

    apiRequestMock.mockResolvedValueOnce(snapshot({ status: "active" }));
    fireEvent.click(screen.getByRole("button", { name: "更新課堂狀態" }));

    await waitFor(() => expect(screen.getByText("進行中")).toBeInTheDocument());
    expect(apiRequestMock).toHaveBeenCalledWith(
      "/live-sessions/session-1/snapshot",
      { signal: expect.any(AbortSignal) },
    );
  });

  it("renders a not-enrolled access state for a snapshot ENROLLMENT_REQUIRED", async () => {
    apiRequestMock.mockRejectedValueOnce(
      new ApiRequestError(
        { code: "ENROLLMENT_REQUIRED", message: "internal", blocking: true },
        403,
      ),
    );
    renderView();
    await waitFor(() =>
      expect(
        screen.getByText("你尚未加選此課程，無法進入課堂。"),
      ).toBeInTheDocument(),
    );
    expect(screen.queryByText("internal")).not.toBeInTheDocument();
  });

  it("renders a removed-enrollment access state for a snapshot ENROLLMENT_REMOVED", async () => {
    apiRequestMock.mockRejectedValueOnce(
      new ApiRequestError(
        { code: "ENROLLMENT_REMOVED", message: "internal", blocking: true },
        403,
      ),
    );
    renderView();
    await waitFor(() =>
      expect(
        screen.getByText("你的課程加選已被移除，無法進入課堂。"),
      ).toBeInTheDocument(),
    );
  });

  it("renders a wrong-role forbidden state without mislabeling it as unenrolled", async () => {
    apiRequestMock.mockRejectedValueOnce(
      new ApiRequestError(
        { code: "FORBIDDEN", message: "internal", blocking: true },
        403,
      ),
    );
    renderView();
    await waitFor(() =>
      expect(screen.getByText("你沒有權限執行此操作。")).toBeInTheDocument(),
    );
    expect(screen.queryByText(/尚未加選|加選已被移除/)).not.toBeInTheDocument();
  });

  it("renders a disabled-account state distinct from an expired session", async () => {
    apiRequestMock.mockRejectedValueOnce(
      new ApiRequestError(
        { code: "AUTH_ACCOUNT_DISABLED", message: "internal", blocking: true },
        401,
      ),
    );
    renderView();
    await waitFor(() =>
      expect(screen.getByText("帳號已停用")).toBeInTheDocument(),
    );
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it("redirects to login with a safe next on an expired snapshot session", async () => {
    apiRequestMock.mockRejectedValueOnce(
      new ApiRequestError(
        { code: "AUTH_SESSION_EXPIRED", message: "internal", blocking: true },
        401,
      ),
    );
    renderView();
    await waitFor(() =>
      expect(mocks.replace).toHaveBeenCalledWith(
        "/login?next=%2Fstudent%2Flive%2Fsession-1",
      ),
    );
  });

  it("redirects to login with a safe next on a missing snapshot session", async () => {
    apiRequestMock.mockRejectedValueOnce(
      new ApiRequestError(
        { code: "UNAUTHORIZED", message: "internal", blocking: true },
        401,
      ),
    );
    renderView();
    await waitFor(() =>
      expect(mocks.replace).toHaveBeenCalledWith(
        "/login?next=%2Fstudent%2Flive%2Fsession-1",
      ),
    );
  });

  it("renders an access state for a terminal student-status access loss", async () => {
    // Snapshot rejects as terminal (SESSION_NOT_JOINABLE), then the
    // student-status receipt reports enrollment removed.
    apiRequestMock.mockRejectedValueOnce(terminalError());
    apiRequestMock.mockRejectedValueOnce(
      new ApiRequestError(
        { code: "ENROLLMENT_REMOVED", message: "internal", blocking: true },
        403,
      ),
    );
    renderView();
    await waitFor(() =>
      expect(
        screen.getByText("你的課程加選已被移除，無法進入課堂。"),
      ).toBeInTheDocument(),
    );
  });

  it("never renders teacher-only data or an answering control", async () => {
    apiRequestMock.mockResolvedValueOnce(
      snapshot({ status: "active", sessionQuestions: [openQuestion()] }),
    );
    renderView();
    await waitFor(() =>
      expect(screen.getByText("你最喜歡哪個科目？")).toBeInTheDocument(),
    );
    // No teacher counts, controls, or correctness.
    expect(screen.queryByText(/已加入人數/)).not.toBeInTheDocument();
    expect(screen.queryByText(/已作答人數/)).not.toBeInTheDocument();
    expect(screen.queryByText(/結束課堂/)).not.toBeInTheDocument();
    expect(screen.queryByText(/正確/)).not.toBeInTheDocument();
    // CP1 exposes only the local poll control; no submission API or
    // teacher-only projection is present, and no selection means submit stays disabled.
    expect(screen.getByRole("button", { name: "送出答案" })).toBeDisabled();
  });
});
