/**
 * Wire types for the backend durable realtime contract (Socket.IO `/live`).
 *
 * Aligned with `smartLearning-backend/src/modules/realtime/live-session-realtime-contract.ts`
 * and `live-gateway.ts`. The durable event envelope is:
 *
 * ```json
 * { "event": "result.updated", "schemaVersion": 1, "eventSeq": "1042",
 *   "aggregateVersion": 17, "serverTimestamp": "ISO", "liveSessionId": "UUID",
 *   "visibility": "session|teacher|participant|participant_after_submit",
 *   "data": { ... } }
 * ```
 *
 * `eventSeq` is a per-session monotonically increasing PostgreSQL BIGINT, always a
 * decimal string on the wire. `serverTimestamp` is display-only; ordering is by
 * `eventSeq`. Clients dedupe by `(liveSessionId, eventSeq)` and must never let an
 * older watermark overwrite newer state.
 */

import type { LiveSession, SessionQuestionResults } from "@/lib/api/types";

/** Durable realtime event names emitted by the `/live` gateway. */
export const RealtimeEvent = {
  SESSION_SNAPSHOT: "session.snapshot",
  SESSION_STATE_CHANGED: "session.state_changed",
  QUESTION_OPENED: "question.opened",
  QUESTION_CLOSED: "question.closed",
  RESULT_UPDATED: "result.updated",
  SESSION_CLOSED: "session.closed",
  SYNC_REQUIRED: "sync.required",
} as const;

export type RealtimeEventName =
  (typeof RealtimeEvent)[keyof typeof RealtimeEvent];

/** Legacy teacher-only count notification (compatibility alias). */
export const REALTIME_LEGACY_COUNTS_EVENT = "counts.updated" as const;

/** Visibility scopes carried by the durable envelope. */
export const RealtimeVisibility = {
  SESSION: "session",
  TEACHER: "teacher",
  PARTICIPANT: "participant",
  PARTICIPANT_AFTER_SUBMIT: "participant_after_submit",
} as const;

export type RealtimeVisibility =
  (typeof RealtimeVisibility)[keyof typeof RealtimeVisibility];

/** Reasons the server asks a client to re-adopt a fresh snapshot. */
export const RealtimeSyncReason = {
  INVALID_CURSOR: "invalid_cursor",
  OVER_CURRENT: "over_current",
  STALE: "stale",
  EXPIRED: "expired",
  GAP: "gap",
  COALESCED: "coalesced",
  DEAD: "dead",
  PERMISSION_INVALID: "permission_invalid",
  SESSION_BOUNDARY: "session_boundary",
} as const;

export type RealtimeSyncReason =
  (typeof RealtimeSyncReason)[keyof typeof RealtimeSyncReason];

/** Durable event envelope (server → client). */
export interface RealtimeEventEnvelope<T = Record<string, unknown>> {
  event: RealtimeEventName;
  schemaVersion: number;
  /** Decimal string to avoid JavaScript precision loss for PostgreSQL BIGINT. */
  eventSeq: string;
  aggregateVersion: number;
  serverTimestamp: string;
  liveSessionId: string;
  visibility: RealtimeVisibility;
  data: T;
}

/** Watermark carried by snapshots and `sync.required`. */
export interface RealtimeWatermark {
  /** Decimal string. */
  eventSeq: string;
  aggregateVersions: Readonly<Record<string, number>>;
}

/** Actor-safe snapshot payload (`session.snapshot`). */
export interface RealtimeSnapshotData {
  liveSession: LiveSession;
  watermark: RealtimeWatermark;
  /** Map keyed by sessionQuestionId → per-question results projection. */
  results: Readonly<Record<string, SessionQuestionResults>>;
  reason?: string;
}

/** `question.opened` / `question.closed` payload. */
export interface RealtimeQuestionEventData {
  sessionQuestionId: string;
}

/** `session.state_changed` / `session.closed` payload. */
export interface RealtimeSessionStateData {
  status: string;
}

/** `result.updated` payload (teacher projection). */
export interface RealtimeResultUpdatedData {
  sessionQuestionId: string;
  results: SessionQuestionResults;
}

/** `counts.updated` payload (teacher-only legacy alias). */
export interface RealtimeCountsData {
  joinedCount: number;
  votedCount: number;
}

/** `sync.required` payload. */
export interface RealtimeSyncRequiredData {
  reason: RealtimeSyncReason;
  watermark: RealtimeWatermark;
}

/** `error` payload. */
export interface RealtimeErrorData {
  code: string;
}

/** Typed map of every server→client event name to its payload. */
export interface RealtimeEventMap {
  [RealtimeEvent.SESSION_SNAPSHOT]: RealtimeEventEnvelope<RealtimeSnapshotData>;
  [RealtimeEvent.SESSION_STATE_CHANGED]: RealtimeEventEnvelope<RealtimeSessionStateData>;
  [RealtimeEvent.QUESTION_OPENED]: RealtimeEventEnvelope<RealtimeQuestionEventData>;
  [RealtimeEvent.QUESTION_CLOSED]: RealtimeEventEnvelope<RealtimeQuestionEventData>;
  [RealtimeEvent.RESULT_UPDATED]: RealtimeEventEnvelope<RealtimeResultUpdatedData>;
  [RealtimeEvent.SESSION_CLOSED]: RealtimeEventEnvelope<RealtimeSessionStateData>;
  [RealtimeEvent.SYNC_REQUIRED]: RealtimeEventEnvelope<RealtimeSyncRequiredData>;
  [REALTIME_LEGACY_COUNTS_EVENT]: RealtimeEventEnvelope<RealtimeCountsData>;
  error: RealtimeErrorData;
}

/** Client→server events. */
export const RealtimeClientEvent = {
  SNAPSHOT_FETCH: "snapshot.fetch",
} as const;

export type RealtimeClientEventName =
  (typeof RealtimeClientEvent)[keyof typeof RealtimeClientEvent];
