import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PropsWithChildren } from "react";
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import {
  courseEnrollmentsQueryOptions,
  myCoursesQueryOptions,
  normalizeStudentSearchQuery,
  studentSearchQueryOptions,
  useAddEnrollment,
  useCourseEnrollments,
  useMyCourses,
  useRemoveEnrollment,
  useStudentSearch,
} from "@/lib/api/enrollments";
import { queryKeys } from "@/lib/api/query-keys";
import { ApiRequestError } from "@/lib/api/client";
import type {
  AccountRole,
  EnrollmentDto,
  MyCourseDto,
  Page,
  StudentSearchResultDto,
} from "@/lib/api/types";

const mocks = vi.hoisted(() => ({
  apiRequest: vi.fn(),
  sessionRole: "student" as AccountRole | null,
}));

vi.mock("@/lib/api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/client")>();
  return { ...actual, apiRequest: mocks.apiRequest };
});

vi.mock("@/lib/auth/session", () => ({
  useSession: () => ({
    session: mocks.sessionRole
      ? {
          accountId: "student-1",
          username: "student-one",
          displayName: "Student One",
          role: mocks.sessionRole,
          canCreateCourse: false,
          mustChangePassword: false,
          sessionId: "session-1",
          expiresAt: "",
        }
      : null,
    isLoading: false,
    isAuthenticated: mocks.sessionRole !== null,
    refetch: vi.fn(),
  }),
}));

const apiRequestMock = mocks.apiRequest as unknown as Mock;

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: 3, retryDelay: 0 },
      mutations: { retry: false },
    },
  });
}

function wrapperFor(queryClient: QueryClient) {
  return function QueryWrapper({
    children,
  }: PropsWithChildren): React.JSX.Element {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

function myCoursesPage(rows: MyCourseDto[]): Page<MyCourseDto> {
  return {
    data: rows,
    meta: { page: 1, pageSize: 20, total: rows.length, totalPages: 1 },
  };
}

const course: MyCourseDto = {
  enrollmentId: "enrollment-1",
  courseId: "course-1",
  name: "微積分一",
  description: "基礎微積分",
  status: "draft",
  ownerAccountId: "teacher-1",
  enrolledAt: "2026-09-01T00:00:00.000Z",
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
  currentJoinableSession: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.sessionRole = "student";
});

describe("My courses transport hooks", () => {
  it("uses explicit default pagination and projects the inner Page", async () => {
    apiRequestMock.mockResolvedValueOnce(myCoursesPage([course]));

    const queryClient = makeQueryClient();
    const { result } = renderHook(() => useMyCourses(), {
      wrapper: wrapperFor(queryClient),
    });

    await waitFor(() => expect(result.current.courses).toEqual([course]));

    expect(apiRequestMock).toHaveBeenCalledTimes(1);
    expect(apiRequestMock).toHaveBeenCalledWith(
      "/me/courses?page=1&pageSize=20",
      { signal: expect.any(AbortSignal) },
    );
    expect(result.current.meta).toEqual({
      page: 1,
      pageSize: 20,
      total: 1,
      totalPages: 1,
    });
  });

  it("uses custom pagination and distinct cache keys", async () => {
    apiRequestMock.mockResolvedValueOnce(myCoursesPage([]));

    const defaultOptions = myCoursesQueryOptions();
    const customOptions = myCoursesQueryOptions({ page: 2, pageSize: 50 });
    const queryClient = makeQueryClient();
    const { result } = renderHook(
      () => useMyCourses({ page: 2, pageSize: 50 }),
      { wrapper: wrapperFor(queryClient) },
    );

    await waitFor(() => expect(result.current.meta).not.toBeNull());

    expect(defaultOptions.queryKey).toEqual(queryKeys.myCourses.list(1, 20));
    expect(customOptions.queryKey).toEqual(queryKeys.myCourses.list(2, 50));
    expect(defaultOptions.queryKey).not.toEqual(customOptions.queryKey);
    expect(queryKeys.myCourses.all).toEqual(["my-courses"]);
    expect(apiRequestMock).toHaveBeenCalledWith(
      "/me/courses?page=2&pageSize=50",
      { signal: expect.any(AbortSignal) },
    );
  });

  it.each([
    ["admin", "admin"],
    ["teacher", "teacher"],
    ["no session", null],
  ] as const)("does not fetch for %s", (_label, role) => {
    mocks.sessionRole = role;
    const queryClient = makeQueryClient();

    renderHook(() => useMyCourses(), {
      wrapper: wrapperFor(queryClient),
    });

    expect(apiRequestMock).not.toHaveBeenCalled();
  });

  it("preserves ApiRequestError identity and does not retry", async () => {
    const error = new ApiRequestError(
      {
        code: "RATE_LIMITED",
        message: "internal retry detail",
        blocking: true,
        field: "username",
        retryAfterSeconds: 12,
      },
      429,
    );
    apiRequestMock.mockRejectedValue(error);

    const queryClient = makeQueryClient();
    const { result } = renderHook(() => useMyCourses(), {
      wrapper: wrapperFor(queryClient),
    });

    await waitFor(() => expect(result.current.error).toBe(error));

    expect(apiRequestMock).toHaveBeenCalledTimes(1);
    expect(result.current.error).toMatchObject({
      code: "RATE_LIMITED",
      status: 429,
      field: "username",
      retryAfterSeconds: 12,
    });
  });

  it("transports the nullable currentJoinableSession discovery projection per row", async () => {
    const withSession = {
      ...course,
      currentJoinableSession: {
        id: "session-1",
        sessionCode: "ABCD12",
        status: "active" as const,
      },
    };
    const withoutSession = { ...course, courseId: "course-2" };
    apiRequestMock.mockResolvedValueOnce(
      myCoursesPage([withSession, withoutSession]),
    );

    const queryClient = makeQueryClient();
    const { result } = renderHook(() => useMyCourses(), {
      wrapper: wrapperFor(queryClient),
    });

    await waitFor(() => expect(result.current.courses).toHaveLength(2));

    expect(result.current.courses[0].currentJoinableSession).toEqual({
      id: "session-1",
      sessionCode: "ABCD12",
      status: "active",
    });
    expect(result.current.courses[1].currentJoinableSession).toBeNull();
    // Pagination/order are preserved unchanged.
    expect(result.current.meta).toEqual({
      page: 1,
      pageSize: 20,
      total: 2,
      totalPages: 1,
    });
  });
});

function rosterRow(status: EnrollmentDto["status"]): EnrollmentDto {
  return {
    id: `enrollment-${status}`,
    courseId: "course-1",
    studentAccountId: "student-1",
    status,
    enrolledAt: "2026-09-01T00:00:00.000Z",
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
    student: {
      id: "student-1",
      username: "student-one",
      displayName: "Student One",
    },
  };
}

function rosterPage(
  rows: EnrollmentDto[],
  meta: Page<EnrollmentDto>["meta"] = {
    page: 1,
    pageSize: 20,
    total: rows.length,
    totalPages: rows.length === 0 ? 0 : 1,
  },
): Page<EnrollmentDto> {
  return { data: rows, meta };
}

const searchResult: StudentSearchResultDto = {
  id: "student-1",
  username: "student-one",
  displayName: "Student One",
  enrollmentStatus: null,
};

function searchPage(
  rows: StudentSearchResultDto[],
  meta: Page<StudentSearchResultDto>["meta"] = {
    page: 1,
    pageSize: 20,
    total: rows.length,
    totalPages: rows.length === 0 ? 0 : 1,
  },
): Page<StudentSearchResultDto> {
  return { data: rows, meta };
}

describe("Teacher enrollment roster and student-search transport", () => {
  beforeEach(() => {
    mocks.sessionRole = "teacher";
  });

  it("allows admin sessions to fetch both course-scoped resources", async () => {
    mocks.sessionRole = "admin";
    apiRequestMock
      .mockResolvedValueOnce(rosterPage([]))
      .mockResolvedValueOnce(searchPage([]));
    const queryClient = makeQueryClient();

    renderHook(() => useCourseEnrollments("course-1"), {
      wrapper: wrapperFor(queryClient),
    });
    renderHook(() => useStudentSearch("course-1", { q: "ab" }), {
      wrapper: wrapperFor(queryClient),
    });

    await waitFor(() => expect(apiRequestMock).toHaveBeenCalledTimes(2));
    expect(apiRequestMock).toHaveBeenNthCalledWith(
      1,
      "/courses/course-1/enrollments?page=1&pageSize=20",
      { signal: expect.any(AbortSignal) },
    );
    expect(apiRequestMock).toHaveBeenNthCalledWith(
      2,
      "/courses/course-1/students/search?q=ab&page=1&pageSize=20",
      { signal: expect.any(AbortSignal) },
    );
  });

  it("fetches the course roster with default pagination and preserves server rows/meta", async () => {
    const rows = [rosterRow("active"), rosterRow("removed")];
    const page = rosterPage(rows, {
      page: 2,
      pageSize: 20,
      total: 22,
      totalPages: 2,
    });
    apiRequestMock.mockResolvedValueOnce(page);

    const queryClient = makeQueryClient();
    const { result } = renderHook(() => useCourseEnrollments("course-1"), {
      wrapper: wrapperFor(queryClient),
    });

    await waitFor(() => expect(result.current.data).toEqual(page));

    expect(apiRequestMock).toHaveBeenCalledWith(
      "/courses/course-1/enrollments?page=1&pageSize=20",
      { signal: expect.any(AbortSignal) },
    );
    expect(result.current.data?.data).toBe(rows);
    expect(result.current.data?.meta).toEqual(page.meta);
    expect(courseEnrollmentsQueryOptions("course-1").queryKey).toEqual(
      queryKeys.enrollments.list("course-1", 1, 20),
    );
  });

  it("uses custom roster pagination and isolates course/page cache keys", async () => {
    apiRequestMock.mockResolvedValueOnce(rosterPage([]));

    const options = courseEnrollmentsQueryOptions("course-1", {
      page: 3,
      pageSize: 100,
    });
    const otherCourse = courseEnrollmentsQueryOptions("course-2", {
      page: 3,
      pageSize: 100,
    });
    const queryClient = makeQueryClient();
    renderHook(
      () => useCourseEnrollments("course-1", { page: 3, pageSize: 100 }),
      { wrapper: wrapperFor(queryClient) },
    );

    await waitFor(() => expect(apiRequestMock).toHaveBeenCalledTimes(1));
    expect(apiRequestMock).toHaveBeenCalledWith(
      "/courses/course-1/enrollments?page=3&pageSize=100",
      { signal: expect.any(AbortSignal) },
    );
    expect(options.queryKey).toEqual(
      queryKeys.enrollments.list("course-1", 3, 100),
    );
    expect(options.queryKey).not.toEqual(otherCourse.queryKey);
    expect(queryKeys.enrollments.course("course-1")).toEqual([
      "enrollments",
      "course-1",
    ]);
  });

  it.each([
    ["empty course", ""],
    ["student session", "student"],
    ["no session", null],
  ] as const)("does not fetch the roster for %s", (_label, roleOrCourse) => {
    const courseId = roleOrCourse === "" ? "" : "course-1";
    mocks.sessionRole = roleOrCourse === "student" ? "student" : "teacher";
    if (roleOrCourse === null) mocks.sessionRole = null;

    const queryClient = makeQueryClient();
    const { result } = renderHook(() => useCourseEnrollments(courseId), {
      wrapper: wrapperFor(queryClient),
    });

    expect(result.current.fetchStatus).toBe("idle");
    expect(apiRequestMock).not.toHaveBeenCalled();
  });

  it("preserves roster ApiRequestError identity and does not retry", async () => {
    const error = new ApiRequestError(
      { code: "FORBIDDEN", message: "internal detail", blocking: true },
      403,
    );
    apiRequestMock.mockRejectedValue(error);

    const queryClient = makeQueryClient();
    const { result } = renderHook(() => useCourseEnrollments("course-1"), {
      wrapper: wrapperFor(queryClient),
    });

    await waitFor(() => expect(result.current.error).toBe(error));
    expect(apiRequestMock).toHaveBeenCalledTimes(1);
  });

  it("normalizes search q for both URL and key and encodes reserved Unicode", async () => {
    const raw = " é /& ";
    const normalized = "é /&";
    expect(normalizeStudentSearchQuery(raw)).toBe(normalized);
    apiRequestMock.mockResolvedValueOnce(searchPage([searchResult]));

    const queryClient = makeQueryClient();
    const { result } = renderHook(
      () => useStudentSearch("course-1", { q: raw, page: 2, pageSize: 100 }),
      { wrapper: wrapperFor(queryClient) },
    );

    await waitFor(() =>
      expect(result.current.data?.data).toEqual([searchResult]),
    );
    expect(apiRequestMock).toHaveBeenCalledWith(
      "/courses/course-1/students/search?q=%C3%A9+%2F%26&page=2&pageSize=100",
      { signal: expect.any(AbortSignal) },
    );
    expect(result.current.data?.data).toEqual([searchResult]);
    expect(
      studentSearchQueryOptions("course-1", { q: raw, page: 2, pageSize: 100 })
        .queryKey,
    ).toEqual(queryKeys.studentSearch.list("course-1", normalized, 2, 100));
  });

  it.each([
    ["empty", ""],
    ["one code point", "a"],
    ["over maximum", "x".repeat(101)],
    ["empty course", "valid"],
    ["student session", "valid"],
    ["no session", "valid"],
  ] as const)("does not fetch search for %s", (_label, qOrCourse) => {
    const isEmptyCourse = _label === "empty course";
    const courseId = isEmptyCourse ? "" : "course-1";
    if (_label === "student session") mocks.sessionRole = "student";
    if (_label === "no session") mocks.sessionRole = null;

    const queryClient = makeQueryClient();
    const { result } = renderHook(
      () => useStudentSearch(courseId, { q: qOrCourse }),
      { wrapper: wrapperFor(queryClient) },
    );

    expect(result.current.fetchStatus).toBe("idle");
    expect(apiRequestMock).not.toHaveBeenCalled();
  });

  it("preserves search ordering/meta and ApiRequestError without retry", async () => {
    const first = { ...searchResult, username: "alice" };
    const second = { ...searchResult, id: "student-2", username: "bob" };
    const page = searchPage([first, second], {
      page: 2,
      pageSize: 20,
      total: 22,
      totalPages: 2,
    });
    apiRequestMock.mockResolvedValueOnce(page);

    const queryClient = makeQueryClient();
    const { result } = renderHook(
      () => useStudentSearch("course-1", { q: "al", page: 2 }),
      { wrapper: wrapperFor(queryClient) },
    );
    await waitFor(() => expect(result.current.data).toEqual(page));
    expect(result.current.data?.data).toBe(page.data);
    expect(result.current.data?.meta).toBe(page.meta);

    const error = new ApiRequestError(
      { code: "RATE_LIMITED", message: "internal", blocking: true },
      429,
    );
    apiRequestMock.mockRejectedValueOnce(error);
    const failed = renderHook(() => useStudentSearch("course-1", { q: "zz" }), {
      wrapper: wrapperFor(makeQueryClient()),
    });
    await waitFor(() => expect(failed.result.current.error).toBe(error));
    expect(apiRequestMock).toHaveBeenCalledTimes(2);
  });

  it("conceals cached roster and search data when the role gate closes", async () => {
    const page = rosterPage([rosterRow("active")]);
    apiRequestMock
      .mockResolvedValueOnce(page)
      .mockResolvedValueOnce(searchPage([searchResult]));
    const queryClient = makeQueryClient();
    const roster = renderHook(() => useCourseEnrollments("course-1"), {
      wrapper: wrapperFor(queryClient),
    });
    const search = renderHook(() => useStudentSearch("course-1", { q: "al" }), {
      wrapper: wrapperFor(queryClient),
    });

    await waitFor(() => {
      expect(roster.result.current.data).toBe(page);
      expect(search.result.current.data?.data).toEqual([searchResult]);
    });

    mocks.sessionRole = "student";
    roster.rerender();
    search.rerender();

    expect(roster.result.current.data).toBeUndefined();
    expect(search.result.current.data).toBeUndefined();
  });

  it("adds with an allowlisted body, no optimistic row, and target-only invalidation", async () => {
    let resolveAdd!: (value: EnrollmentDto) => void;
    const pending = new Promise<EnrollmentDto>((resolve) => {
      resolveAdd = resolve;
    });
    apiRequestMock.mockReturnValueOnce(pending);
    const existing = rosterPage([rosterRow("removed")]);
    const queryClient = makeQueryClient();
    queryClient.setQueryData(
      queryKeys.enrollments.list("course-1", 1, 20),
      existing,
    );
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useAddEnrollment(), {
      wrapper: wrapperFor(queryClient),
    });
    const response = rosterRow("active");

    const variables = Object.assign(
      { courseId: "course-1", studentAccountId: "student-1" },
      { extra: "must-not-cross-boundary" },
    );
    act(() => {
      result.current.mutate(variables);
    });
    await waitFor(() => expect(result.current.isPending).toBe(true));
    expect(apiRequestMock).toHaveBeenCalledWith(
      "/courses/course-1/enrollments",
      {
        method: "POST",
        body: { studentAccountId: "student-1" },
        mutate: true,
      },
    );
    expect(
      queryClient.getQueryData(queryKeys.enrollments.list("course-1", 1, 20)),
    ).toBe(existing);
    expect(invalidateSpy).not.toHaveBeenCalled();

    resolveAdd(response);
    await waitFor(() => expect(result.current.data).toBe(response));
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: queryKeys.enrollments.course("course-1"),
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: queryKeys.studentSearch.course("course-1"),
    });
    expect(invalidateSpy).not.toHaveBeenCalledWith({
      queryKey: queryKeys.enrollments.course("course-2"),
    });
  });

  it("preserves failed add ApiRequestError identity and does not invalidate", async () => {
    const error = new ApiRequestError(
      { code: "COURSE_NOT_EDITABLE", message: "internal", blocking: true },
      409,
    );
    apiRequestMock.mockRejectedValueOnce(error);
    const queryClient = makeQueryClient();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useAddEnrollment(), {
      wrapper: wrapperFor(queryClient),
    });

    act(() => {
      result.current.mutate({
        courseId: "course-1",
        studentAccountId: "student-1",
      });
    });
    await waitFor(() => expect(result.current.error).toBe(error));
    expect(invalidateSpy).not.toHaveBeenCalled();
  });

  it("removes with bodyless DELETE, returns null, and invalidates without optimistic deletion", async () => {
    apiRequestMock.mockResolvedValueOnce(null);
    const existing = rosterPage([rosterRow("active")]);
    const queryClient = makeQueryClient();
    queryClient.setQueryData(
      queryKeys.enrollments.list("course-1", 1, 20),
      existing,
    );
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useRemoveEnrollment(), {
      wrapper: wrapperFor(queryClient),
    });

    act(() => {
      result.current.mutate({
        courseId: "course-1",
        studentAccountId: "student-1",
      });
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(apiRequestMock).toHaveBeenCalledWith(
      "/courses/course-1/enrollments/student-1",
      { method: "DELETE", mutate: true },
    );
    expect(result.current.data).toBeNull();
    expect(
      queryClient.getQueryData(queryKeys.enrollments.list("course-1", 1, 20)),
    ).toBe(existing);
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: queryKeys.enrollments.course("course-1"),
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: queryKeys.studentSearch.course("course-1"),
    });
  });
});
