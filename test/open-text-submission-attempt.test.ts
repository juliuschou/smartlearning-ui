import { beforeEach, describe, expect, it } from "vitest";
import {
  createOpenTextSubmissionAttempt,
  getOpenTextSubmissionAttempt,
  isValidOpenTextAnswer,
  normalizeOpenText,
  openTextCodePointLength,
  persistOpenTextSubmissionAttempt,
  removeOpenTextSubmissionAttempt,
} from "@/features/live-student/open-text-submission-attempt";

const sessionId = "01945f3e-0000-7000-8000-000000000010";
const questionId = "01945f3e-0000-7000-8000-000000000001";

beforeEach(() => window.sessionStorage.clear());

describe("open-text submission attempts", () => {
  it("matches backend normalization, including NFC, whitespace, and newlines", () => {
    expect(normalizeOpenText("  é\n\t　答案  ")).toBe("é 答案");
  });

  it("counts Unicode code points rather than UTF-16 units", () => {
    expect(openTextCodePointLength("😀")).toBe(1);
    expect(openTextCodePointLength("😀a")).toBe(2);
  });

  it("validates normalized answers at the 1–2,000 code-point boundary", () => {
    expect(isValidOpenTextAnswer(" \n ")).toBe(false);
    expect(isValidOpenTextAnswer("😀".repeat(2_000))).toBe(true);
    expect(isValidOpenTextAnswer("😀".repeat(2_001))).toBe(false);
  });

  it("round-trips raw editing text and normalized replay text per actor", () => {
    const attempt = createOpenTextSubmissionAttempt(
      sessionId,
      questionId,
      "第一行\n第二行",
      "anonymous",
    );
    expect(attempt).not.toBeNull();
    expect(persistOpenTextSubmissionAttempt(attempt!)).toBe(true);
    expect(
      getOpenTextSubmissionAttempt(sessionId, questionId, "anonymous"),
    ).toEqual(attempt);
    expect(
      getOpenTextSubmissionAttempt(sessionId, questionId, "student"),
    ).toBeNull();
    removeOpenTextSubmissionAttempt(sessionId, questionId, "anonymous");
    expect(
      getOpenTextSubmissionAttempt(sessionId, questionId, "anonymous"),
    ).toBeNull();
  });

  it("fails closed for corrupt storage", () => {
    window.sessionStorage.setItem(
      `smartlearning:v3:open-text:student:${sessionId}:${questionId}`,
      JSON.stringify({ version: 3, rawText: "答案" }),
    );
    expect(getOpenTextSubmissionAttempt(sessionId, questionId)).toBeNull();
  });
});
