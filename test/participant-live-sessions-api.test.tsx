import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PropsWithChildren } from "react";
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import {
  encodeSessionCodePath,
  normalizeSessionCode,
  participantSnapshotQueryOptions,
  studentStatusQueryOptions,
  useJoinLiveSession,
  useParticipantSnapshot,
  useStudentStatus,
} from "@/lib/api/participant-live-sessions";
import { queryKeys } from "@/lib/api/query-keys";
import { ApiRequestError } from "@/lib/api/client";
import type {
  JoinLiveSessionResponse,
  ParticipantLiveSessionSnapshot,
  StudentLiveSessionStatus,
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
        hasSubmitted: false,
        options: [{ id: "opt-1", optionRef: "A", text: "數學", position: 0 }],
      },
    ],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Session code normalization (CP1)", () => {
  it("trims and uppercases the session code", () => {
    expect(normalizeSessionCode("  abcd12  ")).toBe("ABCD12");
    expect(normalizeSessionCode("abcd12")).toBe("ABCD12");
  });

  it("encodes the normalized code as a single path segment", () => {
    expect(encodeSessionCodePath(" ab/cd ")).toBe("AB%2FCD");
    expect(encodeSessionCodePath("abcd12")).toBe("ABCD12");
  });
});

describe("Join live session mutation (CP1)", () => {
  it("posts body {} with CSRF/Origin and returns the server-authoritative response", async () => {
    const response: JoinLiveSessionResponse = {
      participantId: "participant-1",
      participantToken: null,
      liveSession: {
        id: "session-1",
        status: "active",
        sessionCode: "ABCD12",
      },
      currentQuestion: null,
    };
    apiRequestMock.mockResolvedValueOnce(response);

    const queryClient = makeQueryClient();
    const { result } = renderHook(() => useJoinLiveSession(), {
      wrapper: wrapperFor(queryClient),
    });

    act(() => {
      result.current.mutate({ sessionCode: "  abcd12  " });
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(apiRequestMock).toHaveBeenCalledTimes(1);
    expect(apiRequestMock).toHaveBeenCalledWith("/live-sessions/ABCD12/join", {
      method: "POST",
      body: {},
      mutate: true,
    });
    expect(result.current.data).toEqual(response);
    // The frontend never synthesizes a participant token.
    expect(result.current.data?.participantToken).toBeNull();
  });

  it("preserves ApiRequestError identity on a failed join and leaves no optimistic state", async () => {
    const error = new ApiRequestError(
      {
        code: "SESSION_NOT_JOINABLE",
        message: "internal detail",
        blocking: true,
      },
      409,
    );
    apiRequestMock.mockRejectedValueOnce(error);

    const queryClient = makeQueryClient();
    const { result } = renderHook(() => useJoinLiveSession(), {
      wrapper: wrapperFor(queryClient),
    });

    act(() => {
      result.current.mutate({ sessionCode: "ABCD12" });
    });
    await waitFor(() => expect(result.current.error).toBe(error));

    expect(result.current.error).toMatchObject({
      code: "SESSION_NOT_JOINABLE",
      status: 409,
    });
    expect(result.current.data).toBeUndefined();
    expect(result.current.isSuccess).toBe(false);
  });
});

describe("Participant snapshot query (CP1)", () => {
  it("fetches the participant-safe projection with a cookie GET and preserves rows", async () => {
    const data = snapshot();
    apiRequestMock.mockResolvedValueOnce(data);

    const queryClient = makeQueryClient();
    const { result } = renderHook(() => useParticipantSnapshot("session-1"), {
      wrapper: wrapperFor(queryClient),
    });

    await waitFor(() => expect(result.current.data).toEqual(data));

    expect(apiRequestMock).toHaveBeenCalledTimes(1);
    expect(apiRequestMock).toHaveBeenCalledWith(
      "/live-sessions/session-1/snapshot",
      { signal: expect.any(AbortSignal) },
    );
    expect(result.current.data?.sessionQuestions).toHaveLength(1);
    expect(result.current.data?.sessionQuestions[0].hasSubmitted).toBe(false);
    // The participant projection must not carry teacher-only fields.
    expect(result.current.data).not.toHaveProperty("questionSelections");
    expect(result.current.data).not.toHaveProperty("joinedCount");
    expect(result.current.data).not.toHaveProperty("votedCount");
    expect(participantSnapshotQueryOptions("session-1").queryKey).toEqual(
      queryKeys.participantLiveSessions.snapshot("session-1"),
    );
  });

  it("does not fetch when the id is empty", () => {
    const queryClient = makeQueryClient();
    const { result } = renderHook(() => useParticipantSnapshot(""), {
      wrapper: wrapperFor(queryClient),
    });

    expect(result.current.fetchStatus).toBe("idle");
    expect(apiRequestMock).not.toHaveBeenCalled();
  });

  it("preserves ApiRequestError identity and does not retry", async () => {
    const error = new ApiRequestError(
      {
        code: "ENROLLMENT_REQUIRED",
        message: "internal detail",
        blocking: true,
      },
      403,
    );
    apiRequestMock.mockRejectedValue(error);

    const queryClient = makeQueryClient();
    const { result } = renderHook(() => useParticipantSnapshot("session-1"), {
      wrapper: wrapperFor(queryClient),
    });

    await waitFor(() => expect(result.current.error).toBe(error));
    expect(apiRequestMock).toHaveBeenCalledTimes(1);
    expect(result.current.error).toMatchObject({
      code: "ENROLLMENT_REQUIRED",
      status: 403,
    });
  });
});

describe("Student status query (CP1)", () => {
  it("fetches the student-only lifecycle receipt for all four states", async () => {
    const status: StudentLiveSessionStatus = {
      id: "session-1",
      status: "closed",
      startedAt: "2026-09-03T09:00:00.000Z",
      closedAt: "2026-09-03T10:00:00.000Z",
    };
    apiRequestMock.mockResolvedValueOnce(status);

    const queryClient = makeQueryClient();
    const { result } = renderHook(() => useStudentStatus("session-1"), {
      wrapper: wrapperFor(queryClient),
    });

    await waitFor(() => expect(result.current.data).toEqual(status));

    expect(apiRequestMock).toHaveBeenCalledTimes(1);
    expect(apiRequestMock).toHaveBeenCalledWith(
      "/live-sessions/session-1/student-status",
      { signal: expect.any(AbortSignal) },
    );
    expect(result.current.data?.status).toBe("closed");
    expect(studentStatusQueryOptions("session-1").queryKey).toEqual(
      queryKeys.participantLiveSessions.studentStatus("session-1"),
    );
  });

  it("does not fetch when the id is empty", () => {
    const queryClient = makeQueryClient();
    const { result } = renderHook(() => useStudentStatus(""), {
      wrapper: wrapperFor(queryClient),
    });

    expect(result.current.fetchStatus).toBe("idle");
    expect(apiRequestMock).not.toHaveBeenCalled();
  });
});

describe("Cache separation from teacher detail (CP1)", () => {
  it("uses a distinct participant query key that never collides with teacher detail", () => {
    expect(queryKeys.participantLiveSessions.snapshot("session-1")).toEqual([
      "participant-live-sessions",
      "session-1",
      "snapshot",
    ]);
    expect(queryKeys.participantLiveSessions.snapshot("session-1")).not.toEqual(
      queryKeys.liveSessions.detail("session-1"),
    );
    expect(queryKeys.participantLiveSessions.all).toEqual([
      "participant-live-sessions",
    ]);
  });
});
