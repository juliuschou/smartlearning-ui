const STORAGE_VERSION = 1;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-7][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface PollSubmissionAttempt {
  version: 1;
  liveSessionId: string;
  sessionQuestionId: string;
  optionId: string;
  optionSetFingerprint: string;
  payloadFingerprint: string;
  idempotencyKey: string;
}

function storageKey(liveSessionId: string, sessionQuestionId: string) {
  return `smartlearning:v${STORAGE_VERSION}:poll-single:${liveSessionId}:${sessionQuestionId}`;
}

export function pollPayloadFingerprint(
  sessionQuestionId: string,
  optionId: string,
): string {
  return JSON.stringify({ sessionQuestionId, selectedOptionRefs: [optionId] });
}

export function optionSetFingerprint(optionIds: string[]): string {
  return JSON.stringify(optionIds);
}

function validUuid(value: string) {
  return UUID_PATTERN.test(value);
}

function validate(record: unknown): PollSubmissionAttempt | null {
  if (!record || typeof record !== "object") return null;
  const value = record as Record<string, unknown>;
  if (
    value.version !== 1 ||
    typeof value.liveSessionId !== "string" ||
    typeof value.sessionQuestionId !== "string" ||
    typeof value.optionId !== "string" ||
    typeof value.optionSetFingerprint !== "string" ||
    typeof value.payloadFingerprint !== "string" ||
    typeof value.idempotencyKey !== "string" ||
    !validUuid(value.liveSessionId) ||
    !validUuid(value.sessionQuestionId) ||
    !validUuid(value.optionId) ||
    !validUuid(value.idempotencyKey) ||
    value.payloadFingerprint !==
      pollPayloadFingerprint(value.sessionQuestionId, value.optionId)
  )
    return null;
  return value as unknown as PollSubmissionAttempt;
}

export function getPollSubmissionAttempt(
  liveSessionId: string,
  sessionQuestionId: string,
  currentOptionIds?: string[],
): PollSubmissionAttempt | null {
  try {
    const raw = window.sessionStorage.getItem(
      storageKey(liveSessionId, sessionQuestionId),
    );
    if (!raw) return null;
    const record = validate(JSON.parse(raw));
    if (
      !record ||
      record.liveSessionId !== liveSessionId ||
      record.sessionQuestionId !== sessionQuestionId
    ) {
      removePollSubmissionAttempt(liveSessionId, sessionQuestionId);
      return null;
    }
    if (
      currentOptionIds &&
      record.optionSetFingerprint !== optionSetFingerprint(currentOptionIds)
    ) {
      removePollSubmissionAttempt(liveSessionId, sessionQuestionId);
      return null;
    }
    return record;
  } catch {
    return null;
  }
}

export function persistPollSubmissionAttempt(
  attempt: PollSubmissionAttempt,
): boolean {
  try {
    window.sessionStorage.setItem(
      storageKey(attempt.liveSessionId, attempt.sessionQuestionId),
      JSON.stringify(attempt),
    );
    return true;
  } catch {
    return false;
  }
}

export function removePollSubmissionAttempt(
  liveSessionId: string,
  sessionQuestionId: string,
): void {
  try {
    window.sessionStorage.removeItem(
      storageKey(liveSessionId, sessionQuestionId),
    );
  } catch {
    /* unavailable */
  }
}

export function createPollSubmissionAttempt(
  liveSessionId: string,
  sessionQuestionId: string,
  optionId: string,
  optionIds: string[],
): PollSubmissionAttempt | null {
  if (
    ![liveSessionId, sessionQuestionId, optionId].every(validUuid) ||
    !optionIds.includes(optionId)
  )
    return null;
  return {
    version: 1,
    liveSessionId,
    sessionQuestionId,
    optionId,
    optionSetFingerprint: optionSetFingerprint(optionIds),
    payloadFingerprint: pollPayloadFingerprint(sessionQuestionId, optionId),
    idempotencyKey: crypto.randomUUID(),
  };
}
