const STORAGE_VERSION = 1;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-7][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface AnonymousParticipantCredential {
  version: 1;
  liveSessionId: string;
  sessionCode: string;
  participantToken: string;
}

export interface AnonymousParticipantJoinReceipt {
  liveSessionId: string;
  sessionCode: string;
}

interface AnonymousParticipantCredentialInput {
  liveSessionId: string;
  sessionCode: string;
  participantToken: string;
}

function storageKey(liveSessionId: string): string {
  return `smartlearning:v${STORAGE_VERSION}:anonymous-participant:${liveSessionId}`;
}

function isValidCredential(
  value: unknown,
  liveSessionId: string,
): value is AnonymousParticipantCredential {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return (
    record.version === STORAGE_VERSION &&
    typeof record.liveSessionId === "string" &&
    UUID_PATTERN.test(record.liveSessionId) &&
    record.liveSessionId === liveSessionId &&
    typeof record.sessionCode === "string" &&
    record.sessionCode.trim().length > 0 &&
    typeof record.participantToken === "string" &&
    record.participantToken.trim().length > 0
  );
}

function validLiveSessionId(liveSessionId: string): boolean {
  return UUID_PATTERN.test(liveSessionId);
}

/** Store the raw token and return a token-free receipt for navigation/UI. */
export function persistAnonymousParticipantCredential(
  input: AnonymousParticipantCredentialInput,
): AnonymousParticipantJoinReceipt | null {
  if (
    !validLiveSessionId(input.liveSessionId) ||
    input.sessionCode.trim().length === 0 ||
    input.participantToken.trim().length === 0
  ) {
    return null;
  }

  const credential: AnonymousParticipantCredential = {
    version: STORAGE_VERSION,
    liveSessionId: input.liveSessionId,
    sessionCode: input.sessionCode.trim().toUpperCase(),
    participantToken: input.participantToken,
  };

  try {
    window.sessionStorage.setItem(
      storageKey(input.liveSessionId),
      JSON.stringify(credential),
    );
    return {
      liveSessionId: credential.liveSessionId,
      sessionCode: credential.sessionCode,
    };
  } catch {
    return null;
  }
}

/** Read and validate one session-scoped credential; invalid records are removed. */
export function getAnonymousParticipantCredential(
  liveSessionId: string,
): AnonymousParticipantCredential | null {
  if (!validLiveSessionId(liveSessionId)) return null;

  try {
    const raw = window.sessionStorage.getItem(storageKey(liveSessionId));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isValidCredential(parsed, liveSessionId)) {
      removeAnonymousParticipantCredential(liveSessionId);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function removeAnonymousParticipantCredential(
  liveSessionId: string,
): void {
  if (!validLiveSessionId(liveSessionId)) return;
  try {
    window.sessionStorage.removeItem(storageKey(liveSessionId));
  } catch {
    /* unavailable */
  }
}

export function hasAnonymousParticipantCredential(
  liveSessionId: string,
): boolean {
  return getAnonymousParticipantCredential(liveSessionId) !== null;
}
