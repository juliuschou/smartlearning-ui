"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { ErrorAlert } from "@/components/ui/ErrorAlert";
import { isLearnerAccessCode } from "@/features/live-student/LearnerAccessState";
import {
  useParticipantResults,
  useSubmitPollSingle,
} from "@/lib/api/participant-live-sessions";
import type {
  ParticipantActor,
  SessionQuestion,
  SessionQuestionResults,
} from "@/lib/api/types";
import {
  createPollSubmissionAttempt,
  getPollSubmissionAttempt,
  removePollSubmissionAttempt,
  persistPollSubmissionAttempt,
} from "@/features/live-student/poll-submission-attempt";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-7][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function PollSingleQuestion({
  question,
  actor = { kind: "student" },
  onSubmit,
  onParticipantAccessLoss,
}: {
  question: SessionQuestion;
  actor?: ParticipantActor;
  onSubmit?: (optionId: string) => void;
  onParticipantAccessLoss?: () => void;
}) {
  const optionIds = question.options.map((option) => option.id);
  const [storedAttempt, setStoredAttempt] = useState(() =>
    getPollSubmissionAttempt(
      question.liveSessionId,
      question.id,
      optionIds,
      actor.kind,
    ),
  );
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(
    storedAttempt?.optionId ?? null,
  );
  const [submitted, setSubmitted] = useState(
    storedAttempt ? false : question.hasSubmitted === true,
  );
  const [responseError, setResponseError] = useState<{ code: string } | null>(
    null,
  );
  const [showResults, setShowResults] = useState(
    storedAttempt ? false : question.hasSubmitted === true,
  );
  const mutation = useSubmitPollSingle();
  const isSupported = isValidPollSingleQuestion(question);
  const isSubmitted = storedAttempt
    ? submitted
    : question.hasSubmitted === true || submitted;
  const isPending = mutation.isPending;
  const results = useParticipantResults(
    question.liveSessionId,
    question.id,
    isSupported && (showResults || isSubmitted),
    actor,
  );

  if (!isSupported) {
    return (
      <ReadonlyQuestion question={question} message="此題型目前無法作答。" />
    );
  }

  function submitAttempt(attempt: NonNullable<typeof storedAttempt>) {
    const optionId = attempt.optionId;
    setResponseError(null);
    mutation.mutate(
      {
        liveSessionId: question.liveSessionId,
        sessionQuestionId: question.id,
        optionId,
        idempotencyKey: attempt.idempotencyKey,
        actor,
      },
      {
        onSuccess: ({ data: response, status }) => {
          if (status !== 201) {
            setResponseError({ code: "SUBMISSION_CONFLICT" });
            return;
          }
          const canonical = response.selectedOptionRefs;
          if (
            response.sessionQuestionId !== question.id ||
            !canonical ||
            canonical.length !== 1 ||
            !question.options.some((option) => option.id === canonical[0])
          ) {
            setResponseError({ code: "SUBMISSION_CONFLICT" });
            return;
          }
          removePollSubmissionAttempt(
            question.liveSessionId,
            question.id,
            actor.kind,
          );
          setStoredAttempt(null);
          setSubmitted(true);
          setShowResults(true);
          onSubmit?.(canonical[0]);
        },
        onError: (error) => {
          if (actor.kind === "anonymous" && isLearnerAccessCode(error.code)) {
            onParticipantAccessLoss?.();
          }
          setResponseError(error);
        },
      },
    );
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (question.status !== "open" || isSubmitted || isPending) return;
    if (storedAttempt) {
      submitAttempt(storedAttempt);
      return;
    }
    if (!selectedOptionId) return;
    const attempt = createPollSubmissionAttempt(
      question.liveSessionId,
      question.id,
      selectedOptionId,
      optionIds,
      actor.kind,
    );
    if (!attempt || !persistPollSubmissionAttempt(attempt)) {
      setResponseError({ code: "STORAGE_UNAVAILABLE" });
      return;
    }
    setStoredAttempt(attempt);
    submitAttempt(attempt);
  }

  return (
    <article className="rounded-md border border-zinc-200 px-4 py-3 dark:border-zinc-800">
      <ErrorAlert error={mutation.error ?? responseError} id="poll-error" />
      <form onSubmit={handleSubmit}>
        <fieldset
          disabled={question.status !== "open" || isSubmitted || isPending}
        >
          <legend className="text-sm font-medium">
            {question.snapshotPrompt}
          </legend>
          <div className="mt-3 space-y-2">
            {question.options.map((option) => (
              <label
                key={option.id}
                className="flex cursor-pointer items-start gap-2 rounded-md border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-800"
              >
                <input
                  type="radio"
                  name={`question-${question.id}`}
                  value={option.id}
                  checked={selectedOptionId === option.id}
                  onChange={() => setSelectedOptionId(option.id)}
                  className="mt-0.5"
                />
                <span>{option.text}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={
              question.status !== "open" ||
              isSubmitted ||
              isPending ||
              selectedOptionId === null
            }
            className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-zinc-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
          >
            送出答案
          </button>
          <span className="text-sm text-zinc-600 dark:text-zinc-400">
            {isSubmitted ? "你已作答。" : "尚未作答。"}
          </span>
        </div>
      </form>
      <ResultSection
        question={question}
        query={results}
        enabled={showResults || isSubmitted}
        onRefresh={() => void results.refetch()}
      />
    </article>
  );
}

function ResultSection({
  question,
  query,
  enabled,
  onRefresh,
}: {
  question: SessionQuestion;
  query: ReturnType<typeof useParticipantResults>;
  enabled: boolean;
  onRefresh: () => void;
}) {
  if (!enabled) return null;
  if (query.isLoading)
    return (
      <p
        role="status"
        aria-live="polite"
        className="mt-4 text-sm text-zinc-600 dark:text-zinc-400"
      >
        載入結果中…
      </p>
    );
  if (
    query.error &&
    "code" in query.error &&
    (query.error as { code?: string }).code === "RESULTS_NOT_REVEALED"
  ) {
    return (
      <p className="mt-4 text-sm text-zinc-600 dark:text-zinc-400">
        結果尚未公開。
      </p>
    );
  }
  if (query.error)
    return <ErrorAlert error={query.error} id="poll-results-error" />;
  const data = query.data;
  if (
    !isValidPollResult(data) ||
    data.snapshotType !== "poll" ||
    (data.status !== question.status &&
      data.status !== "open" &&
      data.status !== "closed")
  ) {
    return (
      <p
        id="poll-results-invalid"
        className="mt-4 text-sm text-zinc-600 dark:text-zinc-400"
      >
        目前無法顯示結果。
      </p>
    );
  }
  const counts = new Map(
    data.options.map((option) => [option.optionId, option.count]),
  );
  if (
    data.options.some(
      (option) =>
        !question.options.some((candidate) => candidate.id === option.optionId),
    )
  ) {
    return (
      <p
        id="poll-results-invalid"
        className="mt-4 text-sm text-zinc-600 dark:text-zinc-400"
      >
        目前無法顯示結果。
      </p>
    );
  }
  return (
    <section
      className="mt-4 border-t border-zinc-200 pt-3 dark:border-zinc-800"
      aria-label="匿名結果"
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">匿名結果</h3>
        <button type="button" onClick={onRefresh} className="text-sm underline">
          更新結果
        </button>
      </div>
      <ul className="mt-2 space-y-2">
        {question.options.map((option) => (
          <li key={option.id} className="flex justify-between gap-3 text-sm">
            <span>{option.text}</span>
            <span>{counts.get(option.id) ?? 0} 票</span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-400">
        共 {data.totalResponses} 份回答
      </p>
    </section>
  );
}

function isValidPollResult(
  data: SessionQuestionResults | undefined,
): data is Extract<SessionQuestionResults, { snapshotType: "poll" }> {
  return Boolean(
    data &&
    data.snapshotType === "poll" &&
    Array.isArray(data.options) &&
    Number.isInteger(data.totalResponses) &&
    data.totalResponses >= 0 &&
    data.options.every(
      (option) =>
        typeof option.optionId === "string" &&
        Number.isInteger(option.count) &&
        option.count >= 0,
    ),
  );
}

function ReadonlyQuestion({
  question,
  message,
}: {
  question: SessionQuestion;
  message: string;
}) {
  return (
    <div className="rounded-md border border-zinc-200 px-4 py-3 dark:border-zinc-800">
      <p className="text-sm font-medium">{question.snapshotPrompt}</p>
      {question.options.length > 0 ? (
        <ul className="mt-3 space-y-2">
          {question.options.map((option, index) => (
            <li
              key={`${option.id}-${index}`}
              className="rounded-md border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-800"
            >
              {option.text}
            </li>
          ))}
        </ul>
      ) : null}
      <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">{message}</p>
    </div>
  );
}

function isValidPollSingleQuestion(question: SessionQuestion): boolean {
  if (
    question.snapshotType !== "poll" ||
    question.snapshotSelectionMode !== "single" ||
    question.options.length === 0
  )
    return false;
  const optionIds = question.options.map((option) => option.id);
  return (
    optionIds.every((optionId) => UUID_PATTERN.test(optionId)) &&
    new Set(optionIds).size === optionIds.length
  );
}
