import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  canonicalizePollMultipleOptionIds,
  createPollMultipleSubmissionAttempt,
  getPollMultipleSubmissionAttempt,
  persistPollMultipleSubmissionAttempt,
  pollMultiplePayloadFingerprint,
  removePollMultipleSubmissionAttempt,
} from "@/features/live-student/poll-multiple-submission-attempt";

const sessionId = "01945f3e-0000-7000-8000-000000000010";
const questionId = "01945f3e-0000-7000-8000-000000000001";
const firstId = "01945f3e-0000-7000-8000-000000000002";
const secondId = "01945f3e-0000-7000-8000-000000000003";
const thirdId = "01945f3e-0000-7000-8000-000000000004";
const options = [firstId, secondId, thirdId];

beforeEach(() => window.sessionStorage.clear());

describe("poll multiple submission attempts", () => {
  it("canonicalizes permutations and fingerprints the canonical payload", () => {
    expect(
      canonicalizePollMultipleOptionIds([thirdId, firstId], options),
    ).toEqual([firstId, thirdId]);
    expect(pollMultiplePayloadFingerprint(questionId, [thirdId, firstId])).toBe(
      pollMultiplePayloadFingerprint(questionId, [firstId, thirdId]),
    );
  });

  it.each([
    ["empty", []],
    ["duplicate", [firstId, firstId]],
    ["unknown", ["01945f3e-0000-7000-8000-000000000099"]],
    ["invalid", ["not-an-id"]],
  ])("rejects %s option refs", (_label, selected) => {
    expect(canonicalizePollMultipleOptionIds(selected, options)).toBeNull();
    expect(
      createPollMultipleSubmissionAttempt(
        sessionId,
        questionId,
        selected,
        options,
      ),
    ).toBeNull();
  });

  it("isolates stored attempts by actor, rejects stale sets, and round-trips/removes", () => {
    const attempt = createPollMultipleSubmissionAttempt(
      sessionId,
      questionId,
      [secondId, firstId],
      options,
      "anonymous",
    );
    expect(attempt).not.toBeNull();
    expect(persistPollMultipleSubmissionAttempt(attempt!)).toBe(true);
    expect(
      getPollMultipleSubmissionAttempt(
        sessionId,
        questionId,
        options,
        "anonymous",
      ),
    ).toEqual(attempt);
    expect(
      getPollMultipleSubmissionAttempt(
        sessionId,
        questionId,
        options,
        "student",
      ),
    ).toBeNull();
    expect(
      getPollMultipleSubmissionAttempt(sessionId, questionId, [
        firstId,
        secondId,
      ]),
    ).toBeNull();
    expect(
      removePollMultipleSubmissionAttempt(sessionId, questionId, "anonymous"),
    ).toBeUndefined();
    expect(
      getPollMultipleSubmissionAttempt(
        sessionId,
        questionId,
        options,
        "anonymous",
      ),
    ).toBeNull();
  });

  it("fails safely for malformed storage and storage failures", () => {
    window.sessionStorage.setItem(
      "smartlearning:v3:poll-multiple:student:" + sessionId + ":" + questionId,
      "{}",
    );
    expect(
      getPollMultipleSubmissionAttempt(sessionId, questionId, options),
    ).toBeNull();
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
    const attempt = createPollMultipleSubmissionAttempt(
      sessionId,
      questionId,
      [firstId],
      options,
    );
    expect(persistPollMultipleSubmissionAttempt(attempt!)).toBe(false);
    Object.defineProperty(window, "sessionStorage", {
      configurable: true,
      value: {
        ...storage,
        getItem: () => {
          throw new Error("blocked");
        },
      },
    });
    expect(
      getPollMultipleSubmissionAttempt(sessionId, questionId, options),
    ).toBeNull();
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
      removePollMultipleSubmissionAttempt(sessionId, questionId),
    ).not.toThrow();
  });
});
