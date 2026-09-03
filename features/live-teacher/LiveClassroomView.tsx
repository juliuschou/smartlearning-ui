"use client";

import { ErrorAlert } from "@/components/ui/ErrorAlert";
import { ApiRequestError } from "@/lib/api/client";
import { useLiveSession } from "@/lib/api/live-sessions";
import type { LiveSessionStatus } from "@/lib/api/types";
import { useLiveConnection } from "@/lib/live/socket-client";
import { useLiveSessionEvents } from "@/lib/live/use-live-session-events";
import { CloseCancelDialog } from "@/features/live-teacher/CloseCancelDialog";
import { QuestionQueue } from "@/features/live-teacher/QuestionQueue";
import { ResultPanel } from "@/features/live-teacher/ResultPanel";

const STATUS_LABELS: Record<LiveSessionStatus, string> = {
  waiting: "等待開始",
  active: "進行中",
  closed: "已結束",
  cancelled: "已取消",
};

/**
 * Teacher live-classroom dashboard (FE-3.3).
 *
 * Drives off the authoritative `GET /live-sessions/:id` detail via `useLiveSession`,
 * wired to the `/live` realtime adapter (`useLiveConnection` + `useLiveSessionEvents`)
 * so events invalidate/seed the authoritative REST caches. There is no session-list
 * endpoint, so the classroom is reached by deep link to `/live/:liveSessionId`.
 */
export function LiveClassroomView({
  liveSessionId,
}: {
  liveSessionId: string;
}) {
  const { data: session, error, isLoading } = useLiveSession(liveSessionId);
  const connection = useLiveConnection(liveSessionId);
  useLiveSessionEvents(liveSessionId, connection);

  if (isLoading) {
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

  if (error instanceof ApiRequestError && error.status === 404) {
    return (
      <section
        role="alert"
        aria-labelledby="live-session-not-found-heading"
        className="rounded-md border border-zinc-200 px-4 py-4 dark:border-zinc-800"
      >
        <h2 id="live-session-not-found-heading" className="font-semibold">
          找不到這堂課
        </h2>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          請確認連結仍然有效。
        </p>
      </section>
    );
  }

  if (error) {
    return (
      <ErrorAlert
        error={
          error instanceof ApiRequestError ? error : { code: "INTERNAL_ERROR" }
        }
        id="live-classroom-detail-error"
      />
    );
  }

  if (!session) {
    return (
      <ErrorAlert
        error={{ code: "INTERNAL_ERROR" }}
        id="live-classroom-detail-error"
      />
    );
  }

  const connectionError =
    connection.errorCode && connection.errorCode !== "CONNECTION_FAILED"
      ? connection.errorCode
      : null;

  return (
    <section className="space-y-6" aria-labelledby="live-classroom-heading">
      {/* Session control (FE-3.3.1) */}
      <div className="rounded-md border border-zinc-200 px-4 py-4 dark:border-zinc-800">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2
            id="live-classroom-heading"
            className="text-lg font-semibold tracking-tight"
          >
            {STATUS_LABELS[session.status]}
          </h2>
          <span className="rounded-md border border-zinc-300 px-3 py-1 text-sm font-medium tracking-wide dark:border-zinc-700">
            {connection.status === "connected"
              ? `課堂代碼 ${session.sessionCode}・連線中`
              : connection.status === "connecting"
                ? `課堂代碼 ${session.sessionCode}・連線中…`
                : connection.status === "error"
                  ? "即時連線中斷"
                  : `課堂代碼 ${session.sessionCode}・未連線`}
          </span>
        </div>

        {connectionError ? (
          <div className="mt-3">
            <ErrorAlert
              error={{ code: connectionError }}
              id="live-connection-error"
            />
          </div>
        ) : null}

        <div className="mt-4">
          <CloseCancelDialog
            liveSessionId={liveSessionId}
            status={session.status}
          />
        </div>
      </div>

      {/* Joined/voted indicators (FE-3.3.4) */}
      <dl className="grid gap-4 rounded-md border border-zinc-200 p-4 text-sm dark:border-zinc-800 sm:grid-cols-2">
        <div>
          <dt className="text-zinc-500 dark:text-zinc-400">已加入人數</dt>
          <dd className="mt-1 text-lg font-semibold">
            {session.joinedCount ?? 0}
          </dd>
        </div>
        <div>
          <dt className="text-zinc-500 dark:text-zinc-400">已作答人數</dt>
          <dd className="mt-1 text-lg font-semibold">
            {session.votedCount ?? 0}
          </dd>
        </div>
      </dl>

      {/* Question queue + open/close (FE-3.3.2 / FE-3.3.3) */}
      <section aria-labelledby="question-queue-heading">
        <h3 id="question-queue-heading" className="text-sm font-semibold">
          題目
        </h3>
        <div className="mt-3">
          <QuestionQueue
            liveSessionId={liveSessionId}
            questions={session.sessionQuestions}
          />
        </div>
      </section>

      {/* Per-question result dashboard (FE-3.3.5) */}
      {session.sessionQuestions.some((q) => q.status === "closed") ? (
        <section aria-labelledby="result-dashboard-heading">
          <h3 id="result-dashboard-heading" className="text-sm font-semibold">
            結果
          </h3>
          <div className="mt-3 space-y-4">
            {session.sessionQuestions
              .filter((q) => q.status === "closed")
              .map((q) => (
                <div
                  key={q.id}
                  className="rounded-md border border-zinc-200 px-4 py-3 dark:border-zinc-800"
                >
                  <p className="text-sm font-medium">{q.snapshotPrompt}</p>
                  <div className="mt-3">
                    <ResultPanel
                      liveSessionId={liveSessionId}
                      sessionQuestionId={q.id}
                    />
                  </div>
                </div>
              ))}
          </div>
        </section>
      ) : null}
    </section>
  );
}
