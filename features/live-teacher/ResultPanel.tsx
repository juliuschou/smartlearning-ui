"use client";

import { ErrorAlert } from "@/components/ui/ErrorAlert";
import { ApiRequestError } from "@/lib/api/client";
import { useSessionQuestionResults } from "@/lib/api/live-sessions";

/**
 * Per-question result dashboard (FE-3.3.5).
 *
 * Renders the discriminated `SessionQuestionResults` union (poll / quiz / open_text)
 * with semantic HTML/CSS bars — no chart dependency. Quiz correctness is always shown
 * to the teacher. A 404 uses a question-generic message; other errors stay on the
 * stable-code ErrorAlert path and never render the backend message.
 */
export function ResultPanel({
  liveSessionId,
  sessionQuestionId,
}: {
  liveSessionId: string;
  sessionQuestionId: string;
}) {
  const { data, error, isLoading } = useSessionQuestionResults(
    liveSessionId,
    sessionQuestionId,
  );

  if (isLoading) {
    return (
      <p
        role="status"
        aria-live="polite"
        className="text-sm text-zinc-600 dark:text-zinc-400"
      >
        載入結果中…
      </p>
    );
  }

  if (error instanceof ApiRequestError && error.status === 404) {
    return (
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        此題結果目前無法取得。
      </p>
    );
  }

  if (error) {
    return (
      <ErrorAlert
        error={
          error instanceof ApiRequestError ? error : { code: "INTERNAL_ERROR" }
        }
        id={`result-error-${sessionQuestionId}`}
      />
    );
  }

  if (!data) {
    return (
      <ErrorAlert
        error={{ code: "INTERNAL_ERROR" }}
        id={`result-error-${sessionQuestionId}`}
      />
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium">作答結果</span>
        <span className="text-zinc-600 dark:text-zinc-400">
          共 {data.totalResponses} 人作答
        </span>
      </div>

      {data.snapshotType === "open_text" ? (
        <ul className="space-y-2">
          {data.responses.length === 0 ? (
            <li className="text-sm text-zinc-600 dark:text-zinc-400">
              尚無文字作答。
            </li>
          ) : (
            data.responses.map((response, index) => (
              <li
                key={index}
                className="rounded-md border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-800"
              >
                {response.text}
              </li>
            ))
          )}
        </ul>
      ) : (
        <ul className="space-y-2">
          {data.options.map((option) => {
            const pct =
              data.totalResponses > 0
                ? Math.round((option.count / data.totalResponses) * 100)
                : 0;
            return (
              <li key={option.optionId} className="text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2">
                    <span>{option.text}</span>
                    {data.snapshotType === "quiz" && option.isCorrect ? (
                      <span className="rounded bg-green-100 px-1.5 py-0.5 text-xs font-medium text-green-800 dark:bg-green-900 dark:text-green-200">
                        正解
                      </span>
                    ) : null}
                  </span>
                  <span className="text-zinc-600 dark:text-zinc-400">
                    {option.count} 票（{pct}%）
                  </span>
                </div>
                <div
                  role="img"
                  aria-label={`${option.text}：${option.count} 票，${pct}%`}
                  className="mt-1 h-2 w-full overflow-hidden rounded bg-zinc-200 dark:bg-zinc-800"
                >
                  <div
                    className="h-full rounded bg-zinc-900 dark:bg-zinc-100"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
