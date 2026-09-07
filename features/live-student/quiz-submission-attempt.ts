const STORAGE_VERSION = 3;
export type QuizSubmissionActor = "student" | "anonymous";
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-7][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface QuizSubmissionAttempt {
  version: 3;
  actorKind: QuizSubmissionActor;
  liveSessionId: string;
  sessionQuestionId: string;
  selectedOptionIds: [string, ...string[]];
  optionSetFingerprint: string;
  payloadFingerprint: string;
  idempotencyKey: string;
}

function storageKey(
  actor: QuizSubmissionActor,
  session: string,
  question: string,
) {
  return `smartlearning:v${STORAGE_VERSION}:quiz:${actor}:${session}:${question}`;
}

export function canonicalizeQuizOptionIds(
  selectedOptionIds: string[],
  snapshotOptionIds: string[],
): [string, ...string[]] | null {
  if (
    !Array.isArray(selectedOptionIds) ||
    selectedOptionIds.length === 0 ||
    selectedOptionIds.some(
      (id) => typeof id !== "string" || !UUID_PATTERN.test(id),
    )
  )
    return null;
  if (new Set(selectedOptionIds).size !== selectedOptionIds.length) return null;
  const snapshot = new Set(snapshotOptionIds);
  if (
    !snapshotOptionIds.every((id) => UUID_PATTERN.test(id)) ||
    new Set(snapshotOptionIds).size !== snapshotOptionIds.length
  )
    return null;
  if (selectedOptionIds.some((id) => !snapshot.has(id))) return null;
  const selected = snapshotOptionIds.filter((id) =>
    selectedOptionIds.includes(id),
  );
  return selected.length ? [selected[0], ...selected.slice(1)] : null;
}

export function quizOptionSetFingerprint(selectedOptionIds: string[]) {
  return JSON.stringify([...selectedOptionIds].sort());
}

function parseOptionSetFingerprint(fingerprint: string) {
  try {
    const selectedOptionIds: unknown = JSON.parse(fingerprint);
    if (
      !Array.isArray(selectedOptionIds) ||
      selectedOptionIds.some(
        (id) => typeof id !== "string" || !UUID_PATTERN.test(id),
      ) ||
      new Set(selectedOptionIds).size !== selectedOptionIds.length
    )
      return null;
    return selectedOptionIds as string[];
  } catch {
    return null;
  }
}

export function quizPayloadFingerprint(
  sessionQuestionId: string,
  selectedOptionIds: string[],
) {
  return JSON.stringify({
    sessionQuestionId,
    selectedOptionRefs: [...selectedOptionIds].sort(),
  });
}

function validate(record: unknown): QuizSubmissionAttempt | null {
  if (!record || typeof record !== "object") return null;
  const value = record as Record<string, unknown>;
  if (
    value.version !== STORAGE_VERSION ||
    (value.actorKind !== "student" && value.actorKind !== "anonymous") ||
    typeof value.liveSessionId !== "string" ||
    typeof value.sessionQuestionId !== "string" ||
    !Array.isArray(value.selectedOptionIds) ||
    value.selectedOptionIds.length === 0 ||
    value.selectedOptionIds.some(
      (id) => typeof id !== "string" || !UUID_PATTERN.test(id),
    ) ||
    new Set(value.selectedOptionIds).size !== value.selectedOptionIds.length ||
    typeof value.optionSetFingerprint !== "string" ||
    typeof value.payloadFingerprint !== "string" ||
    typeof value.idempotencyKey !== "string" ||
    !UUID_PATTERN.test(value.liveSessionId) ||
    !UUID_PATTERN.test(value.sessionQuestionId) ||
    !UUID_PATTERN.test(value.idempotencyKey) ||
    value.payloadFingerprint !==
      quizPayloadFingerprint(
        value.sessionQuestionId,
        value.selectedOptionIds as string[],
      )
  )
    return null;
  if (!parseOptionSetFingerprint(value.optionSetFingerprint)) return null;
  return value as unknown as QuizSubmissionAttempt;
}

export function getQuizSubmissionAttempt(
  liveSessionId: string,
  sessionQuestionId: string,
  snapshotOptionIds: string[],
  actorKind: QuizSubmissionActor = "student",
) {
  try {
    const raw = window.sessionStorage.getItem(
      storageKey(actorKind, liveSessionId, sessionQuestionId),
    );
    if (!raw) return null;
    const record = validate(JSON.parse(raw));
    const storedOptionIds = record
      ? parseOptionSetFingerprint(record.optionSetFingerprint)
      : null;
    if (
      !record ||
      record.actorKind !== actorKind ||
      record.liveSessionId !== liveSessionId ||
      record.sessionQuestionId !== sessionQuestionId ||
      !storedOptionIds ||
      quizOptionSetFingerprint(storedOptionIds) !==
        quizOptionSetFingerprint(snapshotOptionIds)
    ) {
      removeQuizSubmissionAttempt(liveSessionId, sessionQuestionId, actorKind);
      return null;
    }
    return record;
  } catch {
    return null;
  }
}

export function persistQuizSubmissionAttempt(attempt: QuizSubmissionAttempt) {
  try {
    window.sessionStorage.setItem(
      storageKey(
        attempt.actorKind,
        attempt.liveSessionId,
        attempt.sessionQuestionId,
      ),
      JSON.stringify(attempt),
    );
    return true;
  } catch {
    return false;
  }
}

export function removeQuizSubmissionAttempt(
  liveSessionId: string,
  sessionQuestionId: string,
  actorKind: QuizSubmissionActor = "student",
) {
  try {
    window.sessionStorage.removeItem(
      storageKey(actorKind, liveSessionId, sessionQuestionId),
    );
  } catch {
    /* unavailable */
  }
}

export function createQuizSubmissionAttempt(
  liveSessionId: string,
  sessionQuestionId: string,
  selectedOptionIds: string[],
  snapshotOptionIds: string[],
  actorKind: QuizSubmissionActor = "student",
) {
  const canonical = canonicalizeQuizOptionIds(
    selectedOptionIds,
    snapshotOptionIds,
  );
  if (
    !UUID_PATTERN.test(liveSessionId) ||
    !UUID_PATTERN.test(sessionQuestionId) ||
    !canonical
  )
    return null;
  return {
    version: STORAGE_VERSION,
    actorKind,
    liveSessionId,
    sessionQuestionId,
    selectedOptionIds: canonical,
    optionSetFingerprint: quizOptionSetFingerprint(snapshotOptionIds),
    payloadFingerprint: quizPayloadFingerprint(sessionQuestionId, canonical),
    idempotencyKey: crypto.randomUUID(),
  } satisfies QuizSubmissionAttempt;
}
