"use client";

import { ErrorAlert } from "@/components/ui/ErrorAlert";
import { useMyCourses } from "@/lib/api/enrollments";
import type { MyCourseDto } from "@/lib/api/types";

/**
 * Client view for the student's active course roster (`GET /me/courses`).
 *
 * Three render states:
 *  - loading: placeholder while the query fetches.
 *  - error: stable localized message via `ErrorAlert` (classified by code).
 *  - data: a list of course cards (name, description, status, enrolledAt);
 *    an empty roster renders an actionable empty state.
 *
 * Dates are rendered as UTC ISO for determinism; a localized formatter can be
 * introduced later without changing the data contract.
 */
export function MyCoursesView() {
  const { courses, isLoading, error } = useMyCourses();

  if (isLoading) {
    return <p className="text-sm text-zinc-600 dark:text-zinc-400">載入中…</p>;
  }

  if (error) {
    return <ErrorAlert error={error} id="my-courses-error" />;
  }

  if (courses.length === 0) {
    return (
      <p className="rounded-md border border-zinc-200 px-4 py-6 text-center text-sm text-zinc-600 dark:border-zinc-800 dark:text-zinc-400">
        尚未加選任何課程。加選由老師或管理員操作，請聯絡你的授課老師。
      </p>
    );
  }

  return (
    <ul className="space-y-3" aria-label="我的課程列表">
      {courses.map((course) => (
        <li key={course.courseId}>
          <CourseCard course={course} />
        </li>
      ))}
    </ul>
  );
}

function CourseCard({ course }: { course: MyCourseDto }) {
  return (
    <article className="rounded-md border border-zinc-200 px-4 py-3 dark:border-zinc-800">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
          {course.name}
        </h2>
        <span className="shrink-0 text-xs text-zinc-500 dark:text-zinc-400">
          {course.status}
        </span>
      </div>
      {course.description ? (
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          {course.description}
        </p>
      ) : null}
      <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
        加選時間：{course.enrolledAt}
      </p>
    </article>
  );
}
