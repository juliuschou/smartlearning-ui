import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { apiRequest, type ApiRequestError } from "@/lib/api/client";
import { queryKeys } from "@/lib/api/query-keys";
import { useSession } from "@/lib/auth/session";
import type {
  AccountRole,
  CreateEnrollmentPayload,
  EnrollmentDto,
  MyCourseDto,
  Page,
  StudentSearchResultDto,
} from "@/lib/api/types";

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
 *
 * FE-4.1: each row carries the nullable `currentJoinableSession` discovery
 * projection. It rides on the existing paginated response; pagination/order
 * are unchanged.
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

/** Parameters for a teacher/admin course enrollment roster page. */
export interface CourseEnrollmentsParams {
  page?: number;
  pageSize?: number;
}

/** Parameters for course-scoped active-student search. */
export interface StudentSearchParams {
  q?: string;
  page?: number;
  pageSize?: number;
}

/** Variables for adding or reactivating a course enrollment. */
export interface AddEnrollmentVariables extends CreateEnrollmentPayload {
  courseId: string;
}

/** Variables for idempotently removing a course enrollment. */
export interface RemoveEnrollmentVariables {
  courseId: string;
  studentAccountId: string;
}

function normalizePagination({
  page = DEFAULT_PAGE,
  pageSize = DEFAULT_PAGE_SIZE,
}: CourseEnrollmentsParams = {}) {
  return { page, pageSize };
}

/** Normalize search terms exactly as required by the student-search contract. */
export function normalizeStudentSearchQuery(q = ""): string {
  return q.normalize("NFC").trim();
}

function isValidStudentSearchQuery(q: string): boolean {
  const length = Array.from(q).length;
  return length >= 2 && length <= 100;
}

function isTeacherOrAdmin(role: AccountRole | undefined): boolean {
  return role === "teacher" || role === "admin";
}

async function invalidateCourseEnrollmentCaches(
  queryClient: ReturnType<typeof useQueryClient>,
  courseId: string,
): Promise<void> {
  // Search returns course-relative enrollmentStatus, so roster mutations can
  // change search projections and must invalidate this course's search pages.
  await Promise.all([
    queryClient.invalidateQueries({
      queryKey: queryKeys.enrollments.course(courseId),
    }),
    queryClient.invalidateQueries({
      queryKey: queryKeys.studentSearch.course(courseId),
    }),
  ]);
}

/** Query options for a teacher/admin course roster page. */
export function courseEnrollmentsQueryOptions(
  courseId: string,
  params: CourseEnrollmentsParams = {},
) {
  const { page, pageSize } = normalizePagination(params);
  const searchParams = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
  });

  return queryOptions<Page<EnrollmentDto>, ApiRequestError>({
    queryKey: queryKeys.enrollments.list(courseId, page, pageSize),
    queryFn: ({ signal }) =>
      apiRequest<Page<EnrollmentDto>>(
        `/courses/${courseId}/enrollments?${searchParams}`,
        { signal },
      ),
    enabled: Boolean(courseId),
    retry: false,
    staleTime: 30_000,
  });
}

/** Fetch the course roster only for an authenticated teacher/admin. */
export function useCourseEnrollments(
  courseId: string,
  params: CourseEnrollmentsParams = {},
) {
  const { session } = useSession();
  const options = courseEnrollmentsQueryOptions(courseId, params);
  const canRead = Boolean(courseId) && isTeacherOrAdmin(session?.role);
  const query = useQuery({
    ...options,
    enabled: options.enabled !== false && canRead,
  });

  return {
    ...query,
    // React Query retains data when `enabled` changes to false. Never expose a
    // previously authorized roster to a session that is no longer allowed.
    data: canRead ? query.data : undefined,
  };
}

/** Query options for teacher/admin course-scoped student search. */
export function studentSearchQueryOptions(
  courseId: string,
  params: StudentSearchParams = {},
) {
  const q = normalizeStudentSearchQuery(params.q);
  const { page, pageSize } = normalizePagination(params);
  const searchParams = new URLSearchParams({
    q,
    page: String(page),
    pageSize: String(pageSize),
  });

  return queryOptions<Page<StudentSearchResultDto>, ApiRequestError>({
    queryKey: queryKeys.studentSearch.list(courseId, q, page, pageSize),
    queryFn: ({ signal }) =>
      apiRequest<Page<StudentSearchResultDto>>(
        `/courses/${courseId}/students/search?${searchParams}`,
        { signal },
      ),
    enabled: Boolean(courseId) && isValidStudentSearchQuery(q),
    retry: false,
    staleTime: 30_000,
  });
}

/** Search active student accounts only for an authorized teacher/admin. */
export function useStudentSearch(
  courseId: string,
  params: StudentSearchParams = {},
) {
  const { session } = useSession();
  const options = studentSearchQueryOptions(courseId, params);
  const canRead =
    Boolean(courseId) &&
    options.enabled !== false &&
    isTeacherOrAdmin(session?.role);
  const query = useQuery({
    ...options,
    enabled: options.enabled !== false && canRead,
  });

  return {
    ...query,
    // Do not surface cached search results after auth/session role changes.
    data: canRead ? query.data : undefined,
  };
}

/** Add or reactivate an enrollment using the server-authoritative response. */
export function useAddEnrollment() {
  const queryClient = useQueryClient();
  return useMutation<EnrollmentDto, ApiRequestError, AddEnrollmentVariables>({
    mutationFn: ({ courseId, studentAccountId }) =>
      apiRequest<EnrollmentDto>(`/courses/${courseId}/enrollments`, {
        method: "POST",
        body: { studentAccountId },
        mutate: true,
      }),
    onSuccess: async (_enrollment, variables) => {
      await invalidateCourseEnrollmentCaches(queryClient, variables.courseId);
    },
  });
}

/** Idempotently mark an enrollment removed; no client-side course-state gate. */
export function useRemoveEnrollment() {
  const queryClient = useQueryClient();
  return useMutation<null, ApiRequestError, RemoveEnrollmentVariables>({
    mutationFn: ({ courseId, studentAccountId }) =>
      apiRequest<null>(`/courses/${courseId}/enrollments/${studentAccountId}`, {
        method: "DELETE",
        mutate: true,
      }),
    onSuccess: async (_result, variables) => {
      await invalidateCourseEnrollmentCaches(queryClient, variables.courseId);
    },
  });
}
