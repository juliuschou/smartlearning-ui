import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest, type ApiRequestError } from "@/lib/api/client";
import { queryKeys } from "@/lib/api/query-keys";
import type { CourseDto, CreateCoursePayload } from "@/lib/api/types";

/**
 * Create a Course via `POST /api/v1/courses`.
 *
 * Ownership and status are server-controlled. Rebuilding the body here keeps
 * runtime callers from forwarding fields outside the public request contract.
 * The successful server projection is the only source used to seed the detail
 * cache; no optimistic Course is created.
 */
export function useCreateCourse() {
  const queryClient = useQueryClient();

  return useMutation<CourseDto, ApiRequestError, CreateCoursePayload>({
    mutationFn: (payload) => {
      const body: CreateCoursePayload = { name: payload.name };
      if (payload.description !== undefined) {
        body.description = payload.description;
      }

      return apiRequest<CourseDto>("/courses", {
        method: "POST",
        body,
        mutate: true,
      });
    },
    onSuccess: (course) => {
      queryClient.setQueryData(queryKeys.courses.detail(course.id), course);
    },
  });
}

/** Fetch one server-authoritative Course projection by ID. */
export function useCourse(courseId: string) {
  return useQuery<CourseDto, ApiRequestError>({
    queryKey: queryKeys.courses.detail(courseId),
    queryFn: ({ signal }) =>
      apiRequest<CourseDto>(`/courses/${courseId}`, { signal }),
    enabled: Boolean(courseId),
    retry: false,
    staleTime: 30_000,
  });
}
