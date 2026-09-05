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
    list: (page: number, pageSize: number) =>
      ["accounts", "list", page, pageSize] as const,
    detail: (id: string) => ["accounts", id] as const,
  },
  courses: {
    all: ["courses"] as const,
    detail: (id: string) => ["courses", id] as const,
  },
  myCourses: {
    all: ["my-courses"] as const,
    list: (page: number, pageSize: number) =>
      ["my-courses", "list", page, pageSize] as const,
  },
  enrollments: {
    all: ["enrollments"] as const,
    course: (courseId: string) => ["enrollments", courseId] as const,
    list: (courseId: string, page: number, pageSize: number) =>
      ["enrollments", courseId, "list", page, pageSize] as const,
  },
  studentSearch: {
    all: ["student-search"] as const,
    course: (courseId: string) => ["student-search", courseId] as const,
    list: (courseId: string, q: string, page: number, pageSize: number) =>
      ["student-search", courseId, "list", q, page, pageSize] as const,
  },
  liveSessions: {
    all: ["live-sessions"] as const,
    detail: (id: string) => ["live-sessions", id] as const,
    results: (id: string, sessionQuestionId: string) =>
      ["live-sessions", id, "results", sessionQuestionId] as const,
  },
  // FE-4.1 — participant (learner) transport. Deliberately separate from the
  // teacher `liveSessions` namespace so a learner snapshot can never collide
  // with the teacher detail projection in the cache.
  participantLiveSessions: {
    all: ["participant-live-sessions"] as const,
    session: (actorOrId: "student" | "anonymous" | string, id?: string) => {
      const actor = id === undefined ? "student" : actorOrId;
      const liveSessionId = id ?? actorOrId;
      return ["participant-live-sessions", actor, liveSessionId] as const;
    },
    snapshot: (actorOrId: "student" | "anonymous" | string, id?: string) => {
      const actor = id === undefined ? "student" : actorOrId;
      const liveSessionId = id ?? actorOrId;
      return [
        "participant-live-sessions",
        actor,
        liveSessionId,
        "snapshot",
      ] as const;
    },
    studentStatus: (id: string) =>
      ["participant-live-sessions", "student", id, "student-status"] as const,
    results: (
      actorOrId: "student" | "anonymous" | string,
      idOrQuestionId: string,
      questionId?: string,
    ) => {
      const actor = questionId === undefined ? "student" : actorOrId;
      const liveSessionId =
        questionId === undefined ? actorOrId : idOrQuestionId;
      const sessionQuestionId = questionId ?? idOrQuestionId;
      return [
        "participant-live-sessions",
        actor,
        liveSessionId,
        "results",
        sessionQuestionId,
      ] as const;
    },
  },
} as const;
