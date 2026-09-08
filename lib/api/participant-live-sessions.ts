import { queryOptions, useMutation, useQuery } from "@tanstack/react-query";
import {
  apiRequest,
  apiRequestWithStatus,
  ApiRequestError,
} from "@/lib/api/client";
import { queryKeys } from "@/lib/api/query-keys";
import {
  getAnonymousParticipantCredential,
  persistAnonymousParticipantCredential,
  type AnonymousParticipantJoinReceipt,
} from "@/lib/live/anonymous-participant-credential";
import type {
  CreateSubmissionPayload,
  JoinLiveSessionResponse,
  ParticipantLiveSessionSnapshot,
  StudentLiveSessionStatus,
  SubmissionDto,
  ParticipantActor,
  SessionQuestionResults,
} from "@/lib/api/types";

const STUDENT_ACTOR: ParticipantActor = { kind: "student" };

function anonymousAuth(
  actor: Extract<ParticipantActor, { kind: "anonymous" }>,
) {
  const credential = getAnonymousParticipantCredential(actor.liveSessionId);
  if (!credential || credential.sessionCode !== actor.sessionCode) {
    throw new ApiRequestError(
      {
        code: "ANONYMOUS_CREDENTIAL_MISSING",
        message: "匿名參與憑證不存在。",
        blocking: true,
      },
      0,
    );
  }
  return {
    kind: "anonymous-participant" as const,
    participantToken: credential.participantToken,
  };
}

function participantAuth(actor: ParticipantActor) {
  return actor.kind === "anonymous"
    ? anonymousAuth(actor)
    : { kind: "session" as const };
}

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
export interface AnonymousJoinVariables {
  sessionCode: string;
  displayName: string;
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-7][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function validateAnonymousJoinResponse(
  response: JoinLiveSessionResponse,
): AnonymousParticipantJoinReceipt {
  if (
    !UUID_PATTERN.test(response.liveSession.id) ||
    typeof response.liveSession.sessionCode !== "string" ||
    response.liveSession.sessionCode.trim().length === 0 ||
    typeof response.participantToken !== "string" ||
    response.participantToken.trim().length === 0
  ) {
    throw new ApiRequestError(
      {
        code: "INTERNAL_ERROR",
        message: "伺服器回應格式錯誤。",
        blocking: true,
      },
      0,
    );
  }

  const receipt = persistAnonymousParticipantCredential({
    liveSessionId: response.liveSession.id,
    sessionCode: response.liveSession.sessionCode,
    participantToken: response.participantToken,
  });
  if (!receipt) {
    throw new ApiRequestError(
      {
        code: "STORAGE_UNAVAILABLE",
        message: "無法保存匿名參與憑證。",
        blocking: true,
      },
      0,
    );
  }
  return receipt;
}

/** Join a live session anonymously and return only a token-free receipt. */
export function useJoinAnonymousLiveSession() {
  return useMutation<
    AnonymousParticipantJoinReceipt,
    ApiRequestError,
    AnonymousJoinVariables
  >({
    mutationFn: async ({ sessionCode, displayName }) => {
      const response = await apiRequestWithStatus<JoinLiveSessionResponse>(
        `/live-sessions/${encodeSessionCodePath(sessionCode)}/join`,
        {
          method: "POST",
          body: { displayName },
          mutate: true,
          auth: { kind: "anonymous-join" },
        },
      );
      if (response.status !== 201) {
        throw new ApiRequestError(
          {
            code: "INTERNAL_ERROR",
            message: "伺服器回應格式錯誤。",
            blocking: true,
          },
          response.status,
        );
      }
      return validateAnonymousJoinResponse(response.data);
    },
    retry: false,
  });
}

export interface SubmitPollSingleVariables {
  liveSessionId: string;
  sessionQuestionId: string;
  optionId: string;
  idempotencyKey: string;
  actor?: ParticipantActor;
}

export interface SubmitPollMultipleVariables {
  liveSessionId: string;
  sessionQuestionId: string;
  optionIds: [string, ...string[]];
  idempotencyKey: string;
  actor?: ParticipantActor;
}

export interface SubmitQuizVariables {
  liveSessionId: string;
  sessionQuestionId: string;
  selectedOptionIds: [string, ...string[]];
  idempotencyKey: string;
  actor?: ParticipantActor;
}

export interface SubmitOpenTextVariables {
  liveSessionId: string;
  sessionQuestionId: string;
  textAnswer: string;
  idempotencyKey: string;
  actor?: ParticipantActor;
}

async function submitParticipantAnswer<T>(
  path: string,
  body: CreateSubmissionPayload,
  idempotencyKey: string,
  actor: ParticipantActor,
) {
  try {
    return await apiRequestWithStatus<T>(path, {
      method: "POST",
      body,
      mutate: true,
      idempotencyKey,
      auth: participantAuth(actor),
    });
  } catch (error) {
    if (
      error instanceof ApiRequestError &&
      error.status === 409 &&
      error.code === "CONFLICT"
    ) {
      throw new ApiRequestError(
        {
          code: "SUBMISSION_CONFLICT",
          message: error.message,
          field: error.field,
          blocking: true,
          retryAfterSeconds: error.retryAfterSeconds,
        },
        error.status,
      );
    }
    throw error;
  }
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
      actor = STUDENT_ACTOR,
    }) =>
      submitParticipantAnswer<SubmissionDto>(
        `/live-sessions/${liveSessionId}/submissions`,
        {
          sessionQuestionId,
          selectedOptionRefs: [optionId],
        } satisfies CreateSubmissionPayload,
        idempotencyKey,
        actor,
      ),
    retry: false,
  });
}

/** Submit a non-empty set of formal option UUIDs; retries are caller-controlled. */
export function useSubmitPollMultiple() {
  return useMutation<
    { data: SubmissionDto; status: number },
    ApiRequestError,
    SubmitPollMultipleVariables
  >({
    mutationFn: ({
      liveSessionId,
      sessionQuestionId,
      optionIds,
      idempotencyKey,
      actor = STUDENT_ACTOR,
    }) =>
      submitParticipantAnswer<SubmissionDto>(
        `/live-sessions/${liveSessionId}/submissions`,
        {
          sessionQuestionId,
          selectedOptionRefs: optionIds,
        } satisfies CreateSubmissionPayload,
        idempotencyKey,
        actor,
      ),
    retry: false,
  });
}

/**
 * FE-5.2 — submit a quiz answer as a non-empty exact set of formal option
 * UUIDs. The quiz answer contract is exact-set semantics mirroring
 * poll-multiple (order-insensitive fingerprint on the backend), so the
 * transport reuses the same `POST /live-sessions/:id/submissions` endpoint,
 * idempotency key, and participant auth path. Retries are caller-controlled.
 */
/** Submit normalized open-text content; retries are caller-controlled. */
export function useSubmitOpenText() {
  return useMutation<
    { data: SubmissionDto; status: number },
    ApiRequestError,
    SubmitOpenTextVariables
  >({
    mutationFn: ({
      liveSessionId,
      sessionQuestionId,
      textAnswer,
      idempotencyKey,
      actor = STUDENT_ACTOR,
    }) =>
      submitParticipantAnswer<SubmissionDto>(
        `/live-sessions/${liveSessionId}/submissions`,
        {
          sessionQuestionId,
          textAnswer,
        } satisfies CreateSubmissionPayload,
        idempotencyKey,
        actor,
      ),
    retry: false,
  });
}

export function useSubmitQuiz() {
  return useMutation<
    { data: SubmissionDto; status: number },
    ApiRequestError,
    SubmitQuizVariables
  >({
    mutationFn: ({
      liveSessionId,
      sessionQuestionId,
      selectedOptionIds,
      idempotencyKey,
      actor = STUDENT_ACTOR,
    }) =>
      submitParticipantAnswer<SubmissionDto>(
        `/live-sessions/${liveSessionId}/submissions`,
        {
          sessionQuestionId,
          selectedOptionRefs: selectedOptionIds,
        } satisfies CreateSubmissionPayload,
        idempotencyKey,
        actor,
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
    mutationFn: async ({ sessionCode }) => {
      const response = await apiRequest<JoinLiveSessionResponse>(
        `/live-sessions/${encodeSessionCodePath(sessionCode)}/join`,
        { method: "POST", body: {}, mutate: true, auth: { kind: "session" } },
      );
      if (response.participantToken !== null) {
        throw new ApiRequestError(
          {
            code: "INTERNAL_ERROR",
            message: "伺服器回應格式錯誤。",
            blocking: true,
          },
          0,
        );
      }
      return response;
    },
  });
}

/**
 * Query options for the participant-safe learner snapshot — `GET
 * /live-sessions/:id/snapshot`. Cookie GET (no CSRF), forwards the abort
 * signal, `retry: false`, and is disabled when the id is empty. Uses the
 * participant-specific query key so it can never collide with the teacher
 * detail projection.
 */
export function participantSnapshotQueryOptions(
  id: string,
  actor: ParticipantActor = STUDENT_ACTOR,
) {
  return queryOptions<ParticipantLiveSessionSnapshot, ApiRequestError>({
    queryKey: queryKeys.participantLiveSessions.snapshot(actor.kind, id),
    queryFn: ({ signal }) =>
      apiRequest<ParticipantLiveSessionSnapshot>(
        `/live-sessions/${id}/snapshot`,
        {
          signal,
          ...(actor.kind === "anonymous"
            ? { auth: participantAuth(actor) }
            : {}),
        },
      ),
    enabled:
      Boolean(id) &&
      (actor.kind === "student" ||
        Boolean(actor.liveSessionId && actor.sessionCode)),
    retry: false,
    staleTime: 30_000,
  });
}

/** Fetch the participant-safe learner snapshot for one live session. */
export function useParticipantSnapshot(
  id: string,
  actor: ParticipantActor = STUDENT_ACTOR,
) {
  return useQuery<ParticipantLiveSessionSnapshot, ApiRequestError>({
    ...participantSnapshotQueryOptions(id, actor),
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
  actor: ParticipantActor = STUDENT_ACTOR,
) {
  return queryOptions<SessionQuestionResults, ApiRequestError>({
    queryKey: queryKeys.participantLiveSessions.results(
      actor.kind,
      liveSessionId,
      sessionQuestionId,
    ),
    queryFn: ({ signal }) =>
      apiRequest<SessionQuestionResults>(
        `/live-sessions/${liveSessionId}/questions/${sessionQuestionId}/results`,
        { signal, auth: participantAuth(actor) },
      ),
    enabled: Boolean(
      liveSessionId &&
      sessionQuestionId &&
      enabled &&
      (actor.kind === "student" ||
        Boolean(actor.liveSessionId && actor.sessionCode)),
    ),
    retry: false,
    staleTime: 30_000,
  });
}

export function useParticipantResults(
  liveSessionId: string,
  sessionQuestionId: string,
  enabled = false,
  actor: ParticipantActor = STUDENT_ACTOR,
) {
  return useQuery<SessionQuestionResults, ApiRequestError>({
    ...participantResultsQueryOptions(
      liveSessionId,
      sessionQuestionId,
      enabled,
      actor,
    ),
  });
}
