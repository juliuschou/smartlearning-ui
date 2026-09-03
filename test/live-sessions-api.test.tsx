import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PropsWithChildren } from "react";
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import {
  liveSessionQueryOptions,
  sessionQuestionResultsQueryOptions,
  useCancelLiveSession,
  useCloseLiveSession,
  useCloseSessionQuestion,
  useCreateLiveSession,
  useLiveSession,
  useOpenSessionQuestion,
  useSessionQuestionResults,
  useStartLiveSession,
} from "@/lib/api/live-sessions";
import { queryKeys } from "@/lib/api/query-keys";
import { ApiRequestError } from "@/lib/api/client";
import type {
  LiveSession,
  SessionQuestion,
  SessionQuestionResults,
} from "@/lib/api/types";

const mocks = vi.hoisted(() => ({
  apiRequest: vi.fn(),
}));

vi.mock("@/lib/api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/client")>();
  return { ...actual, apiRequest: mocks.apiRequest };
});

const apiRequestMock = mocks.apiRequest as unknown as Mock;

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: 3, retryDelay: 0 },
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

function liveSession(overrides: Partial<LiveSession> = {}): LiveSession {
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
    questionSelections: [{ questionDefinitionId: "question-1", position: 0 }],
    sessionQuestions: [
      {
        id: "sq-1",
        liveSessionId: "session-1",
        questionDefinitionId: "question-1",
        position: 0,
        status: "open",
        snapshotType: "poll",
        snapshotPrompt: "你最喜歡哪個科目？",
        snapshotSelectionMode: "single",
        openedAt: "2026-09-03T09:01:00.000Z",
        closedAt: null,
        options: [{ id: "opt-1", optionRef: "A", text: "數學", position: 0 }],
      },
    ],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Live session detail transport (CP1)", () => {
  it("fetches the teacher detail projection with counts and preserves rows", async () => {
    const session = liveSession();
    apiRequestMock.mockResolvedValueOnce(session);

    const queryClient = makeQueryClient();
    const { result } = renderHook(() => useLiveSession("session-1"), {
      wrapper: wrapperFor(queryClient),
    });

    await waitFor(() => expect(result.current.data).toEqual(session));

    expect(apiRequestMock).toHaveBeenCalledTimes(1);
    expect(apiRequestMock).toHaveBeenCalledWith("/live-sessions/session-1", {
      signal: expect.any(AbortSignal),
    });
    expect(result.current.data?.joinedCount).toBe(12);
    expect(result.current.data?.votedCount).toBe(7);
    expect(result.current.data?.sessionQuestions).toHaveLength(1);
    expect(liveSessionQueryOptions("session-1").queryKey).toEqual(
      queryKeys.liveSessions.detail("session-1"),
    );
  });

  it("does not fetch when the id is empty", () => {
    const queryClient = makeQueryClient();
    const { result } = renderHook(() => useLiveSession(""), {
      wrapper: wrapperFor(queryClient),
    });

    expect(result.current.fetchStatus).toBe("idle");
    expect(apiRequestMock).not.toHaveBeenCalled();
  });

  it("preserves ApiRequestError identity and does not retry", async () => {
    const error = new ApiRequestError(
      { code: "FORBIDDEN", message: "internal detail", blocking: true },
      403,
    );
    apiRequestMock.mockRejectedValue(error);

    const queryClient = makeQueryClient();
    const { result } = renderHook(() => useLiveSession("session-1"), {
      wrapper: wrapperFor(queryClient),
    });

    await waitFor(() => expect(result.current.error).toBe(error));
    expect(apiRequestMock).toHaveBeenCalledTimes(1);
    expect(result.current.error).toMatchObject({
      code: "FORBIDDEN",
      status: 403,
    });
  });
});

describe("Live session lifecycle + open/close mutations (CP2)", () => {
  function sessionQuestion(
    overrides: Partial<SessionQuestion> = {},
  ): SessionQuestion {
    return {
      id: "sq-1",
      liveSessionId: "session-1",
      questionDefinitionId: "question-1",
      position: 0,
      status: "open",
      snapshotType: "poll",
      snapshotPrompt: "你最喜歡哪個科目？",
      snapshotSelectionMode: "single",
      openedAt: "2026-09-03T09:01:00.000Z",
      closedAt: null,
      options: [{ id: "opt-1", optionRef: "A", text: "數學", position: 0 }],
      ...overrides,
    };
  }

  it("creates a live session with only courseId + questionIds and invalidates detail", async () => {
    const created = liveSession({ id: "session-2" });
    apiRequestMock.mockResolvedValueOnce(created);

    const queryClient = makeQueryClient();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useCreateLiveSession(), {
      wrapper: wrapperFor(queryClient),
    });

    act(() => {
      result.current.mutate({
        courseId: "course-1",
        questionIds: ["question-1", "question-2"],
      });
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(apiRequestMock).toHaveBeenCalledTimes(1);
    expect(apiRequestMock).toHaveBeenCalledWith("/live-sessions", {
      method: "POST",
      body: { courseId: "course-1", questionIds: ["question-1", "question-2"] },
      mutate: true,
    });
    expect(result.current.data).toEqual(created);
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: queryKeys.liveSessions.detail("session-2"),
    });
  });

  it("starts a live session and invalidates its detail cache", async () => {
    const started = liveSession({ status: "active" });
    apiRequestMock.mockResolvedValueOnce(started);

    const queryClient = makeQueryClient();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useStartLiveSession(), {
      wrapper: wrapperFor(queryClient),
    });

    act(() => {
      result.current.mutate({ liveSessionId: "session-1" });
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(apiRequestMock).toHaveBeenCalledWith(
      "/live-sessions/session-1/start",
      { method: "POST", mutate: true },
    );
    expect(result.current.data).toEqual(started);
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: queryKeys.liveSessions.detail("session-1"),
    });
  });

  it("closes a live session and invalidates its detail cache", async () => {
    const closed = liveSession({ status: "closed" });
    apiRequestMock.mockResolvedValueOnce(closed);

    const queryClient = makeQueryClient();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useCloseLiveSession(), {
      wrapper: wrapperFor(queryClient),
    });

    act(() => {
      result.current.mutate({ liveSessionId: "session-1" });
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(apiRequestMock).toHaveBeenCalledWith(
      "/live-sessions/session-1/close",
      { method: "POST", mutate: true },
    );
    expect(result.current.data).toEqual(closed);
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: queryKeys.liveSessions.detail("session-1"),
    });
  });

  it("cancels a live session and invalidates its detail cache", async () => {
    const cancelled = liveSession({ status: "cancelled" });
    apiRequestMock.mockResolvedValueOnce(cancelled);

    const queryClient = makeQueryClient();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useCancelLiveSession(), {
      wrapper: wrapperFor(queryClient),
    });

    act(() => {
      result.current.mutate({ liveSessionId: "session-1" });
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(apiRequestMock).toHaveBeenCalledWith(
      "/live-sessions/session-1/cancel",
      { method: "POST", mutate: true },
    );
    expect(result.current.data).toEqual(cancelled);
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: queryKeys.liveSessions.detail("session-1"),
    });
  });

  it("opens a session question and invalidates the session detail cache", async () => {
    const opened = sessionQuestion({ status: "open" });
    apiRequestMock.mockResolvedValueOnce(opened);

    const queryClient = makeQueryClient();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useOpenSessionQuestion(), {
      wrapper: wrapperFor(queryClient),
    });

    act(() => {
      result.current.mutate({
        liveSessionId: "session-1",
        sessionQuestionId: "sq-1",
      });
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(apiRequestMock).toHaveBeenCalledWith(
      "/live-sessions/session-1/questions/sq-1/open",
      { method: "POST", mutate: true },
    );
    expect(result.current.data).toEqual(opened);
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: queryKeys.liveSessions.detail("session-1"),
    });
  });

  it("closes a session question and invalidates the session detail cache", async () => {
    const closed = sessionQuestion({ status: "closed" });
    apiRequestMock.mockResolvedValueOnce(closed);

    const queryClient = makeQueryClient();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useCloseSessionQuestion(), {
      wrapper: wrapperFor(queryClient),
    });

    act(() => {
      result.current.mutate({
        liveSessionId: "session-1",
        sessionQuestionId: "sq-1",
      });
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(apiRequestMock).toHaveBeenCalledWith(
      "/live-sessions/session-1/questions/sq-1/close",
      { method: "POST", mutate: true },
    );
    expect(result.current.data).toEqual(closed);
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: queryKeys.liveSessions.detail("session-1"),
    });
  });

  it("preserves ApiRequestError identity on a failed mutation and does not invalidate", async () => {
    const error = new ApiRequestError(
      {
        code: "SESSION_NOT_ACTIVE",
        message: "internal detail",
        blocking: true,
      },
      409,
    );
    apiRequestMock.mockRejectedValueOnce(error);

    const queryClient = makeQueryClient();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useStartLiveSession(), {
      wrapper: wrapperFor(queryClient),
    });

    act(() => {
      result.current.mutate({ liveSessionId: "session-1" });
    });
    await waitFor(() => expect(result.current.error).toBe(error));

    expect(result.current.error).toMatchObject({
      code: "SESSION_NOT_ACTIVE",
      status: 409,
    });
    expect(invalidateSpy).not.toHaveBeenCalled();
  });
});

describe("Live session question results transport (CP3)", () => {
  it("fetches the discriminated per-question results projection", async () => {
    const results: SessionQuestionResults = {
      snapshotType: "poll",
      selectionMode: "single",
      status: "closed",
      options: [
        { optionId: "opt-1", optionRef: "A", text: "數學", count: 8 },
        { optionId: "opt-2", optionRef: "B", text: "國文", count: 4 },
      ],
      totalResponses: 12,
    };
    apiRequestMock.mockResolvedValueOnce(results);

    const queryClient = makeQueryClient();
    const { result } = renderHook(
      () => useSessionQuestionResults("session-1", "sq-1"),
      { wrapper: wrapperFor(queryClient) },
    );

    await waitFor(() => expect(result.current.data).toEqual(results));

    expect(apiRequestMock).toHaveBeenCalledTimes(1);
    expect(apiRequestMock).toHaveBeenCalledWith(
      "/live-sessions/session-1/questions/sq-1/results",
      { signal: expect.any(AbortSignal) },
    );
    expect(result.current.data?.snapshotType).toBe("poll");
    expect(result.current.data?.totalResponses).toBe(12);
    expect(
      sessionQuestionResultsQueryOptions("session-1", "sq-1").queryKey,
    ).toEqual(queryKeys.liveSessions.results("session-1", "sq-1"));
  });

  it("does not fetch when the session or question id is empty", () => {
    const queryClient = makeQueryClient();
    const { result } = renderHook(() => useSessionQuestionResults("", "sq-1"), {
      wrapper: wrapperFor(queryClient),
    });

    expect(result.current.fetchStatus).toBe("idle");
    expect(apiRequestMock).not.toHaveBeenCalled();
  });

  it("preserves ApiRequestError identity and does not retry", async () => {
    const error = new ApiRequestError(
      {
        code: "SESSION_QUESTION_NOT_FOUND",
        message: "internal detail",
        blocking: true,
      },
      404,
    );
    apiRequestMock.mockRejectedValue(error);

    const queryClient = makeQueryClient();
    const { result } = renderHook(
      () => useSessionQuestionResults("session-1", "sq-1"),
      { wrapper: wrapperFor(queryClient) },
    );

    await waitFor(() => expect(result.current.error).toBe(error));
    expect(apiRequestMock).toHaveBeenCalledTimes(1);
    expect(result.current.error).toMatchObject({
      code: "SESSION_QUESTION_NOT_FOUND",
      status: 404,
    });
  });
});
