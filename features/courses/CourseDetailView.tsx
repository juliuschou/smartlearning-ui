"use client";

import { ErrorAlert } from "@/components/ui/ErrorAlert";
import { ApiRequestError } from "@/lib/api/client";
import { useCourse } from "@/lib/api/courses";

/**
 * Server-backed Course detail projection — US-F0 CP4.
 *
 * A 404 deliberately uses a Course-generic message so callers cannot infer
 * whether a different teacher's Course exists. Other errors stay on the
 * stable-code ErrorAlert path and never render the backend message.
 */
export function CourseDetailView({ courseId }: { courseId: string }) {
  const { data: course, error, isLoading } = useCourse(courseId);

  if (isLoading) {
    return (
      <p
        role="status"
        aria-live="polite"
        className="text-sm text-zinc-600 dark:text-zinc-400"
      >
        載入課程詳情中…
      </p>
    );
  }

  if (error instanceof ApiRequestError && error.status === 404) {
    return (
      <section
        role="alert"
        aria-labelledby="course-not-found-heading"
        className="rounded-md border border-zinc-200 px-4 py-4 dark:border-zinc-800"
      >
        <h2 id="course-not-found-heading" className="font-semibold">
          找不到這門課程
        </h2>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          請確認連結仍然有效。
        </p>
      </section>
    );
  }

  if (error) {
    return (
      <ErrorAlert
        error={
          error instanceof ApiRequestError ? error : { code: "INTERNAL_ERROR" }
        }
        id="course-detail-error"
      />
    );
  }

  if (!course) {
    return (
      <ErrorAlert error={{ code: "INTERNAL_ERROR" }} id="course-detail-error" />
    );
  }

  return (
    <section className="space-y-6" aria-labelledby="course-detail-heading">
      <div>
        <h2
          id="course-detail-heading"
          className="text-lg font-semibold tracking-tight"
        >
          {course.name}
        </h2>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          課程由伺服器建立，擁有者是唯一老師。
        </p>
      </div>

      <dl className="grid gap-4 rounded-md border border-zinc-200 p-4 text-sm dark:border-zinc-800 sm:grid-cols-2">
        <div>
          <dt className="text-zinc-500 dark:text-zinc-400">課程狀態</dt>
          <dd className="mt-1 font-medium">{course.status}</dd>
        </div>
        <div>
          <dt className="text-zinc-500 dark:text-zinc-400">
            課程擁有者（唯一老師）
          </dt>
          <dd className="mt-1 break-all font-medium">
            {course.ownerAccountId}
          </dd>
        </div>
      </dl>

      <p
        role="status"
        aria-live="polite"
        className="rounded-md border border-dashed border-zinc-300 px-4 py-3 text-sm text-zinc-600 dark:border-zinc-700 dark:text-zinc-400"
      >
        題目功能目前尚未開放。
      </p>
    </section>
  );
}
