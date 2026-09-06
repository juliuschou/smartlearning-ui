"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/api/query-keys";
import { ErrorAlert } from "@/components/ui/ErrorAlert";
import { PollSingleQuestion } from "@/features/live-student/PollSingleQuestion";
import { PollMultipleQuestion } from "@/features/live-student/PollMultipleQuestion";
import { ApiRequestError } from "@/lib/api/client";
import {
  useParticipantSnapshot,
  useStudentStatus,
} from "@/lib/api/participant-live-sessions";
import { removeAnonymousParticipantCredential } from "@/lib/live/anonymous-participant-credential";
import { useLiveConnection } from "@/lib/live/socket-client";
import { useParticipantLiveSessionEvents } from "@/lib/live/use-participant-live-session-events";
import {
  isLearnerAccessError,
  LearnerAccessState,
} from "@/features/live-student/LearnerAccessState";
import type {
  LiveSessionStatus,
  ParticipantLiveSessionSnapshot,
  ParticipantActor,
  SessionQuestion,
} from "@/lib/api/types";

const STATUS_LABELS: Record<LiveSessionStatus, string> = {
  waiting: "等待開始",
  active: "進行中",
  closed: "已結束",
  cancelled: "已取消",
};

/**
 * Learner live-session view (FE-4.1 CP3).
 *
 * Renders strictly from the participant-safe snapshot (`useParticipantSnapshot`),
 * never from the teacher detail projection. Because the snapshot endpoint returns
 * `409 SESSION_NOT_JOINABLE` for terminal sessions, a terminal snapshot falls back
 * to the student-only lifecycle receipt (`useStudentStatus`) to distinguish
 * `closed` from `cancelled` — the CP0-confirmed learner terminal-state source.
 *
 * FE-4.3 realtime events drive lifecycle and question transitions without a
 * manual refresh. The explicit refresh remains a recovery affordance, and no
 * teacher-only data (counts, controls, unrevealed correctness) is ever rendered.
 */
export function LearnerLiveSessionView({
  liveSessionId,
  actor = { kind: "student" },
}: {
  liveSessionId: string;
  actor?: ParticipantActor;
}) {
  const queryClient = useQueryClient();
  const [retainedQuestion, setRetainedQuestion] =
    useState<SessionQuestion | null>(null);
  const [sessionClosed, setSessionClosed] = useState(false);
  const snapshot = useParticipantSnapshot(liveSessionId, actor);
  const connection = useLiveConnection(liveSessionId, actor);
  const handleSessionClosed = useCallback(() => {
    setSessionClosed(true);
    connection.terminate();
  }, [connection]);
  const clearProtectedContent = useCallback(() => {
    queryClient.removeQueries({
      queryKey: queryKeys.participantLiveSessions.session(
        actor.kind,
        liveSessionId,
      ),
    });
    queryClient.removeQueries({
      queryKey: queryKeys.participantLiveSessions.snapshot(
        actor.kind,
        liveSessionId,
      ),
    });
    if (actor.kind === "anonymous") {
      removeAnonymousParticipantCredential(liveSessionId);
    }
    setRetainedQuestion(null);
    connection.terminate();
  }, [actor.kind, connection, liveSessionId, queryClient]);
  useParticipantLiveSessionEvents(
    liveSessionId,
    connection,
    clearProtectedContent,
    actor,
    handleSessionClosed,
  );
  useEffect(() => {
    const submittedQuestion = snapshot.data?.sessionQuestions.find(
      (question) => question.hasSubmitted === true,
    );
    if (submittedQuestion) {
      queueMicrotask(() => setRetainedQuestion(submittedQuestion));
    }
    if (snapshot.data && snapshot.data.id !== liveSessionId) {
      queueMicrotask(() => setRetainedQuestion(null));
    }
  }, [liveSessionId, snapshot.data]);
  const isTerminal =
    snapshot.error instanceof ApiRequestError &&
    snapshot.error.code === "SESSION_NOT_JOINABLE";
  // Enabled only when the snapshot reports a terminal session; otherwise the
  // empty id keeps the query disabled so no extra request is made.
  const status = useStudentStatus(
    actor.kind === "student" && isTerminal ? liveSessionId : "",
  );
  useEffect(() => {
    const error = snapshot.error ?? status.error;
    if (error instanceof ApiRequestError && isLearnerAccessError(error)) {
      queueMicrotask(clearProtectedContent);
    }
  }, [clearProtectedContent, snapshot.error, status.error]);

  if (snapshot.isLoading) {
    return (
      <>
        <ConnectionNotice status={connection.status} />
        <LoadingState />
      </>
    );
  }

  if (sessionClosed) {
    return (
      <>
        <TerminalState
          status="closed"
          onRefresh={() => void snapshot.refetch()}
          {...(actor.kind === "anonymous"
            ? { returnHref: "/join", returnLabel: "返回加入課堂" }
            : {})}
        />
        {retainedQuestion ? (
          <QuestionRenderer
            question={{ ...retainedQuestion, status: "closed" }}
            actor={actor}
            onAccessLoss={clearProtectedContent}
          />
        ) : null}
      </>
    );
  }

  // Terminal session: the snapshot rejects with SESSION_NOT_JOINABLE; use the
  // student-status receipt to render the exact terminal state.
  if (isTerminal && actor.kind === "anonymous") {
    return <AnonymousEndedState onRejoin={clearProtectedContent} />;
  }

  if (isTerminal) {
    if (status.isLoading) return <LoadingState />;
    if (status.error) {
      // Access loss on the lifecycle receipt (enrollment removed, disabled,
      // expired, etc.) gets the specialized access state, not a generic alert.
      if (status.error instanceof ApiRequestError) {
        if (isLearnerAccessError(status.error)) {
          return (
            <LearnerAccessState
              error={status.error}
              id="learner-status-error"
            />
          );
        }
        return <ErrorAlert error={status.error} id="learner-status-error" />;
      }
      return (
        <ErrorAlert
          error={{ code: "INTERNAL_ERROR" }}
          id="learner-status-error"
        />
      );
    }
    if (status.data) {
      const terminalStatus = status.data.status;
      // The snapshot rejected as terminal, so the receipt must be `closed` or
      // `cancelled`. Any other value is a contract violation — fail closed
      // rather than render a wrong state.
      if (terminalStatus === "closed" || terminalStatus === "cancelled") {
        return (
          <>
            <TerminalState
              status={terminalStatus}
              onRefresh={() => {
                void snapshot.refetch();
                void status.refetch();
              }}
            />
            {retainedQuestion ? (
              <QuestionRenderer
                question={{ ...retainedQuestion, status: "closed" }}
                actor={actor}
                onAccessLoss={clearProtectedContent}
              />
            ) : null}
          </>
        );
      }
      return (
        <ErrorAlert
          error={{ code: "INTERNAL_ERROR" }}
          id="learner-status-error"
        />
      );
    }
  }

  if (snapshot.error) {
    if (actor.kind === "anonymous") {
      if (snapshot.error.code === "ANONYMOUS_CREDENTIAL_MISSING") {
        return <AnonymousCredentialState />;
      }
      if (
        snapshot.error.code === "UNAUTHORIZED" ||
        snapshot.error.code === "SESSION_NOT_JOINABLE"
      ) {
        return <AnonymousEndedState onRejoin={clearProtectedContent} />;
      }
    }
    if (snapshot.error.status === 404) {
      return <NotFoundState />;
    }
    // Access loss (not enrolled, removed, wrong role, disabled, expired) gets
    // the specialized access state. Expired/missing sessions redirect to login.
    if (isLearnerAccessError(snapshot.error)) {
      return (
        <LearnerAccessState
          error={snapshot.error}
          id="learner-snapshot-error"
        />
      );
    }
    return <ErrorAlert error={snapshot.error} id="learner-snapshot-error" />;
  }

  if (snapshot.data) {
    return (
      <LiveState
        snapshot={snapshot.data}
        actor={actor}
        connectionStatus={connection.status}
        onAccessLoss={clearProtectedContent}
        onRefresh={() => void snapshot.refetch()}
      />
    );
  }

  return (
    <ErrorAlert
      error={{ code: "INTERNAL_ERROR" }}
      id="learner-snapshot-error"
    />
  );
}

/** Waiting / active learner states, driven by `snapshot.status` (not the question array). */
function LiveState({
  snapshot,
  actor,
  connectionStatus,
  onAccessLoss,
  onRefresh,
}: {
  snapshot: ParticipantLiveSessionSnapshot;
  actor: ParticipantActor;
  connectionStatus: import("@/lib/live/socket-client").LiveConnectionStatus;
  onAccessLoss: () => void;
  onRefresh: () => void;
}) {
  const openQuestions = snapshot.sessionQuestions;
  return (
    <>
      <ConnectionNotice status={connectionStatus} />
      <section className="space-y-6" aria-labelledby="learner-session-heading">
        <div className="rounded-md border border-zinc-200 px-4 py-4 dark:border-zinc-800">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2
              id="learner-session-heading"
              className="text-lg font-semibold tracking-tight"
            >
              {STATUS_LABELS[snapshot.status]}
            </h2>
            <span className="flex items-center gap-1 rounded-md border border-zinc-300 px-3 py-1 text-sm font-medium tracking-wide dark:border-zinc-700">
              課堂代碼
              <span className="font-semibold tracking-widest">
                {snapshot.sessionCode}
              </span>
            </span>
          </div>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            {snapshot.status === "waiting"
              ? "等待老師開始課堂。"
              : openQuestions.length === 0
                ? "等待老師開題。"
                : "請查看目前開放的題目。"}
          </p>
          <div className="mt-4">
            <RefreshButton onClick={onRefresh} />
          </div>
        </div>

        {snapshot.status === "active" && openQuestions.length > 0 ? (
          <section aria-labelledby="learner-open-questions-heading">
            <h3
              id="learner-open-questions-heading"
              className="text-sm font-semibold"
            >
              目前題目
            </h3>
            <div className="mt-3 space-y-4">
              {openQuestions.map((question) => (
                <OpenQuestion
                  key={question.id}
                  question={question}
                  actor={actor}
                  onAccessLoss={onAccessLoss}
                />
              ))}
            </div>
          </section>
        ) : null}
      </section>
    </>
  );
}

/** Participant-safe open question delegated to the poll-single renderer. */
function OpenQuestion({
  question,
  actor,
  onAccessLoss,
}: {
  question: SessionQuestion;
  actor: ParticipantActor;
  onAccessLoss: () => void;
}) {
  return (
    <QuestionRenderer
      question={question}
      actor={actor}
      onAccessLoss={onAccessLoss}
    />
  );
}

function QuestionRenderer({
  question,
  actor,
  onAccessLoss,
}: {
  question: SessionQuestion;
  actor: ParticipantActor;
  onAccessLoss: () => void;
}) {
  const props = {
    question,
    actor,
    onParticipantAccessLoss:
      actor.kind === "anonymous" ? onAccessLoss : undefined,
  };
  return question.snapshotSelectionMode === "multiple" ? (
    <PollMultipleQuestion {...props} />
  ) : (
    <PollSingleQuestion {...props} />
  );
}

/** Read-only terminal state (`closed` / `cancelled`) with a return-to-courses link. */
function TerminalState({
  status,
  onRefresh,
  returnHref = "/student",
  returnLabel = "返回我的課程",
}: {
  status: "closed" | "cancelled";
  onRefresh: () => void;
  returnHref?: string;
  returnLabel?: string;
}) {
  return (
    <section className="space-y-4" aria-labelledby="learner-terminal-heading">
      <div className="rounded-md border border-zinc-200 px-4 py-4 dark:border-zinc-800">
        <h2
          id="learner-terminal-heading"
          className="text-lg font-semibold tracking-tight"
        >
          {STATUS_LABELS[status]}
        </h2>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          {status === "closed"
            ? "課堂已結束，此頁面為唯讀。"
            : "此課堂已取消。"}
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Link
            href={returnHref}
            className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium transition hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 dark:border-zinc-700 dark:hover:bg-zinc-900"
          >
            {returnLabel}
          </Link>
          <RefreshButton onClick={onRefresh} />
        </div>
      </div>
    </section>
  );
}

function ConnectionNotice({
  status,
}: {
  status: import("@/lib/live/socket-client").LiveConnectionStatus;
}) {
  if (status === "connected" || status === "idle") return null;
  const text =
    status === "connecting"
      ? "正在同步課堂狀態…"
      : status === "disconnected"
        ? "連線中斷，保留目前安全資料。"
        : "即時連線暫時無法使用，請稍後再試。";
  return (
    <p
      aria-live="polite"
      className="mb-4 text-sm text-zinc-600 dark:text-zinc-400"
    >
      {text}
    </p>
  );
}

function RefreshButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium transition hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 dark:border-zinc-700 dark:hover:bg-zinc-900"
    >
      更新課堂狀態
    </button>
  );
}

function LoadingState() {
  return (
    <p
      role="status"
      aria-live="polite"
      className="text-sm text-zinc-600 dark:text-zinc-400"
    >
      載入課堂中…
    </p>
  );
}

function AnonymousCredentialState() {
  return (
    <section
      role="alert"
      className="space-y-3 rounded-md border border-zinc-200 px-4 py-4 dark:border-zinc-800"
    >
      <h2 className="font-semibold">匿名參與已失效</h2>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        找不到此裝置的參與憑證，請重新加入課堂。
      </p>
      <Link
        href="/join"
        className="inline-block rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium dark:border-zinc-700"
      >
        返回加入課堂
      </Link>
    </section>
  );
}

function AnonymousEndedState({ onRejoin }: { onRejoin: () => void }) {
  return (
    <section
      role="alert"
      className="space-y-3 rounded-md border border-zinc-200 px-4 py-4 dark:border-zinc-800"
    >
      <h2 className="font-semibold">已結束或無法使用</h2>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        這個匿名參與憑證已無法使用，請重新加入課堂。
      </p>
      <Link
        href="/join"
        onClick={onRejoin}
        className="inline-block rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium dark:border-zinc-700"
      >
        返回加入課堂
      </Link>
    </section>
  );
}

function NotFoundState() {
  return (
    <section
      role="alert"
      aria-labelledby="learner-not-found-heading"
      className="rounded-md border border-zinc-200 px-4 py-4 dark:border-zinc-800"
    >
      <h2 id="learner-not-found-heading" className="font-semibold">
        找不到這堂課
      </h2>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
        請確認連結仍然有效。
      </p>
    </section>
  );
}
