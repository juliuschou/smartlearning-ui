import { act, render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PropsWithChildren } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { queryKeys } from "@/lib/api/query-keys";
import { useParticipantLiveSessionEvents } from "@/lib/live/use-participant-live-session-events";
import {
  RealtimeEvent,
  type RealtimeEventEnvelope,
} from "@/lib/live/realtime-types";
import type { LiveConnection } from "@/lib/live/socket-client";

const state = vi.hoisted(() => ({
  listeners: new Map<string, Set<(value: unknown) => void>>(),
}));
function emit(event: string, value: unknown) {
  state.listeners.get(event)?.forEach((listener) => listener(value));
}
const socket = {
  on: vi.fn((event: string, listener: (value: unknown) => void) => {
    if (!state.listeners.has(event)) state.listeners.set(event, new Set());
    state.listeners.get(event)!.add(listener);
  }),
  off: vi.fn((event: string, listener?: (value: unknown) => void) => {
    if (listener) state.listeners.get(event)?.delete(listener);
    else state.listeners.delete(event);
  }),
} as unknown as LiveConnection["socket"];

function envelope(
  event: string,
  data: unknown,
  seq: string,
  visibility = "participant",
) {
  return {
    event,
    schemaVersion: 1,
    eventSeq: seq,
    aggregateVersion: 1,
    serverTimestamp: "2026-09-05T00:00:00Z",
    liveSessionId: "s1",
    visibility,
    data,
  } as RealtimeEventEnvelope;
}
function connection() {
  const cursor = vi.fn();
  return {
    socket,
    status: "connected",
    errorCode: null,
    acceptEventSeq: cursor,
    sendSnapshotFetch: vi.fn(),
  } as unknown as LiveConnection & {
    acceptEventSeq: ReturnType<typeof vi.fn>;
    sendSnapshotFetch: ReturnType<typeof vi.fn>;
  };
}
function wrapper(client: QueryClient) {
  function QueryWrapper({ children }: PropsWithChildren) {
    return (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
  }
  return QueryWrapper;
}
function snapshot(seq: string, watermark = seq) {
  return envelope(
    RealtimeEvent.SESSION_SNAPSHOT,
    {
      liveSession: {
        id: "s1",
        sessionQuestions: [{ id: "q1", hasSubmitted: false }],
      },
      submittedQuestionIds: ["q1"],
      watermark: { eventSeq: watermark, aggregateVersions: {} },
      results: {},
    },
    seq,
  );
}

describe("participant realtime recovery", () => {
  beforeEach(() => {
    state.listeners.clear();
    vi.useRealTimers();
  });
  it("adopts a fresh snapshot losslessly and ignores an older watermark", () => {
    const client = new QueryClient();
    const conn = connection();
    function Harness() {
      useParticipantLiveSessionEvents("s1", conn);
      return null;
    }
    render(<Harness />, { wrapper: wrapper(client) });
    act(() =>
      emit(RealtimeEvent.SESSION_SNAPSHOT, snapshot("9007199254740993")),
    );
    act(() =>
      emit(
        RealtimeEvent.SESSION_SNAPSHOT,
        snapshot("9007199254740994", "9007199254740992"),
      ),
    );
    expect(
      client.getQueryData(queryKeys.participantLiveSessions.snapshot("s1")),
    ).toMatchObject({ sessionQuestions: [{ hasSubmitted: true }] });
    expect(conn.acceptEventSeq).toHaveBeenCalledWith("9007199254740993");
  });
  it("clears rejected cursor and sends one cursorless fallback", () => {
    vi.useFakeTimers();
    const client = new QueryClient();
    const conn = connection();
    function Harness() {
      useParticipantLiveSessionEvents("s1", conn);
      return null;
    }
    render(<Harness />, { wrapper: wrapper(client) });
    act(() =>
      emit(
        RealtimeEvent.SYNC_REQUIRED,
        envelope(
          RealtimeEvent.SYNC_REQUIRED,
          {
            reason: "gap",
            watermark: { eventSeq: "8", aggregateVersions: {} },
          },
          "8",
        ),
      ),
    );
    act(() =>
      emit(
        RealtimeEvent.SYNC_REQUIRED,
        envelope(
          RealtimeEvent.SYNC_REQUIRED,
          {
            reason: "gap",
            watermark: { eventSeq: "9", aggregateVersions: {} },
          },
          "9",
        ),
      ),
    );
    expect(conn.acceptEventSeq).toHaveBeenCalledWith(null);
    act(() => vi.advanceTimersByTime(250));
    expect(conn.sendSnapshotFetch).toHaveBeenCalledTimes(1);
    expect(conn.sendSnapshotFetch).toHaveBeenCalledWith();
  });
  it("does not register counts.updated and cleans listeners on unmount", () => {
    const client = new QueryClient();
    const conn = connection();
    function Harness() {
      useParticipantLiveSessionEvents("s1", conn);
      return null;
    }
    const view = render(<Harness />, { wrapper: wrapper(client) });
    expect(state.listeners.has("counts.updated")).toBe(false);
    view.unmount();
    expect(
      [...state.listeners.values()].every((listeners) => listeners.size === 0),
    ).toBe(true);
  });
});
