import { beforeEach, describe, expect, it } from "vitest";
import {
  getAnonymousParticipantCredential,
  hasAnonymousParticipantCredential,
  persistAnonymousParticipantCredential,
  removeAnonymousParticipantCredential,
} from "@/lib/live/anonymous-participant-credential";

const liveSessionId = "018f0f54-7b7b-7b7b-8b7b-7b7b7b7b7b7b";
const otherLiveSessionId = "018f0f54-7b7b-7b7b-8b7b-7b7b7b7b7b7c";

beforeEach(() => {
  window.sessionStorage.clear();
});

describe("anonymous participant credential store", () => {
  it("persists a validated credential and returns a token-free receipt", () => {
    const receipt = persistAnonymousParticipantCredential({
      liveSessionId,
      sessionCode: " abcd2345 ",
      participantToken: "participant-secret",
    });

    expect(receipt).toEqual({ liveSessionId, sessionCode: "ABCD2345" });
    expect(receipt).not.toHaveProperty("participantToken");
    expect(getAnonymousParticipantCredential(liveSessionId)).toEqual({
      version: 1,
      liveSessionId,
      sessionCode: "ABCD2345",
      participantToken: "participant-secret",
    });
  });

  it("scopes credentials to their live session", () => {
    persistAnonymousParticipantCredential({
      liveSessionId,
      sessionCode: "ABCD2345",
      participantToken: "participant-secret",
    });

    expect(getAnonymousParticipantCredential(otherLiveSessionId)).toBeNull();
    expect(hasAnonymousParticipantCredential(liveSessionId)).toBe(true);
  });

  it("removes malformed or mismatched records", () => {
    const key = `smartlearning:v1:anonymous-participant:${liveSessionId}`;
    window.sessionStorage.setItem(
      key,
      JSON.stringify({
        version: 1,
        liveSessionId: otherLiveSessionId,
        sessionCode: "ABCD2345",
        participantToken: "participant-secret",
      }),
    );

    expect(getAnonymousParticipantCredential(liveSessionId)).toBeNull();
    expect(window.sessionStorage.getItem(key)).toBeNull();
  });

  it("rejects invalid input without writing storage", () => {
    expect(
      persistAnonymousParticipantCredential({
        liveSessionId: "not-an-id",
        sessionCode: "ABCD2345",
        participantToken: "participant-secret",
      }),
    ).toBeNull();
    expect(window.sessionStorage.length).toBe(0);
  });

  it("removes only the requested session credential", () => {
    persistAnonymousParticipantCredential({
      liveSessionId,
      sessionCode: "ABCD2345",
      participantToken: "participant-secret",
    });
    persistAnonymousParticipantCredential({
      liveSessionId: otherLiveSessionId,
      sessionCode: "EFGH2345",
      participantToken: "other-secret",
    });

    removeAnonymousParticipantCredential(liveSessionId);

    expect(hasAnonymousParticipantCredential(liveSessionId)).toBe(false);
    expect(hasAnonymousParticipantCredential(otherLiveSessionId)).toBe(true);
  });
});
