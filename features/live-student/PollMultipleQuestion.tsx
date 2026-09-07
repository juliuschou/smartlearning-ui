"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { ErrorAlert } from "@/components/ui/ErrorAlert";
import { isLearnerAccessCode } from "@/features/live-student/LearnerAccessState";
import {
  useParticipantResults,
  useSubmitPollMultiple,
} from "@/lib/api/participant-live-sessions";
import type { ParticipantActor, SessionQuestion } from "@/lib/api/types";
import {
  createPollMultipleSubmissionAttempt,
  getPollMultipleSubmissionAttempt,
  persistPollMultipleSubmissionAttempt,
  removePollMultipleSubmissionAttempt,
} from "@/features/live-student/poll-multiple-submission-attempt";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-7][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function PollMultipleQuestion({
  question,
  actor = { kind: "student" },
  onSubmit,
  onParticipantAccessLoss,
}: {
  question: SessionQuestion;
  actor?: ParticipantActor;
  onSubmit?: (optionIds: string[]) => void;
  onParticipantAccessLoss?: () => void;
}) {
  const snapshotOptionIds = question.options.map((option) => option.id);
  const [storedAttempt, setStoredAttempt] = useState(() =>
    getPollMultipleSubmissionAttempt(
      question.liveSessionId,
      question.id,
      snapshotOptionIds,
      actor.kind,
    ),
  );
  const [selectedOptionIds, setSelectedOptionIds] = useState<string[]>(
    storedAttempt?.optionIds ?? [],
  );
  // A durable attempt means the client sent a submission but never received
  // confirmation (e.g. response loss). Even if the reloaded snapshot reports
  // hasSubmitted=true (the backend committed), the client must stay in the
  // unconfirmed state so the same idempotency key can be replayed to confirm.
  const [submitted, setSubmitted] = useState(
    storedAttempt ? false : question.hasSubmitted === true,
  );
  const [showResults, setShowResults] = useState(
    storedAttempt ? false : question.hasSubmitted === true,
  );
  const [submissionConflict, setSubmissionConflict] = useState(false);
  const [storageError, setStorageError] = useState(false);
  const mutation = useSubmitPollMultiple();
  const results = useParticipantResults(
    question.liveSessionId,
    question.id,
    showResults || submitted,
    actor,
  );
  const supported = isValidPollMultipleQuestion(question);

  if (!supported) {
    return (
      <ReadonlyQuestion question={question} message="此題型目前無法作答。" />
    );
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      question.status !== "open" ||
      submitted ||
      mutation.isPending ||
      selectedOptionIds.length === 0
    )
      return;
    const attempt =
      storedAttempt ??
      createPollMultipleSubmissionAttempt(
        question.liveSessionId,
        question.id,
        selectedOptionIds,
        snapshotOptionIds,
        actor.kind,
      );
    if (!attempt || !persistPollMultipleSubmissionAttempt(attempt)) {
      setStorageError(true);
      return;
    }
    setStorageError(false);
    setStoredAttempt(attempt);
    mutation.mutate(
      {
        liveSessionId: question.liveSessionId,
        sessionQuestionId: question.id,
        optionIds: attempt.optionIds,
        idempotencyKey: attempt.idempotencyKey,
        actor,
      },
      {
        onSuccess: ({ data, status }) => {
          if (status !== 201 || data.sessionQuestionId !== question.id) {
            setSubmissionConflict(true);
            return;
          }
          const canonical = data.selectedOptionRefs;
          if (
            !canonical ||
            canonical.length === 0 ||
            new Set(canonical).size !== canonical.length ||
            canonical.some(
              (id) => !question.options.some((option) => option.id === id),
            ) ||
            new Set(canonical).size !== new Set(attempt.optionIds).size ||
            canonical.some((id) => !attempt.optionIds.includes(id))
          ) {
            setSubmissionConflict(true);
            return;
          }
          setSubmissionConflict(false);
          removePollMultipleSubmissionAttempt(
            question.liveSessionId,
            question.id,
            actor.kind,
          );
          setStoredAttempt(null);
          setSelectedOptionIds(canonical);
          setSubmitted(true);
          setShowResults(true);
          onSubmit?.(canonical);
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
      <ErrorAlert error={mutation.error} id="poll-multiple-error" />
      <ErrorAlert
        error={storageError ? { code: "STORAGE_UNAVAILABLE" } : null}
        id="poll-multiple-storage-error"
      />
      <ErrorAlert
        error={submissionConflict ? { code: "SUBMISSION_CONFLICT" } : null}
        id="poll-multiple-conflict"
      />
      <form onSubmit={handleSubmit}>
        <fieldset
          disabled={
            question.status !== "open" || submitted || mutation.isPending
          }
        >
          <legend className="text-sm font-medium">
            {question.snapshotPrompt}
          </legend>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            可複選
          </p>
          <div className="mt-3 space-y-2">
            {question.options.map((option) => (
              <label
                key={option.id}
                className="flex cursor-pointer items-start gap-2 rounded-md border border-zinc-200 px-3 py-2 text-sm outline-none focus-within:border-zinc-500 focus-within:ring-2 focus-within:ring-zinc-400 dark:border-zinc-800 dark:focus-within:border-zinc-400 dark:focus-within:ring-zinc-500"
              >
                <input
                  type="checkbox"
                  value={option.id}
                  checked={selectedOptionIds.includes(option.id)}
                  onChange={() =>
                    setSelectedOptionIds((current) =>
                      current.includes(option.id)
                        ? current.filter((id) => id !== option.id)
                        : [...current, option.id],
                    )
                  }
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
              submitted ||
              mutation.isPending ||
              selectedOptionIds.length === 0
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
      <MultipleResultSection
        question={question}
        query={results}
        enabled={showResults || submitted}
      />
    </article>
  );
}

function MultipleResultSection({
  question,
  query,
  enabled,
}: {
  question: SessionQuestion;
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
    return <ErrorAlert error={query.error} id="poll-multiple-results-error" />;
  const data = query.data;
  if (
    !data ||
    data.snapshotType !== "poll" ||
    data.selectionMode !== "multiple" ||
    !Array.isArray(data.options) ||
    !Number.isInteger(data.totalResponses) ||
    data.options.some(
      (option) =>
        option.optionId !==
          question.options.find((candidate) => candidate.id === option.optionId)
            ?.id ||
        !Number.isInteger(option.count) ||
        option.count < 0,
    )
  )
    return <p className="mt-4 text-sm">目前無法顯示結果。</p>;
  const counts = new Map(
    data.options.map((option) => [option.optionId, option.count]),
  );
  return (
    <section
      className="mt-4 border-t border-zinc-200 pt-3 dark:border-zinc-800"
      aria-label="匿名結果"
    >
      <h3 className="text-sm font-semibold">匿名結果</h3>
      <ul className="mt-2 space-y-2">
        {question.options.map((option) => (
          <li key={option.id} className="flex justify-between gap-3 text-sm">
            <span>{option.text}</span>
            <span>{counts.get(option.id) ?? 0} 票</span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs">共 {data.totalResponses} 份回答</p>
    </section>
  );
}

function isValidPollMultipleQuestion(question: SessionQuestion) {
  if (
    question.snapshotType !== "poll" ||
    question.snapshotSelectionMode !== "multiple" ||
    question.options.length === 0
  )
    return false;
  const ids = question.options.map((option) => option.id);
  return (
    ids.every((id) => UUID_PATTERN.test(id)) && new Set(ids).size === ids.length
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
      <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">{message}</p>
    </div>
  );
}
