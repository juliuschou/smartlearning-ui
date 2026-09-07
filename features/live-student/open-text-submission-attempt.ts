const STORAGE_VERSION = 3;
export type OpenTextSubmissionActor = "student" | "anonymous";
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-7][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface OpenTextSubmissionAttempt {
  version: 3;
  actorKind: OpenTextSubmissionActor;
  liveSessionId: string;
  sessionQuestionId: string;
  rawText: string;
  normalizedText: string;
  payloadFingerprint: string;
  idempotencyKey: string;
}

export function normalizeOpenText(value: string) {
  return value.normalize("NFC").replace(/\s+/gu, " ").trim();
}

export function openTextCodePointLength(value: string) {
  return [...value].length;
}

export function isValidOpenTextAnswer(value: string) {
  const normalized = normalizeOpenText(value);
  return normalized.length > 0 && openTextCodePointLength(normalized) <= 2_000;
}

export function openTextPayloadFingerprint(
  sessionQuestionId: string,
  normalizedText: string,
) {
  return JSON.stringify({ sessionQuestionId, textAnswer: normalizedText });
}

function storageKey(
  actor: OpenTextSubmissionActor,
  session: string,
  question: string,
) {
  return `smartlearning:v${STORAGE_VERSION}:open-text:${actor}:${session}:${question}`;
}

function validate(record: unknown): OpenTextSubmissionAttempt | null {
  if (!record || typeof record !== "object") return null;
  const value = record as Record<string, unknown>;
  if (
    value.version !== STORAGE_VERSION ||
    (value.actorKind !== "student" && value.actorKind !== "anonymous") ||
    typeof value.liveSessionId !== "string" ||
    typeof value.sessionQuestionId !== "string" ||
    typeof value.rawText !== "string" ||
    typeof value.normalizedText !== "string" ||
    typeof value.payloadFingerprint !== "string" ||
    typeof value.idempotencyKey !== "string" ||
    !UUID_PATTERN.test(value.liveSessionId) ||
    !UUID_PATTERN.test(value.sessionQuestionId) ||
    !UUID_PATTERN.test(value.idempotencyKey) ||
    value.normalizedText !== normalizeOpenText(value.rawText) ||
    value.payloadFingerprint !==
      openTextPayloadFingerprint(value.sessionQuestionId, value.normalizedText)
  )
    return null;
  return value as unknown as OpenTextSubmissionAttempt;
}

export function createOpenTextSubmissionAttempt(
  liveSessionId: string,
  sessionQuestionId: string,
  rawText: string,
  actorKind: OpenTextSubmissionActor = "student",
) {
  const normalizedText = normalizeOpenText(rawText);
  if (
    !UUID_PATTERN.test(liveSessionId) ||
    !UUID_PATTERN.test(sessionQuestionId) ||
    typeof rawText !== "string"
  )
    return null;
  return {
    version: STORAGE_VERSION,
    actorKind,
    liveSessionId,
    sessionQuestionId,
    rawText,
    normalizedText,
    payloadFingerprint: openTextPayloadFingerprint(
      sessionQuestionId,
      normalizedText,
    ),
    idempotencyKey: crypto.randomUUID(),
  } satisfies OpenTextSubmissionAttempt;
}

export function getOpenTextSubmissionAttempt(
  liveSessionId: string,
  sessionQuestionId: string,
  actorKind: OpenTextSubmissionActor = "student",
) {
  try {
    const raw = window.sessionStorage.getItem(
      storageKey(actorKind, liveSessionId, sessionQuestionId),
    );
    if (!raw) return null;
    const record = validate(JSON.parse(raw));
    if (
      !record ||
      record.actorKind !== actorKind ||
      record.liveSessionId !== liveSessionId ||
      record.sessionQuestionId !== sessionQuestionId
    ) {
      removeOpenTextSubmissionAttempt(
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

export function persistOpenTextSubmissionAttempt(
  attempt: OpenTextSubmissionAttempt,
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

export function removeOpenTextSubmissionAttempt(
  liveSessionId: string,
  sessionQuestionId: string,
  actorKind: OpenTextSubmissionActor = "student",
) {
  try {
    window.sessionStorage.removeItem(
      storageKey(actorKind, liveSessionId, sessionQuestionId),
    );
  } catch {
    /* unavailable */
  }
}
