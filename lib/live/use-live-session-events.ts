"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { queryKeys } from "@/lib/api/query-keys";
import type { LiveConnection } from "@/lib/live/socket-client";
import {
  RealtimeEvent,
  type RealtimeEventEnvelope,
  type RealtimeEventMap,
  type RealtimeSnapshotData,
} from "@/lib/live/realtime-types";

/**
 * Map durable realtime events to authoritative React Query cache updates (FE-3.2).
 *
 * The backend is the authority: realtime events only invalidate / seed the REST
 * `liveSessions.detail(id)` and `liveSessions.results(id, sqId)` caches — they never
 * perform optimistic writes. Events are deduped by `(liveSessionId, eventSeq)` and an
 * older watermark is never allowed to overwrite newer state.
 *
 * `session.snapshot` carries a full actor-safe snapshot (`liveSession` + a `results`
 * map). We seed the detail cache from `data.liveSession` and each per-question results
 * cache from `data.results`, then invalidate so the next read is authoritative.
 */

/** Track the highest eventSeq seen so the cursor survives reconnects. */
export function useLiveSessionEvents(
  liveSessionId: string,
  connection: LiveConnection,
): void {
  const queryClient = useQueryClient();
  const cursorRef = useRef<string | null>(null);
  const seenRef = useRef<Set<string>>(new Set());
  const { socket, sendSnapshotFetch } = connection;

  useEffect(() => {
    if (!socket || !liveSessionId) return;

    const isDeduped = <T>(envelope: RealtimeEventEnvelope<T>): boolean => {
      const key = `${envelope.liveSessionId}:${envelope.eventSeq}`;
      if (seenRef.current.has(key)) return true;
      seenRef.current.add(key);
      // Track the highest cursor for reconnect recovery.
      if (
        cursorRef.current === null ||
        BigInt(envelope.eventSeq) > BigInt(cursorRef.current)
      ) {
        cursorRef.current = envelope.eventSeq;
      }
      return false;
    };

    const invalidateDetail = () =>
      queryClient.invalidateQueries({
        queryKey: queryKeys.liveSessions.detail(liveSessionId),
      });

    const invalidateResults = (sessionQuestionId: string) =>
      queryClient.invalidateQueries({
        queryKey: queryKeys.liveSessions.results(
          liveSessionId,
          sessionQuestionId,
        ),
      });

    const seedSnapshot = (data: RealtimeSnapshotData) => {
      // Seed the detail cache from the authoritative snapshot.
      queryClient.setQueryData(
        queryKeys.liveSessions.detail(liveSessionId),
        data.liveSession,
      );
      // Seed each per-question results cache from the snapshot's results map.
      for (const [sessionQuestionId, results] of Object.entries(data.results)) {
        queryClient.setQueryData(
          queryKeys.liveSessions.results(liveSessionId, sessionQuestionId),
          results,
        );
      }
      // Invalidate so the next read is authoritative (and any staleTime is bypassed).
      void invalidateDetail();
    };

    const onSnapshot = (
      envelope: RealtimeEventMap[typeof RealtimeEvent.SESSION_SNAPSHOT],
    ) => {
      if (isDeduped(envelope)) return;
      seedSnapshot(envelope.data);
    };

    const onQuestionOpened = (
      envelope: RealtimeEventMap[typeof RealtimeEvent.QUESTION_OPENED],
    ) => {
      if (isDeduped(envelope)) return;
      void invalidateDetail();
    };

    const onQuestionClosed = (
      envelope: RealtimeEventMap[typeof RealtimeEvent.QUESTION_CLOSED],
    ) => {
      if (isDeduped(envelope)) return;
      void invalidateDetail();
    };

    const onStateChanged = (
      envelope: RealtimeEventMap[typeof RealtimeEvent.SESSION_STATE_CHANGED],
    ) => {
      if (isDeduped(envelope)) return;
      void invalidateDetail();
    };

    const onResultUpdated = (
      envelope: RealtimeEventMap[typeof RealtimeEvent.RESULT_UPDATED],
    ) => {
      if (isDeduped(envelope)) return;
      invalidateResults(envelope.data.sessionQuestionId);
    };

    const onCountsUpdated = (envelope: RealtimeEventMap["counts.updated"]) => {
      if (isDeduped(envelope)) return;
      void invalidateDetail();
    };

    const onSyncRequired = (
      envelope: RealtimeEventMap[typeof RealtimeEvent.SYNC_REQUIRED],
    ) => {
      if (isDeduped(envelope)) return;
      // Re-adopt a fresh authoritative snapshot.
      void invalidateDetail();
      sendSnapshotFetch(cursorRef.current ?? undefined);
    };

    const onSessionClosed = (
      envelope: RealtimeEventMap[typeof RealtimeEvent.SESSION_CLOSED],
    ) => {
      if (isDeduped(envelope)) return;
      void invalidateDetail();
    };

    socket.on(RealtimeEvent.SESSION_SNAPSHOT, onSnapshot);
    socket.on(RealtimeEvent.QUESTION_OPENED, onQuestionOpened);
    socket.on(RealtimeEvent.QUESTION_CLOSED, onQuestionClosed);
    socket.on(RealtimeEvent.SESSION_STATE_CHANGED, onStateChanged);
    socket.on(RealtimeEvent.RESULT_UPDATED, onResultUpdated);
    socket.on("counts.updated", onCountsUpdated);
    socket.on(RealtimeEvent.SYNC_REQUIRED, onSyncRequired);
    socket.on(RealtimeEvent.SESSION_CLOSED, onSessionClosed);

    return () => {
      socket.off(RealtimeEvent.SESSION_SNAPSHOT, onSnapshot);
      socket.off(RealtimeEvent.QUESTION_OPENED, onQuestionOpened);
      socket.off(RealtimeEvent.QUESTION_CLOSED, onQuestionClosed);
      socket.off(RealtimeEvent.SESSION_STATE_CHANGED, onStateChanged);
      socket.off(RealtimeEvent.RESULT_UPDATED, onResultUpdated);
      socket.off("counts.updated", onCountsUpdated);
      socket.off(RealtimeEvent.SYNC_REQUIRED, onSyncRequired);
      socket.off(RealtimeEvent.SESSION_CLOSED, onSessionClosed);
    };
  }, [liveSessionId, socket, sendSnapshotFetch, queryClient]);
}
