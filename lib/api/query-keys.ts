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
} as const;
