"use client";

import Link from "next/link";
import { ErrorAlert } from "@/components/ui/ErrorAlert";
import { ApiRequestError } from "@/lib/api/client";
import {
  useParticipantSnapshot,
  useStudentStatus,
} from "@/lib/api/participant-live-sessions";
import {
  isLearnerAccessError,
  LearnerAccessState,
} from "@/features/live-student/LearnerAccessState";
import type {
  LiveSessionStatus,
  ParticipantLiveSessionSnapshot,
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
 * Realtime is FE-4.3, so the only refresh is an explicit "更新課堂狀態" refetch —
 * no polling, no socket, and no realtime claim. No answering control is offered
 * (FE-4.2), and no teacher-only data (counts, controls, unrevealed correctness)
 * is ever rendered.
 */
export function LearnerLiveSessionView({
  liveSessionId,
}: {
  liveSessionId: string;
}) {
  const snapshot = useParticipantSnapshot(liveSessionId);
  const isTerminal =
    snapshot.error instanceof ApiRequestError &&
    snapshot.error.code === "SESSION_NOT_JOINABLE";
  // Enabled only when the snapshot reports a terminal session; otherwise the
  // empty id keeps the query disabled so no extra request is made.
  const status = useStudentStatus(isTerminal ? liveSessionId : "");

  if (snapshot.isLoading) {
    return <LoadingState />;
  }

  // Terminal session: the snapshot rejects with SESSION_NOT_JOINABLE; use the
  // student-status receipt to render the exact terminal state.
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
          <TerminalState
            status={terminalStatus}
            onRefresh={() => {
              void snapshot.refetch();
              void status.refetch();
            }}
          />
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
  onRefresh,
}: {
  snapshot: ParticipantLiveSessionSnapshot;
  onRefresh: () => void;
}) {
  const openQuestions = snapshot.sessionQuestions;
  return (
    <section className="space-y-6" aria-labelledby="learner-session-heading">
      <div className="rounded-md border border-zinc-200 px-4 py-4 dark:border-zinc-800">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2
            id="learner-session-heading"
            className="text-lg font-semibold tracking-tight"
          >
            {STATUS_LABELS[snapshot.status]}
          </h2>
          <span className="rounded-md border border-zinc-300 px-3 py-1 text-sm font-medium tracking-wide dark:border-zinc-700">
            課堂代碼 {snapshot.sessionCode}
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
              <OpenQuestion key={question.id} question={question} />
            ))}
          </div>
        </section>
      ) : null}
    </section>
  );
}

/** Participant-safe open question: prompt + options + hasSubmitted, no answering control. */
function OpenQuestion({ question }: { question: SessionQuestion }) {
  return (
    <div className="rounded-md border border-zinc-200 px-4 py-3 dark:border-zinc-800">
      <p className="text-sm font-medium">{question.snapshotPrompt}</p>
      <ul className="mt-3 space-y-2">
        {question.options.map((option) => (
          <li
            key={option.id}
            className="rounded-md border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-800"
          >
            {option.text}
          </li>
        ))}
      </ul>
      <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
        {question.hasSubmitted ? "你已作答。" : "尚未作答。"}
      </p>
    </div>
  );
}

/** Read-only terminal state (`closed` / `cancelled`) with a return-to-courses link. */
function TerminalState({
  status,
  onRefresh,
}: {
  status: "closed" | "cancelled";
  onRefresh: () => void;
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
            href="/student"
            className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium transition hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 dark:border-zinc-700 dark:hover:bg-zinc-900"
          >
            返回我的課程
          </Link>
          <RefreshButton onClick={onRefresh} />
        </div>
      </div>
    </section>
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
