import { describe, expect, it, vi } from "vitest";
import {
  createPollSubmissionAttempt,
  getPollSubmissionAttempt,
  persistPollSubmissionAttempt,
  pollPayloadFingerprint,
  removePollSubmissionAttempt,
} from "@/features/live-student/poll-submission-attempt";

const sessionId = "01945f3e-0000-7000-8000-000000000010";
const questionId = "01945f3e-0000-7000-8000-000000000001";
const optionId = "01945f3e-0000-7000-8000-000000000002";

describe("poll submission attempts", () => {
  it("round-trips a durable attempt and removes it", () => {
    const attempt = createPollSubmissionAttempt(
      sessionId,
      questionId,
      optionId,
      [optionId],
    );
    expect(attempt).not.toBeNull();
    expect(persistPollSubmissionAttempt(attempt!)).toBe(true);
    expect(getPollSubmissionAttempt(sessionId, questionId, [optionId])).toEqual(
      attempt,
    );
    removePollSubmissionAttempt(sessionId, questionId);
    expect(
      getPollSubmissionAttempt(sessionId, questionId, [optionId]),
    ).toBeNull();
  });

  it("rejects stale option sets and malformed payload fingerprints", () => {
    const attempt = createPollSubmissionAttempt(
      sessionId,
      questionId,
      optionId,
      [optionId],
    );
    persistPollSubmissionAttempt(attempt!);
    expect(
      getPollSubmissionAttempt(sessionId, questionId, [optionId, optionId]),
    ).toBeNull();
    window.sessionStorage.setItem(
      `smartlearning:v1:poll-single:${sessionId}:${questionId}`,
      JSON.stringify({ ...attempt, payloadFingerprint: "{}" }),
    );
    expect(getPollSubmissionAttempt(sessionId, questionId)).toBeNull();
    expect(pollPayloadFingerprint(questionId, optionId)).toContain(optionId);
  });

  it("fails safely when sessionStorage is unavailable", () => {
    const getItem = vi
      .spyOn(Storage.prototype, "getItem")
      .mockImplementation(() => {
        throw new Error("blocked");
      });
    expect(getPollSubmissionAttempt(sessionId, questionId)).toBeNull();
    getItem.mockRestore();
  });
});
