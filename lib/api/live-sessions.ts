import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { apiRequest, type ApiRequestError } from "@/lib/api/client";
import { queryKeys } from "@/lib/api/query-keys";
import type {
  CreateLiveSessionPayload,
  LiveSession,
  SessionQuestion,
  SessionQuestionResults,
} from "@/lib/api/types";

/**
 * Teacher live-classroom transport (FE-3.1).
 *
 * Backend contract is frozen (BE-3): all mutations return 201 (classify by
 * envelope `data`, not status); there is no session-list endpoint, only
 * `GET /live-sessions/:id` detail. `joinedCount`/`votedCount` ride on the same
 * detail endpoint, so the counts are covered by `useLiveSession`.
 */

/** Query options for the teacher detail projection of one live session. */
export function liveSessionQueryOptions(id: string) {
  return queryOptions<LiveSession, ApiRequestError>({
    queryKey: queryKeys.liveSessions.detail(id),
    queryFn: ({ signal }) =>
      apiRequest<LiveSession>(`/live-sessions/${id}`, { signal }),
    enabled: Boolean(id),
    retry: false,
    staleTime: 30_000,
  });
}

/**
 * Fetch one server-authoritative LiveSession detail projection (includes
 * `joinedCount`/`votedCount`). Guard: Session + TeacherOrAdminGuard, so the
 * endpoint 403s for non-teacher/admin sessions.
 */
export function useLiveSession(id: string) {
  return useQuery<LiveSession, ApiRequestError>({
    ...liveSessionQueryOptions(id),
  });
}

/**
 * Query options for the per-question results projection of one session
 * question. Discriminated by `snapshotType` (poll / quiz / open_text).
 */
export function sessionQuestionResultsQueryOptions(
  id: string,
  sessionQuestionId: string,
) {
  return queryOptions<SessionQuestionResults, ApiRequestError>({
    queryKey: queryKeys.liveSessions.results(id, sessionQuestionId),
    queryFn: ({ signal }) =>
      apiRequest<SessionQuestionResults>(
        `/live-sessions/${id}/questions/${sessionQuestionId}/results`,
        { signal },
      ),
    enabled: Boolean(id) && Boolean(sessionQuestionId),
    retry: false,
    staleTime: 30_000,
  });
}

/**
 * Fetch the anonymous per-question results projection for a teacher/admin
 * session. Guard: ParticipantOrSessionGuard — a teacher/admin Web session sees
 * the aggregate at any time; quiz correctness is always revealed to the
 * teacher. There is no session-wide overview endpoint, so callers aggregate
 * per question (FE-3.3).
 */
export function useSessionQuestionResults(
  id: string,
  sessionQuestionId: string,
) {
  return useQuery<SessionQuestionResults, ApiRequestError>({
    ...sessionQuestionResultsQueryOptions(id, sessionQuestionId),
  });
}

// ---------------------------------------------------------------------------
// Lifecycle + open/close question mutations (CP2).
//
// All mutations return 201 (classify by envelope `data`, not status). Session
// lifecycle mutations return a fresh `LiveSessionDto`; open/close question
// mutations return a fresh `SessionQuestionDto`. Each success invalidates the
// affected session detail cache (awaited, per the FE-2.1 review-hardening
// convention) so the next read reflects the server-authoritative state.
// ---------------------------------------------------------------------------

/** Variables for a session lifecycle mutation (start / close / cancel). */
export interface LiveSessionIdVariables {
  liveSessionId: string;
}

/** Variables for an open/close question mutation. */
export interface SessionQuestionVariables {
  liveSessionId: string;
  sessionQuestionId: string;
}

async function invalidateLiveSessionDetail(
  queryClient: ReturnType<typeof useQueryClient>,
  liveSessionId: string,
): Promise<void> {
  await queryClient.invalidateQueries({
    queryKey: queryKeys.liveSessions.detail(liveSessionId),
  });
}

/** Create a live session from a course and an ordered question selection. */
export function useCreateLiveSession() {
  const queryClient = useQueryClient();
  return useMutation<LiveSession, ApiRequestError, CreateLiveSessionPayload>({
    mutationFn: ({ courseId, questionIds }) =>
      apiRequest<LiveSession>("/live-sessions", {
        method: "POST",
        body: { courseId, questionIds },
        mutate: true,
      }),
    onSuccess: async (session) => {
      await invalidateLiveSessionDetail(queryClient, session.id);
    },
  });
}

/** Start a live session (waiting → active). */
export function useStartLiveSession() {
  const queryClient = useQueryClient();
  return useMutation<LiveSession, ApiRequestError, LiveSessionIdVariables>({
    mutationFn: ({ liveSessionId }) =>
      apiRequest<LiveSession>(`/live-sessions/${liveSessionId}/start`, {
        method: "POST",
        mutate: true,
      }),
    onSuccess: async (session) => {
      await invalidateLiveSessionDetail(queryClient, session.id);
    },
  });
}

/** Close a live session (active → closed). */
export function useCloseLiveSession() {
  const queryClient = useQueryClient();
  return useMutation<LiveSession, ApiRequestError, LiveSessionIdVariables>({
    mutationFn: ({ liveSessionId }) =>
      apiRequest<LiveSession>(`/live-sessions/${liveSessionId}/close`, {
        method: "POST",
        mutate: true,
      }),
    onSuccess: async (session) => {
      await invalidateLiveSessionDetail(queryClient, session.id);
    },
  });
}

/** Cancel a live session (waiting/active → cancelled). */
export function useCancelLiveSession() {
  const queryClient = useQueryClient();
  return useMutation<LiveSession, ApiRequestError, LiveSessionIdVariables>({
    mutationFn: ({ liveSessionId }) =>
      apiRequest<LiveSession>(`/live-sessions/${liveSessionId}/cancel`, {
        method: "POST",
        mutate: true,
      }),
    onSuccess: async (session) => {
      await invalidateLiveSessionDetail(queryClient, session.id);
    },
  });
}

/** Open a session question for answering (not_open → open). */
export function useOpenSessionQuestion() {
  const queryClient = useQueryClient();
  return useMutation<
    SessionQuestion,
    ApiRequestError,
    SessionQuestionVariables
  >({
    mutationFn: ({ liveSessionId, sessionQuestionId }) =>
      apiRequest<SessionQuestion>(
        `/live-sessions/${liveSessionId}/questions/${sessionQuestionId}/open`,
        { method: "POST", mutate: true },
      ),
    onSuccess: async (_question, variables) => {
      await invalidateLiveSessionDetail(queryClient, variables.liveSessionId);
    },
  });
}

/** Close a session question (open → closed). */
export function useCloseSessionQuestion() {
  const queryClient = useQueryClient();
  return useMutation<
    SessionQuestion,
    ApiRequestError,
    SessionQuestionVariables
  >({
    mutationFn: ({ liveSessionId, sessionQuestionId }) =>
      apiRequest<SessionQuestion>(
        `/live-sessions/${liveSessionId}/questions/${sessionQuestionId}/close`,
        { method: "POST", mutate: true },
      ),
    onSuccess: async (_question, variables) => {
      await invalidateLiveSessionDetail(queryClient, variables.liveSessionId);
    },
  });
}
