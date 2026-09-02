import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PropsWithChildren } from "react";
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { myCoursesQueryOptions, useMyCourses } from "@/lib/api/enrollments";
import { queryKeys } from "@/lib/api/query-keys";
import { ApiRequestError } from "@/lib/api/client";
import type { AccountRole, MyCourseDto, Page } from "@/lib/api/types";

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
});
