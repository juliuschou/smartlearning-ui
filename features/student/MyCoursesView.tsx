"use client";

import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ErrorAlert } from "@/components/ui/ErrorAlert";
import { useSession } from "@/lib/auth/session";
import { useMyCourses } from "@/lib/api/enrollments";
import { queryKeys } from "@/lib/api/query-keys";
import { JoinLiveSessionButton } from "@/features/live-student/JoinLiveSessionButton";
import type { CourseStatus, MyCourseDto } from "@/lib/api/types";

const PAGE_SIZE = 20;

const COURSE_STATUS_LABELS: Record<CourseStatus, string> = {
  draft: "草稿",
  archived: "已封存",
};

const ENROLLED_AT_FORMATTER = new Intl.DateTimeFormat("zh-TW", {
  timeZone: "Asia/Taipei",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/**
 * Client view for the student's active course roster (`GET /me/courses`).
 *
 * The backend remains the source of truth for enrollment filtering and ordering.
 * This view only owns the current page and presents the server-provided page
 * metadata without adding client-side filtering, sorting, or enrollment actions.
 */
export function MyCoursesView() {
  const { session } = useSession();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const { courses, meta, isLoading, error, refetch } = useMyCourses({
    page,
    pageSize: PAGE_SIZE,
  });

  useEffect(() => {
    if (!meta) return;

    const nextPage =
      meta.totalPages === 0
        ? page === 1
          ? null
          : 1
        : page > meta.totalPages
          ? meta.totalPages
          : null;
    if (nextPage === null) return;

    void queryClient.invalidateQueries({
      queryKey: queryKeys.myCourses.list(nextPage, PAGE_SIZE),
      refetchType: "none",
    });
    const timeoutId = window.setTimeout(() => setPage(nextPage), 0);
    return () => window.clearTimeout(timeoutId);
  }, [meta, page, queryClient]);

  if (session?.role !== "student") {
    return null;
  }

  const isPageCorrectionPending =
    meta !== null &&
    ((meta.totalPages === 0 && page !== 1) ||
      (meta.totalPages > 0 && page > meta.totalPages));

  if (isLoading || isPageCorrectionPending) {
    return (
      <p
        role="status"
        aria-live="polite"
        className="text-sm text-zinc-600 dark:text-zinc-400"
      >
        {isPageCorrectionPending ? "更新我的課程中…" : "載入我的課程中…"}
      </p>
    );
  }

  if (error) {
    return <ErrorAlert error={error} id="my-courses-error" />;
  }

  const isEmptyRoster =
    courses.length === 0 &&
    page === 1 &&
    meta?.total === 0 &&
    meta.totalPages === 0;

  if (isEmptyRoster) {
    return (
      <p className="rounded-md border border-zinc-200 px-4 py-6 text-center text-sm text-zinc-600 dark:border-zinc-800 dark:text-zinc-400">
        尚未加選任何課程。加選由老師或管理員操作，請聯絡你的授課老師。
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <ul className="space-y-3" aria-label="我的課程列表">
        {courses.map((course) => (
          <li key={course.courseId}>
            <CourseCard
              course={course}
              onRefreshDiscovery={() => void refetch()}
            />
          </li>
        ))}
      </ul>

      {meta && meta.totalPages > 0 ? (
        <nav
          aria-label="我的課程分頁"
          className="flex flex-col items-start justify-between gap-3 text-sm sm:flex-row sm:items-center"
        >
          <p className="text-zinc-600 dark:text-zinc-400">
            第 {meta.page} / {meta.totalPages} 頁，共 {meta.total} 門課程
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              disabled={page <= 1}
              className="rounded-md border border-zinc-300 px-3 py-1.5 font-medium transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
            >
              上一頁
            </button>
            <button
              type="button"
              onClick={() =>
                setPage((current) => Math.min(meta.totalPages, current + 1))
              }
              disabled={page >= meta.totalPages}
              className="rounded-md border border-zinc-300 px-3 py-1.5 font-medium transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
            >
              下一頁
            </button>
          </div>
        </nav>
      ) : null}
    </div>
  );
}

function CourseCard({
  course,
  onRefreshDiscovery,
}: {
  course: MyCourseDto;
  onRefreshDiscovery: () => void;
}) {
  return (
    <article className="min-w-0 rounded-md border border-zinc-200 px-4 py-3 dark:border-zinc-800">
      <div className="flex min-w-0 flex-col items-start gap-2 sm:flex-row sm:items-start sm:justify-between">
        <h2 className="min-w-0 break-words text-sm font-medium text-zinc-900 [overflow-wrap:anywhere] dark:text-zinc-100">
          {course.name}
        </h2>
        <span className="shrink-0 whitespace-nowrap text-xs text-zinc-500 dark:text-zinc-400">
          {COURSE_STATUS_LABELS[course.status]}
        </span>
      </div>
      {course.description ? (
        <p className="mt-1 break-words whitespace-pre-wrap text-sm text-zinc-600 [overflow-wrap:anywhere] dark:text-zinc-400">
          {course.description}
        </p>
      ) : null}
      <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
        加選時間：
        <time dateTime={course.enrolledAt}>
          {formatEnrolledAt(course.enrolledAt)}
        </time>
      </p>
      {course.currentJoinableSession ? (
        <div className="mt-3">
          <JoinLiveSessionButton
            session={course.currentJoinableSession}
            onRefreshDiscovery={onRefreshDiscovery}
          />
        </div>
      ) : null}
    </article>
  );
}

function formatEnrolledAt(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : ENROLLED_AT_FORMATTER.format(date);
}
