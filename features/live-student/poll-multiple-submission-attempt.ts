const STORAGE_VERSION = 3;
export type PollMultipleSubmissionActor = "student" | "anonymous";
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-7][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface PollMultipleSubmissionAttempt {
  version: 3;
  actorKind: PollMultipleSubmissionActor;
  liveSessionId: string;
  sessionQuestionId: string;
  optionIds: [string, ...string[]];
  optionSetFingerprint: string;
  payloadFingerprint: string;
  idempotencyKey: string;
}

function storageKey(
  actor: PollMultipleSubmissionActor,
  session: string,
  question: string,
) {
  return `smartlearning:v${STORAGE_VERSION}:poll-multiple:${actor}:${session}:${question}`;
}

export function canonicalizePollMultipleOptionIds(
  optionIds: string[],
  snapshotOptionIds: string[],
): [string, ...string[]] | null {
  if (
    !Array.isArray(optionIds) ||
    optionIds.length === 0 ||
    optionIds.some((id) => typeof id !== "string" || !UUID_PATTERN.test(id))
  )
    return null;
  if (new Set(optionIds).size !== optionIds.length) return null;
  const snapshot = new Set(snapshotOptionIds);
  if (
    !snapshotOptionIds.every((id) => UUID_PATTERN.test(id)) ||
    new Set(snapshotOptionIds).size !== snapshotOptionIds.length
  )
    return null;
  if (optionIds.some((id) => !snapshot.has(id))) return null;
  const selected = snapshotOptionIds.filter((id) => optionIds.includes(id));
  return selected.length ? [selected[0], ...selected.slice(1)] : null;
}

export function pollMultipleOptionSetFingerprint(optionIds: string[]) {
  return JSON.stringify([...optionIds].sort());
}

function parseOptionSetFingerprint(fingerprint: string) {
  try {
    const optionIds: unknown = JSON.parse(fingerprint);
    if (
      !Array.isArray(optionIds) ||
      optionIds.some(
        (id) => typeof id !== "string" || !UUID_PATTERN.test(id),
      ) ||
      new Set(optionIds).size !== optionIds.length
    )
      return null;
    return optionIds as string[];
  } catch {
    return null;
  }
}

export function pollMultiplePayloadFingerprint(
  sessionQuestionId: string,
  optionIds: string[],
) {
  return JSON.stringify({
    sessionQuestionId,
    selectedOptionRefs: [...optionIds].sort(),
  });
}

function validate(record: unknown): PollMultipleSubmissionAttempt | null {
  if (!record || typeof record !== "object") return null;
  const value = record as Record<string, unknown>;
  if (
    value.version !== STORAGE_VERSION ||
    (value.actorKind !== "student" && value.actorKind !== "anonymous") ||
    typeof value.liveSessionId !== "string" ||
    typeof value.sessionQuestionId !== "string" ||
    !Array.isArray(value.optionIds) ||
    value.optionIds.length === 0 ||
    value.optionIds.some(
      (id) => typeof id !== "string" || !UUID_PATTERN.test(id),
    ) ||
    new Set(value.optionIds).size !== value.optionIds.length ||
    typeof value.optionSetFingerprint !== "string" ||
    typeof value.payloadFingerprint !== "string" ||
    typeof value.idempotencyKey !== "string" ||
    !UUID_PATTERN.test(value.liveSessionId) ||
    !UUID_PATTERN.test(value.sessionQuestionId) ||
    !UUID_PATTERN.test(value.idempotencyKey) ||
    value.payloadFingerprint !==
      pollMultiplePayloadFingerprint(
        value.sessionQuestionId,
        value.optionIds as string[],
      )
  )
    return null;
  if (!parseOptionSetFingerprint(value.optionSetFingerprint)) return null;
  return value as unknown as PollMultipleSubmissionAttempt;
}

export function getPollMultipleSubmissionAttempt(
  liveSessionId: string,
  sessionQuestionId: string,
  snapshotOptionIds: string[],
  actorKind: PollMultipleSubmissionActor = "student",
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
      pollMultipleOptionSetFingerprint(storedOptionIds) !==
        pollMultipleOptionSetFingerprint(snapshotOptionIds)
    ) {
      removePollMultipleSubmissionAttempt(
        liveSessionId,
        sessionQuestionId,
        actorKind,
      );
      return null;
    }
    return record;
  } catch {
    return null;
  }
}

export function persistPollMultipleSubmissionAttempt(
  attempt: PollMultipleSubmissionAttempt,
) {
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

export function removePollMultipleSubmissionAttempt(
  liveSessionId: string,
  sessionQuestionId: string,
  actorKind: PollMultipleSubmissionActor = "student",
) {
  try {
    window.sessionStorage.removeItem(
      storageKey(actorKind, liveSessionId, sessionQuestionId),
    );
  } catch {
    /* unavailable */
  }
}

export function createPollMultipleSubmissionAttempt(
  liveSessionId: string,
  sessionQuestionId: string,
  optionIds: string[],
  snapshotOptionIds: string[],
  actorKind: PollMultipleSubmissionActor = "student",
) {
  const canonical = canonicalizePollMultipleOptionIds(
    optionIds,
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
    optionIds: canonical,
    optionSetFingerprint: pollMultipleOptionSetFingerprint(snapshotOptionIds),
    payloadFingerprint: pollMultiplePayloadFingerprint(
      sessionQuestionId,
      canonical,
    ),
    idempotencyKey: crypto.randomUUID(),
  } satisfies PollMultipleSubmissionAttempt;
}
