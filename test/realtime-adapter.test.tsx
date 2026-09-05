import { act, render, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PropsWithChildren } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { queryKeys } from "@/lib/api/query-keys";
import { useLiveConnection } from "@/lib/live/socket-client";
import { useLiveSessionEvents } from "@/lib/live/use-live-session-events";
import {
  RealtimeEvent,
  isCanonicalEventSeq,
  isValidRealtimeEnvelope,
  type RealtimeEventEnvelope,
  type RealtimeSnapshotData,
} from "@/lib/live/realtime-types";
import type { LiveSession, SessionQuestionResults } from "@/lib/api/types";
import { persistAnonymousParticipantCredential } from "@/lib/live/anonymous-participant-credential";

// --- mock socket.io-client -------------------------------------------------

const mocks = vi.hoisted(() => {
  const listeners = new Map<string, Set<(...args: unknown[]) => void>>();
  const emit = (event: string, ...args: unknown[]) => {
    listeners.get(event)?.forEach((cb) => cb(...args));
  };
  const socket = {
    auth: {} as Record<string, unknown>,
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
      emit("connect");
    }),
    disconnect: vi.fn(() => {
      socket.connected = false;
    }),
  };
  return {
    socket,
    listeners,
    io: vi.fn((url: string, opts: { auth?: Record<string, unknown> }) => {
      void url;
      socket.auth = opts.auth ?? {};
      return socket;
    }),
    emit,
  };
});

vi.mock("socket.io-client", () => ({
  io: mocks.io,
}));

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

let seqCounter = 0;
function nextSeq(): string {
  seqCounter += 1;
  return String(seqCounter);
}

function envelope<T>(
  event: string,
  data: T,
  eventSeq?: string,
): RealtimeEventEnvelope<T> {
  return {
    event: event as RealtimeEventEnvelope["event"],
    schemaVersion: 1,
    eventSeq: eventSeq ?? nextSeq(),
    aggregateVersion: 1,
    serverTimestamp: "2026-09-03T09:00:00.000Z",
    liveSessionId: "session-1",
    visibility: "teacher",
    data,
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
    questionSelections: [],
    sessionQuestions: [],
    ...overrides,
  };
}

function pollResults(): SessionQuestionResults {
  return {
    snapshotType: "poll",
    selectionMode: "single",
    status: "closed",
    options: [{ optionId: "opt-1", optionRef: "A", text: "數學", count: 8 }],
    totalResponses: 8,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.listeners.clear();
  mocks.socket.connected = false;
  mocks.socket.auth = {};
  window.sessionStorage.clear();
  seqCounter = 0;
});

describe("realtime wire validation (FE-4.3.1/4.3.2)", () => {
  it("accepts canonical large cursors without numeric coercion", () => {
    expect(isCanonicalEventSeq("9007199254740993")).toBe(true);
    expect(isCanonicalEventSeq("01")).toBe(false);
    expect(isCanonicalEventSeq("-1")).toBe(false);
  });

  it("rejects malformed actor/session/event/visibility envelopes", () => {
    const valid = envelope(
      RealtimeEvent.SESSION_STATE_CHANGED,
      { status: "active" },
      "9007199254740993",
    );
    valid.visibility = "participant";
    expect(
      isValidRealtimeEnvelope(
        valid,
        "session-1",
        RealtimeEvent.SESSION_STATE_CHANGED,
      ),
    ).toBe(true);
    expect(
      isValidRealtimeEnvelope({ ...valid, schemaVersion: 2 }, "session-1"),
    ).toBe(false);
    expect(
      isValidRealtimeEnvelope(
        { ...valid, liveSessionId: "other" },
        "session-1",
      ),
    ).toBe(false);
    expect(
      isValidRealtimeEnvelope(
        { ...valid, event: "counts.updated" },
        "session-1",
      ),
    ).toBe(false);
    expect(
      isValidRealtimeEnvelope({ ...valid, visibility: "teacher" }, "session-1"),
    ).toBe(false);
    expect(
      isValidRealtimeEnvelope(
        { ...valid, eventSeq: "9007199254740993.0" },
        "session-1",
      ),
    ).toBe(false);
  });
});

describe("useLiveConnection (FE-3.2.1/3.2.2/3.2.4/3.2.6)", () => {
  it("creates a socket with the liveSessionId auth, websocket transport, and credentials", () => {
    const queryClient = makeQueryClient();
    const { result } = renderHook(() => useLiveConnection("session-1"), {
      wrapper: wrapperFor(queryClient),
    });

    expect(mocks.io).toHaveBeenCalledTimes(1);
    const [url, opts] = mocks.io.mock.calls[0];
    expect(url).toBe("http://localhost:3000/live");
    expect(opts).toMatchObject({
      auth: { liveSessionId: "session-1" },
      transports: ["websocket"],
      withCredentials: true,
    });
    // The mock connects synchronously, so the socket is already connected.
    expect(result.current.status).toBe("connected");
  });

  it("updates and clears the lossless reconnect cursor", () => {
    const queryClient = makeQueryClient();
    const { result } = renderHook(() => useLiveConnection("session-1"), {
      wrapper: wrapperFor(queryClient),
    });

    act(() => result.current.acceptEventSeq("9007199254740993"));
    expect(mocks.socket.auth.lastEventSeq).toBe("9007199254740993");
    act(() => result.current.acceptEventSeq(null));
    expect(mocks.socket.auth).not.toHaveProperty("lastEventSeq");
  });

  it("does not connect when the id is empty", () => {
    const queryClient = makeQueryClient();
    const { result } = renderHook(() => useLiveConnection(""), {
      wrapper: wrapperFor(queryClient),
    });

    expect(mocks.io).not.toHaveBeenCalled();
    expect(result.current.status).toBe("idle");
  });

  it("uses the scoped anonymous credential only in the Socket.IO auth payload", () => {
    const liveSessionId = "11111111-1111-7111-8111-111111111111";
    persistAnonymousParticipantCredential({
      liveSessionId,
      sessionCode: "ABCD1234",
      participantToken: "secret-token",
    });

    const queryClient = makeQueryClient();
    renderHook(
      () =>
        useLiveConnection(liveSessionId, {
          kind: "anonymous",
          liveSessionId,
          sessionCode: "ABCD1234",
        }),
      { wrapper: wrapperFor(queryClient) },
    );

    const [url, opts] = mocks.io.mock.calls[0];
    expect(url).toBe("http://localhost:3000/live");
    expect(opts).toMatchObject({
      auth: { participantToken: "secret-token", sessionCode: "ABCD1234" },
      transports: ["websocket"],
      withCredentials: true,
    });
    expect(url).not.toContain("secret-token");
  });

  it("fails closed without creating a socket for a missing anonymous credential", () => {
    const queryClient = makeQueryClient();
    const { result } = renderHook(
      () =>
        useLiveConnection("11111111-1111-7111-8111-111111111111", {
          kind: "anonymous",
          liveSessionId: "11111111-1111-7111-8111-111111111111",
          sessionCode: "ABCD1234",
        }),
      { wrapper: wrapperFor(queryClient) },
    );

    expect(mocks.io).not.toHaveBeenCalled();
    expect(result.current.status).toBe("idle");
  });

  it("surfaces connected status on connect and error on server error event", () => {
    const queryClient = makeQueryClient();
    const { result } = renderHook(() => useLiveConnection("session-1"), {
      wrapper: wrapperFor(queryClient),
    });

    act(() => mocks.emit("connect"));
    expect(result.current.status).toBe("connected");

    act(() => mocks.emit("error", { code: "REALTIME_UNAVAILABLE" }));
    expect(result.current.status).toBe("error");
    expect(result.current.errorCode).toBe("REALTIME_UNAVAILABLE");
  });

  it("disconnects on unmount", () => {
    const queryClient = makeQueryClient();
    const { unmount } = renderHook(() => useLiveConnection("session-1"), {
      wrapper: wrapperFor(queryClient),
    });

    unmount();
    expect(mocks.socket.disconnect).toHaveBeenCalled();
  });
});

describe("useLiveSessionEvents (FE-3.2.3/3.2.5)", () => {
  function renderEvents(queryClient: QueryClient) {
    // Both hooks must live in the same render so the events hook re-subscribes
    // when the connection hook's socket state changes (as in the real view).
    function Harness() {
      const conn = useLiveConnection("session-1");
      useLiveSessionEvents("session-1", conn);
      return null;
    }
    return render(<Harness />, { wrapper: wrapperFor(queryClient) });
  }

  it("seeds detail + per-question results caches from a snapshot", async () => {
    const queryClient = makeQueryClient();
    renderEvents(queryClient);

    const snapshot: RealtimeSnapshotData = {
      liveSession: liveSession({ joinedCount: 20, votedCount: 9 }),
      watermark: { eventSeq: "1", aggregateVersions: {} },
      results: { "sq-1": pollResults() },
    };
    act(() =>
      mocks.emit(
        RealtimeEvent.SESSION_SNAPSHOT,
        envelope(RealtimeEvent.SESSION_SNAPSHOT, snapshot),
      ),
    );

    await waitFor(() => {
      expect(
        queryClient.getQueryData(queryKeys.liveSessions.detail("session-1")),
      ).toMatchObject({ joinedCount: 20, votedCount: 9 });
      expect(
        queryClient.getQueryData(
          queryKeys.liveSessions.results("session-1", "sq-1"),
        ),
      ).toMatchObject({ snapshotType: "poll", totalResponses: 8 });
    });
  });

  it("invalidates detail on question.opened / question.closed / state_changed / counts.updated", async () => {
    const queryClient = makeQueryClient();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    renderEvents(queryClient);

    act(() =>
      mocks.emit(
        RealtimeEvent.QUESTION_OPENED,
        envelope(RealtimeEvent.QUESTION_OPENED, { sessionQuestionId: "sq-1" }),
      ),
    );
    act(() =>
      mocks.emit(
        RealtimeEvent.QUESTION_CLOSED,
        envelope(RealtimeEvent.QUESTION_CLOSED, { sessionQuestionId: "sq-1" }),
      ),
    );
    act(() =>
      mocks.emit(
        RealtimeEvent.SESSION_STATE_CHANGED,
        envelope(RealtimeEvent.SESSION_STATE_CHANGED, { status: "active" }),
      ),
    );
    act(() =>
      mocks.emit(
        "counts.updated",
        envelope("counts.updated", { joinedCount: 3, votedCount: 1 }),
      ),
    );

    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: queryKeys.liveSessions.detail("session-1"),
      });
    });
    expect(invalidateSpy).toHaveBeenCalledTimes(4);
  });

  it("invalidates the per-question results cache on result.updated", async () => {
    const queryClient = makeQueryClient();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    renderEvents(queryClient);

    act(() =>
      mocks.emit(
        RealtimeEvent.RESULT_UPDATED,
        envelope(RealtimeEvent.RESULT_UPDATED, {
          sessionQuestionId: "sq-1",
          results: pollResults(),
        }),
      ),
    );

    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: queryKeys.liveSessions.results("session-1", "sq-1"),
      });
    });
  });

  it("re-adopts a fresh snapshot on sync.required (invalidate + snapshot.fetch)", async () => {
    const queryClient = makeQueryClient();
    renderEvents(queryClient);

    const syncEvt = envelope(RealtimeEvent.SYNC_REQUIRED, {
      reason: "gap",
      watermark: { eventSeq: "5", aggregateVersions: {} },
    });
    act(() => mocks.emit(RealtimeEvent.SYNC_REQUIRED, syncEvt));

    await waitFor(() => {
      // Re-adoption refetches the fresh snapshot; the cursor carries the sync seq.
      expect(mocks.socket.emit).toHaveBeenCalledWith("snapshot.fetch", {
        lastEventSeq: syncEvt.eventSeq,
      });
    });
  });

  it("dedupes by (liveSessionId, eventSeq) and does not re-apply an older event", async () => {
    const queryClient = makeQueryClient();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    renderEvents(queryClient);

    const evt = envelope(
      RealtimeEvent.SESSION_STATE_CHANGED,
      { status: "active" },
      "3",
    );
    act(() => mocks.emit(RealtimeEvent.SESSION_STATE_CHANGED, evt));
    act(() => mocks.emit(RealtimeEvent.SESSION_STATE_CHANGED, evt));

    await waitFor(() => expect(invalidateSpy).toHaveBeenCalledTimes(1));
  });

  it("invalidates detail on session.closed (terminal)", async () => {
    const queryClient = makeQueryClient();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    renderEvents(queryClient);

    act(() =>
      mocks.emit(
        RealtimeEvent.SESSION_CLOSED,
        envelope(RealtimeEvent.SESSION_CLOSED, { status: "closed" }),
      ),
    );

    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: queryKeys.liveSessions.detail("session-1"),
      });
    });
  });
});
