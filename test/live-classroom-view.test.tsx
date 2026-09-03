import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PropsWithChildren } from "react";
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { LiveClassroomView } from "@/features/live-teacher/LiveClassroomView";
import { ApiRequestError } from "@/lib/api/client";
import type { LiveSession, SessionQuestion } from "@/lib/api/types";

const mocks = vi.hoisted(() => {
  const listeners = new Map<string, Set<(...args: unknown[]) => void>>();
  const emitLocal = (event: string, ...args: unknown[]) => {
    listeners.get(event)?.forEach((cb) => cb(...args));
  };
  const socket = {
    connected: false,
    on: vi.fn((event: string, cb: (...args: unknown[]) => void) => {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event)!.add(cb);
      return socket;
    }),
    off: vi.fn((event: string, cb: (...args: unknown[]) => void) => {
      listeners.get(event)?.delete(cb);
      return socket;
    }),
    emit: vi.fn(),
    connect: vi.fn(() => {
      socket.connected = true;
      emitLocal("connect");
    }),
    disconnect: vi.fn(() => {
      socket.connected = false;
    }),
  };
  return {
    socket,
    listeners,
    apiRequest: vi.fn(),
    io: vi.fn(() => socket),
    emitLocal,
  };
});

vi.mock("@/lib/api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/client")>();
  return { ...actual, apiRequest: mocks.apiRequest };
});
vi.mock("socket.io-client", () => ({ io: mocks.io }));

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

function session(overrides: Partial<LiveSession> = {}): LiveSession {
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
    joinedCount: 12,
    votedCount: 7,
    questionSelections: [],
    sessionQuestions: [],
    ...overrides,
  };
}

function pollQuestion(
  overrides: Partial<SessionQuestion> = {},
): SessionQuestion {
  return {
    id: "sq-1",
    liveSessionId: "session-1",
    questionDefinitionId: "question-1",
    position: 0,
    status: "closed",
    snapshotType: "poll",
    snapshotPrompt: "你最喜歡哪個科目？",
    snapshotSelectionMode: "single",
    openedAt: "2026-09-03T09:01:00.000Z",
    closedAt: "2026-09-03T09:05:00.000Z",
    options: [{ id: "opt-1", optionRef: "A", text: "數學", position: 0 }],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.listeners.clear();
  mocks.socket.connected = false;
});

function renderView(sessionData: LiveSession) {
  apiRequestMock.mockResolvedValueOnce(sessionData);
  return render(<LiveClassroomView liveSessionId="session-1" />, {
    wrapper: wrapperFor(makeQueryClient()),
  });
}

describe("LiveClassroomView (FE-3.3)", () => {
  it("renders status, session code, and joined/voted indicators", async () => {
    renderView(session());

    await waitFor(() => expect(screen.getByText("進行中")).toBeInTheDocument());
    // Session code is shown on the connection badge.
    expect(screen.getByText(/ABCD12/)).toBeInTheDocument();
    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.getByText("7")).toBeInTheDocument();
  });

  it("renders the question queue and result dashboard for closed questions", async () => {
    const q = pollQuestion();
    apiRequestMock.mockResolvedValueOnce(session({ sessionQuestions: [q] }));
    // ResultPanel fetch for the closed question.
    apiRequestMock.mockResolvedValueOnce({
      snapshotType: "poll",
      selectionMode: "single",
      status: "closed",
      options: [{ optionId: "opt-1", optionRef: "A", text: "數學", count: 8 }],
      totalResponses: 8,
    });

    render(<LiveClassroomView liveSessionId="session-1" />, {
      wrapper: wrapperFor(makeQueryClient()),
    });

    // The closed question appears in the queue.
    await waitFor(() =>
      expect(screen.getAllByText("你最喜歡哪個科目？").length).toBeGreaterThan(
        0,
      ),
    );
    // And the result dashboard shows the aggregate.
    await waitFor(() =>
      expect(screen.getByText("共 8 人作答")).toBeInTheDocument(),
    );
  });

  it("shows a generic not-found message on a 404 detail", async () => {
    apiRequestMock.mockRejectedValueOnce(
      new ApiRequestError(
        { code: "NOT_FOUND", message: "internal", blocking: true },
        404,
      ),
    );

    render(<LiveClassroomView liveSessionId="session-1" />, {
      wrapper: wrapperFor(makeQueryClient()),
    });

    await waitFor(() =>
      expect(screen.getByText("找不到這堂課")).toBeInTheDocument(),
    );
  });

  it("surfaces a stable realtime error code from the socket error event", async () => {
    renderView(session());

    await waitFor(() => expect(screen.getByText("進行中")).toBeInTheDocument());
    act(() => mocks.emitLocal("error", { code: "REALTIME_UNAVAILABLE" }));
    expect(await screen.findByText(/即時連線暫時無法使用/)).toBeInTheDocument();
  });

  it("closes a session through the close confirmation dialog", async () => {
    renderView(session({ status: "active" }));
    // Close mutation resolves with a closed session.
    apiRequestMock.mockResolvedValueOnce(
      session({ status: "closed", sessionQuestions: [] }),
    );

    await waitFor(() => expect(screen.getByText("進行中")).toBeInTheDocument());
    fireEventClick("結束課堂");

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    fireEventClick("確認結束");

    await waitFor(() =>
      expect(apiRequestMock).toHaveBeenCalledWith(
        "/live-sessions/session-1/close",
        { method: "POST", mutate: true },
      ),
    );
  });
});

function fireEventClick(name: string) {
  fireEvent.click(screen.getByRole("button", { name }));
}
