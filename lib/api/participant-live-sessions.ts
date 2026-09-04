import { queryOptions, useMutation, useQuery } from "@tanstack/react-query";
import {
  apiRequest,
  apiRequestWithStatus,
  type ApiRequestError,
} from "@/lib/api/client";
import { queryKeys } from "@/lib/api/query-keys";
import type {
  CreateSubmissionPayload,
  JoinLiveSessionResponse,
  ParticipantLiveSessionSnapshot,
  StudentLiveSessionStatus,
  SubmissionDto,
  SessionQuestionResults,
} from "@/lib/api/types";

/**
 * FE-4.1 — student (learner) entry/join transport.
 *
 * Backend contract is frozen (CP0): the student joins with their Web Session
 * cookie + CSRF + exact Origin, body `{}`, HTTP 201; the response carries
 * `participantToken: null` and a server-authoritative `liveSession`. The
 * learner snapshot is a participant-safe projection fetched with the cookie.
 *
 * This module deliberately does NOT synthesize or store a participant token,
 * does not seed a fake snapshot from the join response, and adds no polling or
 * Socket.IO (realtime is FE-4.3). After a successful join the caller navigates
 * to `/student/live/:id` and fetches the real snapshot there.
 */

/** Normalize a session code for the join path: trim + uppercase. */
export function normalizeSessionCode(code: string): string {
  return code.trim().toUpperCase();
}

/** Encode a session code as a single path segment (safe for `/join`). */
export function encodeSessionCodePath(code: string): string {
  return encodeURIComponent(normalizeSessionCode(code));
}

/** Variables for the account-cookie join mutation. */
export interface JoinLiveSessionVariables {
  sessionCode: string;
}

/**
 * Join a live session as an enrolled student — `POST
 * /live-sessions/:sessionCode/join`. Body is `{}` (the backend ignores
 * `displayName` for authenticated students); `mutate: true` attaches CSRF +
 * Origin. Returns the server-authoritative `liveSession`; the frontend never
 * stores `participantToken` (it is `null` for account joins).
 */
export interface SubmitPollSingleVariables {
  liveSessionId: string;
  sessionQuestionId: string;
  optionId: string;
  idempotencyKey: string;
}

/** Submit one formal option UUID; retries are caller-controlled. */
export function useSubmitPollSingle() {
  return useMutation<
    { data: SubmissionDto; status: number },
    ApiRequestError,
    SubmitPollSingleVariables
  >({
    mutationFn: ({
      liveSessionId,
      sessionQuestionId,
      optionId,
      idempotencyKey,
    }) =>
      apiRequestWithStatus<SubmissionDto>(
        `/live-sessions/${liveSessionId}/submissions`,
        {
          method: "POST",
          body: {
            sessionQuestionId,
            selectedOptionRefs: [optionId],
          } satisfies CreateSubmissionPayload,
          mutate: true,
          idempotencyKey,
        },
      ),
    retry: false,
  });
}

export function useJoinLiveSession() {
  return useMutation<
    JoinLiveSessionResponse,
    ApiRequestError,
    JoinLiveSessionVariables
  >({
    mutationFn: ({ sessionCode }) =>
      apiRequest<JoinLiveSessionResponse>(
        `/live-sessions/${encodeSessionCodePath(sessionCode)}/join`,
        { method: "POST", body: {}, mutate: true },
      ),
  });
}

/**
 * Query options for the participant-safe learner snapshot — `GET
 * /live-sessions/:id/snapshot`. Cookie GET (no CSRF), forwards the abort
 * signal, `retry: false`, and is disabled when the id is empty. Uses the
 * participant-specific query key so it can never collide with the teacher
 * detail projection.
 */
export function participantSnapshotQueryOptions(id: string) {
  return queryOptions<ParticipantLiveSessionSnapshot, ApiRequestError>({
    queryKey: queryKeys.participantLiveSessions.snapshot(id),
    queryFn: ({ signal }) =>
      apiRequest<ParticipantLiveSessionSnapshot>(
        `/live-sessions/${id}/snapshot`,
        {
          signal,
        },
      ),
    enabled: Boolean(id),
    retry: false,
    staleTime: 30_000,
  });
}

/** Fetch the participant-safe learner snapshot for one live session. */
export function useParticipantSnapshot(id: string) {
  return useQuery<ParticipantLiveSessionSnapshot, ApiRequestError>({
    ...participantSnapshotQueryOptions(id),
  });
}

/**
 * Query options for the student-only lifecycle receipt — `GET
 * /live-sessions/:id/student-status`. Returns HTTP 200 for all four lifecycle
 * states (`waiting | active | closed | cancelled`), so a learner can observe a
 * terminal session even after archive anonymization. Cookie GET, `retry:
 * false`, disabled when the id is empty.
 */
export function studentStatusQueryOptions(id: string) {
  return queryOptions<StudentLiveSessionStatus, ApiRequestError>({
    queryKey: queryKeys.participantLiveSessions.studentStatus(id),
    queryFn: ({ signal }) =>
      apiRequest<StudentLiveSessionStatus>(
        `/live-sessions/${id}/student-status`,
        {
          signal,
        },
      ),
    enabled: Boolean(id),
    retry: false,
    staleTime: 30_000,
  });
}

/** Fetch the student-only lifecycle receipt for one live session. */
export function useStudentStatus(id: string) {
  return useQuery<StudentLiveSessionStatus, ApiRequestError>({
    ...studentStatusQueryOptions(id),
  });
}

/** Participant-safe per-question results; caller controls when results are enabled. */
export function participantResultsQueryOptions(
  liveSessionId: string,
  sessionQuestionId: string,
  enabled = false,
) {
  return queryOptions<SessionQuestionResults, ApiRequestError>({
    queryKey: queryKeys.participantLiveSessions.results(
      liveSessionId,
      sessionQuestionId,
    ),
    queryFn: ({ signal }) =>
      apiRequest<SessionQuestionResults>(
        `/live-sessions/${liveSessionId}/questions/${sessionQuestionId}/results`,
        { signal },
      ),
    enabled: Boolean(liveSessionId && sessionQuestionId && enabled),
    retry: false,
    staleTime: 30_000,
  });
}

export function useParticipantResults(
  liveSessionId: string,
  sessionQuestionId: string,
  enabled = false,
) {
  return useQuery<SessionQuestionResults, ApiRequestError>({
    ...participantResultsQueryOptions(
      liveSessionId,
      sessionQuestionId,
      enabled,
    ),
  });
}
