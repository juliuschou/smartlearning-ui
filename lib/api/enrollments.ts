import { queryOptions, useQuery } from "@tanstack/react-query";
import { apiRequest, type ApiRequestError } from "@/lib/api/client";
import { queryKeys } from "@/lib/api/query-keys";
import { useSession } from "@/lib/auth/session";
import type { MyCourseDto, Page } from "@/lib/api/types";

/**
 * My active course roster — `GET /api/v1/me/courses` (envelope-unwrapped to
 * `Page<MyCourseDto>`). Backend guard: Session + StudentGuard, so the endpoint
 * 403s for non-students. The query is therefore `enabled` only when the current
 * session role is `student`, avoiding a guaranteed 403 for admin/teacher
 * sessions. The hook still returns the query object so callers can render
 * loading/error states uniformly.
 */

export const myCoursesQueryOptions = queryOptions<Page<MyCourseDto>>({
  queryKey: queryKeys.myCourses.all,
  queryFn: ({ signal }) =>
    apiRequest<Page<MyCourseDto>>("/me/courses", { signal }),
  retry: false,
  staleTime: 30_000,
});

/** React hook returning the authenticated student's active course roster. */
export function useMyCourses() {
  const { session } = useSession();
  const query = useQuery({
    ...myCoursesQueryOptions,
    enabled: session?.role === "student",
  });
  return {
    courses: query.isSuccess ? query.data.data : [],
    meta: query.isSuccess ? query.data.meta : null,
    isLoading: query.isLoading,
    // `apiRequest` only ever throws `ApiRequestError`; narrow the query's
    // generic `Error` so callers can feed it directly to `ErrorAlert`.
    error: (query.error as ApiRequestError | null) ?? null,
    refetch: query.refetch,
  };
}
