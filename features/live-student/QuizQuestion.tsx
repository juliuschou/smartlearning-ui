"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { ErrorAlert } from "@/components/ui/ErrorAlert";
import { isLearnerAccessCode } from "@/features/live-student/LearnerAccessState";
import {
  useParticipantResults,
  useSubmitQuiz,
} from "@/lib/api/participant-live-sessions";
import type { ParticipantActor, SessionQuestion } from "@/lib/api/types";
import {
  createQuizSubmissionAttempt,
  getQuizSubmissionAttempt,
  persistQuizSubmissionAttempt,
  removeQuizSubmissionAttempt,
} from "@/features/live-student/quiz-submission-attempt";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-7][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * FE-5.2 — learner quiz renderer (exact-set, vote-to-reveal).
 *
 * The quiz answer is a non-empty exact set of formal option UUIDs (order
 * insensitive on the backend). Submission mirrors poll-multiple: a durable
 * attempt is persisted before the mutation so a response-loss reload replays
 * the same idempotency key.
 *
 * Results are participant-safe and vote-to-reveal: while the question is
 * `open` the projection must NOT carry any correctness field; only after
 * `closed` does the participant see per-option `isCorrect` plus the aggregate
 * `correctCount`/`incorrectCount`/`correctnessRate`. The renderer strict-validates
 * the projection and fails closed (renders no correctness) on any unexpected
 * field. It never infers a per-submission personal correct/wrong judgment —
 * the backend exposes no such field.
 */
export function QuizQuestion({
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
    getQuizSubmissionAttempt(
      question.liveSessionId,
      question.id,
      snapshotOptionIds,
      actor.kind,
    ),
  );
  const [selectedOptionIds, setSelectedOptionIds] = useState<string[]>(
    storedAttempt?.selectedOptionIds ?? [],
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
  const mutation = useSubmitQuiz();
  const results = useParticipantResults(
    question.liveSessionId,
    question.id,
    showResults || submitted,
    actor,
  );
  const supported = isValidQuizQuestion(question);

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
      createQuizSubmissionAttempt(
        question.liveSessionId,
        question.id,
        selectedOptionIds,
        snapshotOptionIds,
        actor.kind,
      );
    if (!attempt || !persistQuizSubmissionAttempt(attempt)) {
      setStorageError(true);
      return;
    }
    setStorageError(false);
    setStoredAttempt(attempt);
    mutation.mutate(
      {
        liveSessionId: question.liveSessionId,
        sessionQuestionId: question.id,
        selectedOptionIds: attempt.selectedOptionIds,
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
            new Set(canonical).size !==
              new Set(attempt.selectedOptionIds).size ||
            canonical.some((id) => !attempt.selectedOptionIds.includes(id))
          ) {
            setSubmissionConflict(true);
            return;
          }
          setSubmissionConflict(false);
          removeQuizSubmissionAttempt(
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
      <ErrorAlert error={mutation.error} id="quiz-error" />
      <ErrorAlert
        error={storageError ? { code: "STORAGE_UNAVAILABLE" } : null}
        id="quiz-storage-error"
      />
      <ErrorAlert
        error={submissionConflict ? { code: "SUBMISSION_CONFLICT" } : null}
        id="quiz-conflict"
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
            className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-zinc-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
          >
            送出答案
          </button>
          <span className="text-sm text-zinc-600 dark:text-zinc-400">
            {submitted ? "你已作答。" : "尚未作答。"}
          </span>
        </div>
      </form>
      <QuizResultSection
        question={question}
        query={results}
        enabled={showResults || submitted}
      />
    </article>
  );
}

type ParsedQuizResults =
  | {
      status: "open";
      options: { optionId: string; count: number }[];
      totalResponses: number;
    }
  | {
      status: "closed";
      options: { optionId: string; count: number; isCorrect: boolean }[];
      totalResponses: number;
      correctCount: number;
      incorrectCount: number;
      correctnessRate: number;
    };

/**
 * Strict-validate the participant quiz results projection against the
 * vote-to-reveal contract. Returns `null` (fail closed → "目前無法顯示結果")
 * on any unexpected shape, including a pre-reveal projection that leaks any
 * correctness field.
 */
function parseQuizResults(
  data: ReturnType<typeof useParticipantResults>["data"],
  question: SessionQuestion,
): ParsedQuizResults | null {
  if (!data || data.snapshotType !== "quiz") return null;
  if (data.status !== "open" && data.status !== "closed") return null;
  if (!Array.isArray(data.options) || !Number.isInteger(data.totalResponses))
    return null;
  const optionIds = new Set(question.options.map((option) => option.id));
  for (const option of data.options) {
    if (
      !optionIds.has(option.optionId) ||
      !Number.isInteger(option.count) ||
      option.count < 0
    )
      return null;
  }
  if (data.status === "open") {
    // Pre-reveal: the participant projection must not carry any correctness
    // field. Any leak is a contract violation — fail closed, render nothing.
    if (
      data.options.some((option) => option.isCorrect !== undefined) ||
      data.correctCount !== undefined ||
      data.incorrectCount !== undefined ||
      data.correctnessRate !== undefined
    )
      return null;
    return {
      status: "open",
      options: data.options.map((option) => ({
        optionId: option.optionId,
        count: option.count,
      })),
      totalResponses: data.totalResponses,
    };
  }
  // Post-reveal: correctness must be fully present.
  if (
    data.options.some((option) => typeof option.isCorrect !== "boolean") ||
    typeof data.correctCount !== "number" ||
    typeof data.incorrectCount !== "number" ||
    typeof data.correctnessRate !== "number"
  )
    return null;
  const revealedOptions: {
    optionId: string;
    count: number;
    isCorrect: boolean;
  }[] = data.options.map((option) => ({
    optionId: option.optionId,
    count: option.count,
    // isCorrect is validated boolean above; materialize it for the reveal.
    isCorrect: Boolean(option.isCorrect),
  }));
  return {
    status: "closed",
    options: revealedOptions,
    totalResponses: data.totalResponses,
    correctCount: data.correctCount,
    incorrectCount: data.incorrectCount,
    correctnessRate: data.correctnessRate,
  };
}

function QuizResultSection({
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
    return <ErrorAlert error={query.error} id="quiz-results-error" />;
  const parsed = parseQuizResults(query.data, question);
  if (!parsed) return <p className="mt-4 text-sm">目前無法顯示結果。</p>;
  const counts = new Map(
    parsed.options.map((option) => [option.optionId, option.count]),
  );
  const correctById = new Map(
    parsed.status === "closed"
      ? parsed.options.map((option) => [option.optionId, option.isCorrect])
      : [],
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
            <span>
              {option.text}
              {parsed.status === "closed" && correctById.get(option.id) ? (
                <span aria-label="正解" className="ml-1.5">
                  ✓ 正解
                </span>
              ) : null}
            </span>
            <span>{counts.get(option.id) ?? 0} 票</span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs">共 {parsed.totalResponses} 份回答</p>
      {parsed.status === "closed" ? (
        <p className="mt-1 text-xs">
          答對 {parsed.correctCount} 份 · 答錯 {parsed.incorrectCount} 份 ·
          正確率 {Math.round(parsed.correctnessRate * 100)}%
        </p>
      ) : null}
    </section>
  );
}

function isValidQuizQuestion(question: SessionQuestion) {
  if (question.snapshotType !== "quiz" || question.options.length === 0)
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
