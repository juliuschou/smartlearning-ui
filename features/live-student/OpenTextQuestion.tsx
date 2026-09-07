"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { ErrorAlert } from "@/components/ui/ErrorAlert";
import { isLearnerAccessCode } from "@/features/live-student/LearnerAccessState";
import {
  useParticipantResults,
  useSubmitOpenText,
} from "@/lib/api/participant-live-sessions";
import type { ParticipantActor, SessionQuestion } from "@/lib/api/types";
import {
  createOpenTextSubmissionAttempt,
  getOpenTextSubmissionAttempt,
  isValidOpenTextAnswer,
  normalizeOpenText,
  persistOpenTextSubmissionAttempt,
  removeOpenTextSubmissionAttempt,
} from "@/features/live-student/open-text-submission-attempt";

const MAX_LENGTH = 2_000;

export function OpenTextQuestion({
  question,
  actor = { kind: "student" },
  onSubmit,
  onParticipantAccessLoss,
}: {
  question: SessionQuestion;
  actor?: ParticipantActor;
  onSubmit?: (text: string) => void;
  onParticipantAccessLoss?: () => void;
}) {
  const storedAttempt = getOpenTextSubmissionAttempt(
    question.liveSessionId,
    question.id,
    actor.kind,
  );
  const [attempt, setAttempt] = useState(storedAttempt);
  const [rawText, setRawText] = useState(storedAttempt?.rawText ?? "");
  const [submitted, setSubmitted] = useState(
    storedAttempt ? false : question.hasSubmitted === true,
  );
  const [showResults, setShowResults] = useState(
    storedAttempt ? false : question.hasSubmitted === true,
  );
  const [submissionConflict, setSubmissionConflict] = useState(false);
  const [storageError, setStorageError] = useState(false);
  const mutation = useSubmitOpenText();
  const results = useParticipantResults(
    question.liveSessionId,
    question.id,
    showResults || submitted,
    actor,
  );
  const normalizedText = normalizeOpenText(rawText);
  const valid = isValidOpenTextAnswer(rawText);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (question.status !== "open" || submitted || mutation.isPending || !valid)
      return;
    const nextAttempt =
      attempt ??
      createOpenTextSubmissionAttempt(
        question.liveSessionId,
        question.id,
        rawText,
        actor.kind,
      );
    if (!nextAttempt || !persistOpenTextSubmissionAttempt(nextAttempt)) {
      setStorageError(true);
      return;
    }
    setStorageError(false);
    setAttempt(nextAttempt);
    mutation.mutate(
      {
        liveSessionId: question.liveSessionId,
        sessionQuestionId: question.id,
        textAnswer: nextAttempt.normalizedText,
        idempotencyKey: nextAttempt.idempotencyKey,
        actor,
      },
      {
        onSuccess: ({ data, status }) => {
          if (
            status !== 201 ||
            data.liveSessionId !== question.liveSessionId ||
            data.sessionQuestionId !== question.id ||
            data.selectedOptionRefs !== null ||
            data.textAnswer !== nextAttempt.normalizedText
          ) {
            setSubmissionConflict(true);
            return;
          }
          removeOpenTextSubmissionAttempt(
            question.liveSessionId,
            question.id,
            actor.kind,
          );
          setAttempt(null);
          setSubmissionConflict(false);
          setSubmitted(true);
          setShowResults(true);
          onSubmit?.(nextAttempt.normalizedText);
        },
        onError: (error) => {
          if (actor.kind === "anonymous" && isLearnerAccessCode(error.code))
            onParticipantAccessLoss?.();
        },
      },
    );
  }

  return (
    <article className="rounded-md border border-zinc-200 px-4 py-3 dark:border-zinc-800">
      <ErrorAlert error={mutation.error} id="open-text-error" />
      <ErrorAlert
        error={storageError ? { code: "STORAGE_UNAVAILABLE" } : null}
        id="open-text-storage-error"
      />
      <ErrorAlert
        error={submissionConflict ? { code: "SUBMISSION_CONFLICT" } : null}
        id="open-text-conflict"
      />
      <form onSubmit={handleSubmit}>
        <fieldset disabled={submitted || mutation.isPending}>
          <legend className="text-sm font-medium">
            {question.snapshotPrompt}
          </legend>
          <label htmlFor={`open-text-${question.id}`} className="sr-only">
            請輸入你的答案
          </label>
          <textarea
            id={`open-text-${question.id}`}
            value={rawText}
            onChange={(event) => setRawText(event.target.value)}
            rows={5}
            maxLength={MAX_LENGTH * 2}
            aria-describedby={`open-text-help-${question.id}`}
            className="mt-3 block w-full resize-y rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-500 focus:ring-2 focus:ring-zinc-400 dark:border-zinc-700 dark:bg-zinc-950"
          />
          <p
            id={`open-text-help-${question.id}`}
            className="mt-1 text-xs text-zinc-600 dark:text-zinc-400"
          >
            送出時空白與換行會正規化。{[...normalizedText].length}/{MAX_LENGTH}{" "}
            字元
          </p>
          {!valid && rawText.length > 0 ? (
            <p
              role="alert"
              className="mt-1 text-sm text-red-700 dark:text-red-300"
            >
              答案必須為 1–2,000 個字元。
            </p>
          ) : null}
        </fieldset>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={
              question.status !== "open" ||
              submitted ||
              mutation.isPending ||
              !valid
            }
            className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
          >
            送出答案
          </button>
          <span className="text-sm text-zinc-600 dark:text-zinc-400">
            {submitted ? "你已作答。" : "尚未作答。"}
          </span>
        </div>
      </form>
      <OpenTextResultSection
        query={results}
        enabled={showResults || submitted || question.status === "closed"}
      />
    </article>
  );
}

function OpenTextResultSection({
  query,
  enabled,
}: {
  query: ReturnType<typeof useParticipantResults>;
  enabled: boolean;
}) {
  if (!enabled) return null;
  if (query.isLoading)
    return (
      <p role="status" aria-live="polite" className="mt-4 text-sm">
        載入結果中…
      </p>
    );
  if (query.error?.code === "RESULTS_NOT_REVEALED")
    return <p className="mt-4 text-sm">結果尚未公開。</p>;
  if (query.error)
    return <ErrorAlert error={query.error} id="open-text-results-error" />;
  const data = parseOpenTextResults(query.data);
  if (!data) return <p className="mt-4 text-sm">目前無法顯示結果。</p>;
  return (
    <section
      className="mt-4 border-t border-zinc-200 pt-3 dark:border-zinc-800"
      aria-label="匿名結果"
    >
      <h3 className="text-sm font-semibold">匿名結果</h3>
      <ul className="mt-2 space-y-2">
        {data.responses.map((response, index) => (
          <li
            key={index}
            className="rounded-md border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-800"
          >
            {response.text}
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs">共 {data.totalResponses} 份回答</p>
    </section>
  );
}

function parseOpenTextResults(data: unknown) {
  if (!data || typeof data !== "object") return null;
  const value = data as Record<string, unknown>;
  const totalResponses = value.totalResponses;
  if (
    Object.keys(value).length !== 4 ||
    value.snapshotType !== "open_text" ||
    (value.status !== "open" && value.status !== "closed") ||
    !Array.isArray(value.responses) ||
    typeof totalResponses !== "number" ||
    !Number.isInteger(totalResponses) ||
    totalResponses < 0
  )
    return null;
  const responses = value.responses as unknown[];
  if (
    responses.some((response) => {
      if (!response || typeof response !== "object") return true;
      const item = response as Record<string, unknown>;
      return Object.keys(item).length !== 1 || typeof item.text !== "string";
    })
  )
    return null;
  return {
    snapshotType: "open_text" as const,
    status: value.status as "open" | "closed",
    responses: responses as { text: string }[],
    totalResponses: value.totalResponses as number,
  };
}
