import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  canonicalizeQuizOptionIds,
  createQuizSubmissionAttempt,
  getQuizSubmissionAttempt,
  persistQuizSubmissionAttempt,
  quizPayloadFingerprint,
  removeQuizSubmissionAttempt,
} from "@/features/live-student/quiz-submission-attempt";

const sessionId = "01945f3e-0000-7000-8000-000000000010";
const questionId = "01945f3e-0000-7000-8000-000000000001";
const firstId = "01945f3e-0000-7000-8000-000000000002";
const secondId = "01945f3e-0000-7000-8000-000000000003";
const thirdId = "01945f3e-0000-7000-8000-000000000004";
const options = [firstId, secondId, thirdId];
const anonymousStorageKey =
  "smartlearning:v3:quiz:anonymous:" + sessionId + ":" + questionId;

beforeEach(() => window.sessionStorage.clear());

describe("quiz submission attempts", () => {
  it("canonicalizes permutations and fingerprints the canonical payload", () => {
    expect(canonicalizeQuizOptionIds([thirdId, firstId], options)).toEqual([
      firstId,
      thirdId,
    ]);
    expect(quizPayloadFingerprint(questionId, [thirdId, firstId])).toBe(
      quizPayloadFingerprint(questionId, [firstId, thirdId]),
    );
  });

  it.each([
    ["empty", []],
    ["duplicate", [firstId, firstId]],
    ["unknown", ["01945f3e-0000-7000-8000-000000000099"]],
    ["invalid", ["not-an-id"]],
  ])("rejects %s option refs", (_label, selected) => {
    expect(canonicalizeQuizOptionIds(selected, options)).toBeNull();
    expect(
      createQuizSubmissionAttempt(sessionId, questionId, selected, options),
    ).toBeNull();
  });

  it("isolates stored attempts by actor, rejects stale sets, and round-trips/removes", () => {
    const attempt = createQuizSubmissionAttempt(
      sessionId,
      questionId,
      [secondId, firstId],
      options,
      "anonymous",
    );
    expect(attempt).not.toBeNull();
    expect(persistQuizSubmissionAttempt(attempt!)).toBe(true);
    expect(
      getQuizSubmissionAttempt(sessionId, questionId, options, "anonymous"),
    ).toEqual(attempt);
    expect(
      getQuizSubmissionAttempt(
        sessionId,
        questionId,
        [thirdId, firstId, secondId],
        "anonymous",
      ),
    ).toEqual(attempt);
    expect(
      getQuizSubmissionAttempt(sessionId, questionId, options, "student"),
    ).toBeNull();
    expect(
      getQuizSubmissionAttempt(sessionId, questionId, [firstId, secondId]),
    ).toBeNull();
    expect(
      removeQuizSubmissionAttempt(sessionId, questionId, "anonymous"),
    ).toBeUndefined();
    expect(
      getQuizSubmissionAttempt(sessionId, questionId, options, "anonymous"),
    ).toBeNull();
  });

  it("restores legacy v3 fingerprints without changing the replay payload or key", () => {
    const attempt = createQuizSubmissionAttempt(
      sessionId,
      questionId,
      [secondId, firstId],
      options,
      "anonymous",
    );
    expect(attempt).not.toBeNull();
    const legacyAttempt = {
      ...attempt!,
      optionSetFingerprint: JSON.stringify([thirdId, firstId, secondId]),
    };
    window.sessionStorage.setItem(
      anonymousStorageKey,
      JSON.stringify(legacyAttempt),
    );

    expect(
      getQuizSubmissionAttempt(
        sessionId,
        questionId,
        [secondId, thirdId, firstId],
        "anonymous",
      ),
    ).toEqual(legacyAttempt);
  });

  it.each([
    ["missing", [firstId, secondId]],
    [
      "extra",
      [firstId, secondId, thirdId, "01945f3e-0000-7000-8000-000000000099"],
    ],
  ])("removes attempts for a %s snapshot option set", (_label, snapshot) => {
    const attempt = createQuizSubmissionAttempt(
      sessionId,
      questionId,
      [firstId],
      options,
      "anonymous",
    );
    expect(persistQuizSubmissionAttempt(attempt!)).toBe(true);

    expect(
      getQuizSubmissionAttempt(sessionId, questionId, snapshot, "anonymous"),
    ).toBeNull();
    expect(window.sessionStorage.getItem(anonymousStorageKey)).toBeNull();
  });

  it("fails safely for malformed storage and storage failures", () => {
    window.sessionStorage.setItem(
      "smartlearning:v3:quiz:student:" + sessionId + ":" + questionId,
      "{}",
    );
    expect(getQuizSubmissionAttempt(sessionId, questionId, options)).toBeNull();
    const storage = window.sessionStorage;
    Object.defineProperty(window, "sessionStorage", {
      configurable: true,
      value: {
        ...storage,
        setItem: () => {
          throw new Error("blocked");
        },
      },
    });
    const attempt = createQuizSubmissionAttempt(
      sessionId,
      questionId,
      [firstId],
      options,
    );
    expect(persistQuizSubmissionAttempt(attempt!)).toBe(false);
    Object.defineProperty(window, "sessionStorage", {
      configurable: true,
      value: {
        ...storage,
        getItem: () => {
          throw new Error("blocked");
        },
      },
    });
    expect(getQuizSubmissionAttempt(sessionId, questionId, options)).toBeNull();
    Object.defineProperty(window, "sessionStorage", {
      configurable: true,
      value: {
        ...storage,
        removeItem: () => {
          throw new Error("blocked");
        },
      },
    });
    expect(() =>
      removeQuizSubmissionAttempt(sessionId, questionId),
    ).not.toThrow();
  });
});
