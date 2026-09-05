"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { queryKeys } from "@/lib/api/query-keys";
import type { ParticipantLiveSessionSnapshot } from "@/lib/api/types";
import { isLearnerAccessCode } from "@/features/live-student/LearnerAccessState";
import type { LiveConnection } from "@/lib/live/socket-client";
import {
  RealtimeEvent,
  isCanonicalEventSeq,
  isValidRealtimeEnvelope,
  type ParticipantRealtimeSnapshotData,
  type RealtimeEventEnvelope,
  type RealtimeEventMap,
} from "@/lib/live/realtime-types";

const RECOVERY_TIMEOUT_MS = 250;

/** Participant-only realtime cache adapter. Teacher caches are never touched. */
export function useParticipantLiveSessionEvents(
  liveSessionId: string,
  connection: LiveConnection,
  onAccessLoss?: () => void,
): void {
  const queryClient = useQueryClient();
  const highestSeq = useRef<bigint | null>(null);
  const watermark = useRef<bigint | null>(null);
  const recovering = useRef(false);
  const accessLost = useRef(false);
  const fallbackSent = useRef(false);
  const recoveryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { socket, acceptEventSeq, sendSnapshotFetch, terminate } = connection;
  const clearParticipantCache = () => {
    queryClient.removeQueries({
      queryKey: queryKeys.participantLiveSessions.session(liveSessionId),
    });
    onAccessLoss?.();
    terminate();
  };

  useEffect(() => {
    if (!socket || !liveSessionId) return;

    const clearRecoveryTimer = () => {
      if (recoveryTimer.current !== null) clearTimeout(recoveryTimer.current);
      recoveryTimer.current = null;
    };
    const accept = (
      value: unknown,
      expectedEvent?: string,
    ): value is RealtimeEventEnvelope => {
      if (accessLost.current) return false;
      if (
        !isValidRealtimeEnvelope(value, liveSessionId, expectedEvent as never)
      )
        return false;
      const seq = BigInt(value.eventSeq);
      if (recovering.current) return false;
      if (highestSeq.current !== null && seq <= highestSeq.current)
        return false;
      highestSeq.current = seq;
      acceptEventSeq(value.eventSeq);
      return true;
    };
    const validSnapshot = (
      data: unknown,
    ): data is ParticipantRealtimeSnapshotData => {
      if (!data || typeof data !== "object") return false;
      const candidate = data as Partial<ParticipantRealtimeSnapshotData>;
      const session = candidate.liveSession;
      return Boolean(
        session &&
        typeof session === "object" &&
        Array.isArray(session.sessionQuestions) &&
        Array.isArray(candidate.submittedQuestionIds) &&
        candidate.submittedQuestionIds.every((id) => typeof id === "string") &&
        candidate.results &&
        typeof candidate.results === "object" &&
        candidate.watermark &&
        isCanonicalEventSeq(candidate.watermark.eventSeq),
      );
    };
    const invalidateSnapshot = () =>
      void queryClient.invalidateQueries({
        queryKey: queryKeys.participantLiveSessions.snapshot(liveSessionId),
      });
    const seedSnapshot = (data: ParticipantRealtimeSnapshotData) => {
      const nextWatermark = BigInt(data.watermark.eventSeq);
      if (watermark.current !== null && nextWatermark < watermark.current)
        return false;
      const submitted = new Set(data.submittedQuestionIds);
      const snapshot: ParticipantLiveSessionSnapshot = {
        ...data.liveSession,
        sessionQuestions: data.liveSession.sessionQuestions.map((question) => ({
          ...question,
          hasSubmitted: submitted.has(question.id),
        })),
      };
      queryClient.setQueryData(
        queryKeys.participantLiveSessions.snapshot(liveSessionId),
        snapshot,
      );
      for (const [questionId, results] of Object.entries(data.results)) {
        queryClient.setQueryData(
          queryKeys.participantLiveSessions.results(liveSessionId, questionId),
          results,
        );
      }
      watermark.current = nextWatermark;
      if (highestSeq.current === null || nextWatermark > highestSeq.current) {
        highestSeq.current = nextWatermark;
        acceptEventSeq(data.watermark.eventSeq);
      }
      return true;
    };

    const onSnapshot = (event: RealtimeEventMap["session.snapshot"]) => {
      if (
        !isValidRealtimeEnvelope(
          event,
          liveSessionId,
          RealtimeEvent.SESSION_SNAPSHOT,
        )
      )
        return;
      const seq = BigInt(event.eventSeq);
      if (
        !recovering.current &&
        highestSeq.current !== null &&
        seq <= highestSeq.current
      )
        return;
      if (!validSnapshot(event.data) || !seedSnapshot(event.data)) return;
      recovering.current = false;
      fallbackSent.current = false;
      clearRecoveryTimer();
    };
    const onInvalidate = (event: unknown, name: string) => {
      if (accept(event, name)) invalidateSnapshot();
    };
    const onResult = (event: RealtimeEventMap["result.updated"]) => {
      if (
        !isValidRealtimeEnvelope(
          event,
          liveSessionId,
          RealtimeEvent.RESULT_UPDATED,
        )
      )
        return;
      if (
        !event.data ||
        typeof event.data !== "object" ||
        typeof event.data.sessionQuestionId !== "string" ||
        !event.data.results
      )
        return;
      if (!accept(event, RealtimeEvent.RESULT_UPDATED)) return;
      queryClient.setQueryData(
        queryKeys.participantLiveSessions.results(
          liveSessionId,
          event.data.sessionQuestionId,
        ),
        event.data.results,
      );
      void queryClient.invalidateQueries({
        queryKey: queryKeys.participantLiveSessions.results(
          liveSessionId,
          event.data.sessionQuestionId,
        ),
      });
    };
    const onClosed = (event: RealtimeEventMap["session.closed"]) => {
      if (!accept(event, RealtimeEvent.SESSION_CLOSED)) return;
      invalidateSnapshot();
      void queryClient.invalidateQueries({
        queryKey:
          queryKeys.participantLiveSessions.studentStatus(liveSessionId),
      });
    };
    const onSocketError = (payload?: { code?: string }) => {
      if (isLearnerAccessCode(payload?.code)) {
        accessLost.current = true;
        clearParticipantCache();
      }
    };

    const onSync = (event: RealtimeEventMap["sync.required"]) => {
      if (
        !isValidRealtimeEnvelope(
          event,
          liveSessionId,
          RealtimeEvent.SYNC_REQUIRED,
        )
      )
        return;
      if (
        !event.data?.watermark ||
        !isCanonicalEventSeq(event.data.watermark.eventSeq)
      )
        return;
      if (recovering.current) return;
      recovering.current = true;
      fallbackSent.current = false;
      acceptEventSeq(null);
      clearRecoveryTimer();
      recoveryTimer.current = setTimeout(() => {
        if (recovering.current && !fallbackSent.current) {
          fallbackSent.current = true;
          sendSnapshotFetch();
        }
      }, RECOVERY_TIMEOUT_MS);
      invalidateSnapshot();
    };

    const onStateChanged = (event: RealtimeEventMap["session.state_changed"]) =>
      onInvalidate(event, RealtimeEvent.SESSION_STATE_CHANGED);
    const onQuestionOpened = (event: RealtimeEventMap["question.opened"]) =>
      onInvalidate(event, RealtimeEvent.QUESTION_OPENED);
    const onQuestionClosed = (event: RealtimeEventMap["question.closed"]) =>
      onInvalidate(event, RealtimeEvent.QUESTION_CLOSED);

    socket.on(RealtimeEvent.SESSION_SNAPSHOT, onSnapshot);
    socket.on(RealtimeEvent.SESSION_STATE_CHANGED, onStateChanged);
    socket.on(RealtimeEvent.QUESTION_OPENED, onQuestionOpened);
    socket.on(RealtimeEvent.QUESTION_CLOSED, onQuestionClosed);
    socket.on(RealtimeEvent.RESULT_UPDATED, onResult);
    socket.on(RealtimeEvent.SESSION_CLOSED, onClosed);
    socket.on(RealtimeEvent.SYNC_REQUIRED, onSync);
    socket.on("error", onSocketError);
    return () => {
      clearRecoveryTimer();
      socket.off(RealtimeEvent.SESSION_SNAPSHOT, onSnapshot);
      socket.off(RealtimeEvent.SESSION_STATE_CHANGED, onStateChanged);
      socket.off(RealtimeEvent.QUESTION_OPENED, onQuestionOpened);
      socket.off(RealtimeEvent.QUESTION_CLOSED, onQuestionClosed);
      socket.off(RealtimeEvent.RESULT_UPDATED, onResult);
      socket.off(RealtimeEvent.SESSION_CLOSED, onClosed);
      socket.off(RealtimeEvent.SYNC_REQUIRED, onSync);
      socket.off("error", onSocketError);
    };
  }, [
    acceptEventSeq,
    clearParticipantCache,
    liveSessionId,
    onAccessLoss,
    queryClient,
    sendSnapshotFetch,
    socket,
    terminate,
  ]);
}
