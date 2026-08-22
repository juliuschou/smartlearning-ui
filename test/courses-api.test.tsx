import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PropsWithChildren } from "react";
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { useCourse, useCreateCourse } from "@/lib/api/courses";
import { queryKeys } from "@/lib/api/query-keys";
import type { CourseDto, CreateCoursePayload } from "@/lib/api/types";

vi.mock("@/lib/api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/client")>();
  return {
    ...actual,
    apiRequest: vi.fn(),
  };
});

import { ApiRequestError, apiRequest } from "@/lib/api/client";

const course: CourseDto = {
  id: "course-1",
  name: "微積分一",
  description: "基礎微積分",
  status: "draft",
  ownerAccountId: "teacher-1",
  createdAt: "2026-08-22T00:00:00.000Z",
  updatedAt: "2026-08-22T00:00:00.000Z",
};

const apiRequestMock = apiRequest as unknown as Mock;

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

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Course transport hooks", () => {
  it("reconstructs the create body and seeds detail cache only after success", async () => {
    let resolveCreate!: (value: CourseDto) => void;
    const pendingCreate = new Promise<CourseDto>((resolve) => {
      resolveCreate = resolve;
    });
    apiRequestMock.mockReturnValueOnce(pendingCreate);

    const queryClient = makeQueryClient();
    const { result } = renderHook(() => useCreateCourse(), {
      wrapper: wrapperFor(queryClient),
    });
    const payload = {
      name: "微積分一",
      description: "基礎微積分",
      ownerAccountId: "attacker-account",
      status: "archived",
      teacherId: "attacker-teacher",
      extra: "must-not-cross-boundary",
    } as unknown as CreateCoursePayload;

    act(() => {
      result.current.mutate(payload);
    });

    await waitFor(() => expect(result.current.isPending).toBe(true));
    expect(
      queryClient.getQueryData(queryKeys.courses.detail(course.id)),
    ).toBeUndefined();
    expect(apiRequestMock).toHaveBeenCalledWith("/courses", {
      method: "POST",
      body: { name: "微積分一", description: "基礎微積分" },
      mutate: true,
    });

    resolveCreate(course);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(
      queryClient.getQueryData(queryKeys.courses.detail(course.id)),
    ).toEqual(course);
  });

  it("omits an undefined description from the create body", async () => {
    apiRequestMock.mockResolvedValueOnce(course);

    const queryClient = makeQueryClient();
    const { result } = renderHook(() => useCreateCourse(), {
      wrapper: wrapperFor(queryClient),
    });

    act(() => {
      result.current.mutate({ name: "沒有說明的課程" });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(apiRequestMock).toHaveBeenCalledWith("/courses", {
      method: "POST",
      body: { name: "沒有說明的課程" },
      mutate: true,
    });
  });

  it("fetches a detail DTO with the ID path, abort signal, and detail key", async () => {
    apiRequestMock.mockResolvedValueOnce(course);

    const queryClient = makeQueryClient();
    const { result } = renderHook(() => useCourse(course.id), {
      wrapper: wrapperFor(queryClient),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(apiRequestMock).toHaveBeenCalledTimes(1);
    expect(apiRequestMock).toHaveBeenCalledWith(
      "/courses/course-1",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(queryKeys.courses.all).toEqual(["courses"]);
    expect(queryKeys.courses.detail(course.id)).toEqual(["courses", course.id]);
    expect(result.current.data).toEqual(course);
    expect(
      queryClient.getQueryData(queryKeys.courses.detail(course.id)),
    ).toEqual(course);
  });

  it("does not fetch when the detail ID is empty", () => {
    const queryClient = makeQueryClient();
    const { result } = renderHook(() => useCourse(""), {
      wrapper: wrapperFor(queryClient),
    });

    expect(result.current.fetchStatus).toBe("idle");
    expect(apiRequestMock).not.toHaveBeenCalled();
  });

  it("exposes ApiRequestError without retrying the detail request", async () => {
    const error = new ApiRequestError(
      {
        code: "FORBIDDEN",
        message: "internal backend detail",
        blocking: true,
      },
      403,
    );
    apiRequestMock.mockRejectedValueOnce(error);

    const queryClient = makeQueryClient();
    const { result } = renderHook(() => useCourse(course.id), {
      wrapper: wrapperFor(queryClient),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.error).toBeInstanceOf(ApiRequestError);
    expect(result.current.error).toBe(error);
    expect(apiRequestMock).toHaveBeenCalledTimes(1);
  });
});
