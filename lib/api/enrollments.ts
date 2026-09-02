import { queryOptions, useQuery } from "@tanstack/react-query";
import { apiRequest, type ApiRequestError } from "@/lib/api/client";
import { queryKeys } from "@/lib/api/query-keys";
import { useSession } from "@/lib/auth/session";
import type { MyCourseDto, Page } from "@/lib/api/types";

/** Parameters for the student's paginated active course roster. */
export interface MyCoursesParams {
  page?: number;
  pageSize?: number;
}

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 20;

function normalizeMyCoursesParams({
  page = DEFAULT_PAGE,
  pageSize = DEFAULT_PAGE_SIZE,
}: MyCoursesParams = {}) {
  return { page, pageSize };
}

/**
 * My active course roster — `GET /api/v1/me/courses` (envelope-unwrapped to
 * `Page<MyCourseDto>`). Backend guard: Session + StudentGuard, so the endpoint
 * 403s for non-students. The query is therefore `enabled` only when the current
 * session role is `student`, avoiding a guaranteed 403 for admin/teacher
 * sessions. The hook still returns the query object so callers can render
 * loading/error states uniformly.
 */
export function myCoursesQueryOptions(params: MyCoursesParams = {}) {
  const { page, pageSize } = normalizeMyCoursesParams(params);
  const searchParams = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
  });

  return queryOptions<Page<MyCourseDto>>({
    queryKey: queryKeys.myCourses.list(page, pageSize),
    queryFn: ({ signal }) =>
      apiRequest<Page<MyCourseDto>>(`/me/courses?${searchParams}`, { signal }),
    retry: false,
    staleTime: 30_000,
  });
}

/** React hook returning the authenticated student's active course roster. */
export function useMyCourses(params: MyCoursesParams = {}) {
  const { session } = useSession();
  const query = useQuery({
    ...myCoursesQueryOptions(params),
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
