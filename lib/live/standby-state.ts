/**
 * Shared activity state for admin and learner clients.
 * Timestamps are ISO 8601 strings including a timezone offset (or Z).
 */
export type StandbyStatus = "waiting" | "upcoming" | "inProgress" | "ended";

export interface StandbyState {
  /** Stable identifier for the activity. */
  activityId: string;
  /** Human-readable activity name. */
  activityName: string;
  /** Current business state, independent of the socket connection state. */
  status: StandbyStatus;
  /** Planned start time. */
  scheduledStartAt: string;
  /** Planned end time, if one has been set. */
  scheduledEndAt: string | null;
  /** Actual start time; null until the activity starts. */
  actualStartAt: string | null;
  /** Actual end time; null until the activity ends. */
  actualEndAt: string | null;
}
