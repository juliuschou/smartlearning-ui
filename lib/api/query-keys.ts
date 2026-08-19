/**
 * React Query query-key factory.
 *
 * Centralized so mutation sites can invalidate the right cache without
 * re-stringifying keys ad hoc. Add new domains here.
 */
export const queryKeys = {
  session: ["session"] as const,
  accounts: {
    all: ["accounts"] as const,
    detail: (id: string) => ["accounts", id] as const,
  },
  myCourses: {
    all: ["my-courses"] as const,
  },
} as const;
