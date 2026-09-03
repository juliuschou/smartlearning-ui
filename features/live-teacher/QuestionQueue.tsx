"use client";

import {
  useOpenSessionQuestion,
  useCloseSessionQuestion,
} from "@/lib/api/live-sessions";
import type { SessionQuestion } from "@/lib/api/types";

const STATUS_LABELS: Record<SessionQuestion["status"], string> = {
  not_open: "未開放",
  open: "作答中",
  closed: "已結束",
};

/**
 * Question queue/list with open/close controls (FE-3.3.2 / FE-3.3.3).
 *
 * The backend enforces "at most one open question at a time" and "closed questions
 * cannot be reopened"; the controls reflect the current server state and disable
 * invalid transitions. Mutations invalidate the authoritative detail cache; the UI
 * never optimistically flips a status.
 */
export function QuestionQueue({
  liveSessionId,
  questions,
}: {
  liveSessionId: string;
  questions: SessionQuestion[];
}) {
  const openQuestion = useOpenSessionQuestion();
  const closeQuestion = useCloseSessionQuestion();

  if (questions.length === 0) {
    return (
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        這堂課目前沒有題目。
      </p>
    );
  }

  return (
    <ul className="space-y-3">
      {questions.map((question) => {
        const isOpen = question.status === "open";
        const isClosed = question.status === "closed";
        const busy = openQuestion.isPending || closeQuestion.isPending;
        return (
          <li
            key={question.id}
            className="rounded-md border border-zinc-200 px-4 py-3 dark:border-zinc-800"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium">{question.snapshotPrompt}</p>
                <p className="mt-0.5 text-xs text-zinc-600 dark:text-zinc-400">
                  {question.snapshotType === "poll"
                    ? "選擇題"
                    : question.snapshotType === "quiz"
                      ? "測驗題"
                      : "文字作答"}
                  {" · "}
                  {STATUS_LABELS[question.status]}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                {isOpen ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      closeQuestion.mutate({
                        liveSessionId,
                        sessionQuestionId: question.id,
                      })
                    }
                    className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium transition hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
                  >
                    {closeQuestion.isPending ? "關閉中…" : "關閉作答"}
                  </button>
                ) : isClosed ? (
                  <span className="text-sm text-zinc-500 dark:text-zinc-400">
                    已結束
                  </span>
                ) : (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      openQuestion.mutate({
                        liveSessionId,
                        sessionQuestionId: question.id,
                      })
                    }
                    className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-zinc-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
                  >
                    {openQuestion.isPending ? "開放中…" : "開放作答"}
                  </button>
                )}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
