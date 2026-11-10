import { describe, expect, it } from "vitest";
import type { StandbyState, StandbyStatus } from "@/lib/live/standby-state";

const statusExamples: StandbyStatus[] = ["waiting", "upcoming", "inProgress", "ended"];

const waitingState = {
  activityId: "activity-42",
  activityName: "數學測驗",
  status: "waiting",
  scheduledStartAt: "2026-11-10T10:00:00+08:00",
  scheduledEndAt: "2026-11-10T10:30:00+08:00",
  actualStartAt: null,
  actualEndAt: null,
} satisfies StandbyState;

const endedState = {
  ...waitingState,
  status: "ended",
  actualStartAt: "2026-11-10T10:02:00+08:00",
  actualEndAt: "2026-11-10T10:32:00+08:00",
} satisfies StandbyState;

describe("shared standby state contract", () => {
  it("lists each supported activity status", () => {
    expect(statusExamples).toEqual(["waiting", "upcoming", "inProgress", "ended"]);
  });

  it("allows actual timestamps to be empty before the activity begins", () => {
    expect(waitingState.actualStartAt).toBeNull();
    expect(waitingState.actualEndAt).toBeNull();
  });

  it("supports actual timestamps once the activity has ended", () => {
    expect(endedState.actualStartAt).toBe("2026-11-10T10:02:00+08:00");
    expect(endedState.actualEndAt).toBe("2026-11-10T10:32:00+08:00");
  });
});
