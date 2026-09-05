import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PropsWithChildren } from "react";
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import {
  encodeSessionCodePath,
  normalizeSessionCode,
  participantSnapshotQueryOptions,
  studentStatusQueryOptions,
  participantResultsQueryOptions,
  useParticipantResults,
  useJoinLiveSession,
  useParticipantSnapshot,
  useStudentStatus,
} from "@/lib/api/participant-live-sessions";
import { queryKeys } from "@/lib/api/query-keys";
import { persistAnonymousParticipantCredential } from "@/lib/live/anonymous-participant-credential";
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
      auth: { kind: "session" },
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
      queryKeys.participantLiveSessions.snapshot("student", "session-1"),
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

describe("Participant results query (CP4)", () => {
  it("uses the participant result key, forwards signal, and stays disabled until enabled", async () => {
    const result = {
      snapshotType: "poll" as const,
      selectionMode: "single" as const,
      status: "open" as const,
      options: [{ optionId: "opt-1", optionRef: "A", text: "數學", count: 1 }],
      totalResponses: 1,
    };
    apiRequestMock.mockResolvedValueOnce(result);
    const queryClient = makeQueryClient();
    const disabled = renderHook(
      () => useParticipantResults("session-1", "sq-1"),
      { wrapper: wrapperFor(queryClient) },
    );
    expect(disabled.result.current.fetchStatus).toBe("idle");
    disabled.unmount();
    const enabled = renderHook(
      () => useParticipantResults("session-1", "sq-1", true),
      { wrapper: wrapperFor(queryClient) },
    );
    await waitFor(() => expect(enabled.result.current.data).toEqual(result));
    expect(apiRequestMock).toHaveBeenCalledWith(
      "/live-sessions/session-1/questions/sq-1/results",
      { signal: expect.any(AbortSignal), auth: { kind: "session" } },
    );
    expect(
      participantResultsQueryOptions("session-1", "sq-1", true).queryKey,
    ).toEqual(
      queryKeys.participantLiveSessions.results("student", "session-1", "sq-1"),
    );
    expect(
      participantResultsQueryOptions("session-1", "sq-1", true).queryKey,
    ).not.toEqual(queryKeys.liveSessions.results("session-1", "sq-1"));
  });
});

describe("Anonymous actor boundary (CP4)", () => {
  const liveSessionId = "11111111-1111-7111-8111-111111111111";

  it("isolates anonymous keys and fails closed without a credential", async () => {
    const studentKey = queryKeys.participantLiveSessions.snapshot(
      "student",
      liveSessionId,
    );
    const anonymousKey = queryKeys.participantLiveSessions.snapshot(
      "anonymous",
      liveSessionId,
    );
    expect(anonymousKey).not.toEqual(studentKey);
    expect(anonymousKey.join(" ")).not.toContain("token");

    const queryClient = makeQueryClient();
    const { result } = renderHook(
      () =>
        useParticipantSnapshot(liveSessionId, {
          kind: "anonymous",
          liveSessionId,
          sessionCode: "ABCD1234",
        }),
      { wrapper: wrapperFor(queryClient) },
    );

    await waitFor(() =>
      expect(result.current.error?.code).toBe("ANONYMOUS_CREDENTIAL_MISSING"),
    );
    expect(apiRequestMock).not.toHaveBeenCalled();
  });

  it("uses the scoped credential for anonymous snapshot requests", async () => {
    persistAnonymousParticipantCredential({
      liveSessionId,
      sessionCode: "ABCD1234",
      participantToken: "test-token",
    });
    apiRequestMock.mockResolvedValueOnce(snapshot({ id: liveSessionId }));

    const queryClient = makeQueryClient();
    const { result } = renderHook(
      () =>
        useParticipantSnapshot(liveSessionId, {
          kind: "anonymous",
          liveSessionId,
          sessionCode: "ABCD1234",
        }),
      { wrapper: wrapperFor(queryClient) },
    );
    await waitFor(() => expect(result.current.data?.id).toBe(liveSessionId));
    expect(apiRequestMock).toHaveBeenCalledWith(
      `/live-sessions/${liveSessionId}/snapshot`,
      expect.objectContaining({
        auth: { kind: "anonymous-participant", participantToken: "test-token" },
      }),
    );
  });
});

describe("Cache separation from teacher detail (CP1)", () => {
  it("uses a distinct participant query key that never collides with teacher detail", () => {
    expect(
      queryKeys.participantLiveSessions.snapshot("student", "session-1"),
    ).toEqual([
      "participant-live-sessions",
      "student",
      "session-1",
      "snapshot",
    ]);
    expect(
      queryKeys.participantLiveSessions.snapshot("student", "session-1"),
    ).not.toEqual(queryKeys.liveSessions.detail("session-1"));
    expect(queryKeys.participantLiveSessions.all).toEqual([
      "participant-live-sessions",
    ]);
  });
});
