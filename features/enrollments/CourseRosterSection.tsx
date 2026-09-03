"use client";

import { useEffect, useRef, useState } from "react";
import { ErrorAlert } from "@/components/ui/ErrorAlert";
import { Field, inputClass } from "@/components/ui/Field";
import { ApiRequestError } from "@/lib/api/client";
import {
  normalizeStudentSearchQuery,
  useAddEnrollment,
  useCourseEnrollments,
  useRemoveEnrollment,
  useStudentSearch,
} from "@/lib/api/enrollments";
import type { EnrollmentDto, StudentSearchResultDto } from "@/lib/api/types";

const PAGE_SIZE = 20;

const ENROLLED_AT_FORMATTER = new Intl.DateTimeFormat("zh-TW", {
  timeZone: "Asia/Taipei",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const ENROLLMENT_STATUS_LABELS = {
  active: "在學中",
  removed: "已移除",
} as const;

const SEARCH_STATUS_LABELS = {
  active: "已在名冊中",
  removed: "先前已移除，可重新加選",
  null: "未加選",
} as const;

function searchStatusKey(status: StudentSearchResultDto["enrollmentStatus"]) {
  return status === null ? "null" : status;
}

function formatEnrolledAt(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : ENROLLED_AT_FORMATTER.format(date);
}

/**
 * Teacher enrollment roster section on the course detail page (FE-2.2).
 *
 * Composes the FE-2.1 transport hooks: paginated roster read, course-scoped
 * student search, add/reactivate, and idempotent remove. The backend remains
 * the source of truth — no client-side filtering, ordering, pagination math,
 * or status inference from HTTP codes. All errors surface through the
 * stable-code `ErrorAlert` path.
 */
export function CourseRosterSection({ courseId }: { courseId: string }) {
  const [page, setPage] = useState(1);
  const { data, isLoading, error } = useCourseEnrollments(courseId, {
    page,
    pageSize: PAGE_SIZE,
  });

  if (isLoading) {
    return (
      <p
        role="status"
        aria-live="polite"
        className="text-sm text-zinc-600 dark:text-zinc-400"
      >
        載入名冊中…
      </p>
    );
  }

  if (error instanceof ApiRequestError && error.status === 404) {
    return (
      <section
        role="alert"
        aria-labelledby="roster-not-found-heading"
        className="rounded-md border border-zinc-200 px-4 py-4 dark:border-zinc-800"
      >
        <h2 id="roster-not-found-heading" className="font-semibold">
          無法存取這門課程的名冊
        </h2>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          請確認連結仍然有效。
        </p>
      </section>
    );
  }

  if (error) {
    return <ErrorAlert error={error} id="roster-error" />;
  }

  const enrollments = data?.data ?? [];
  const meta = data?.meta ?? null;

  return (
    <section className="space-y-6" aria-labelledby="roster-section-heading">
      <div>
        <h2
          id="roster-section-heading"
          className="text-lg font-semibold tracking-tight"
        >
          修課名冊
        </h2>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          搜尋學生帳號加入名冊，或管理現有修課學生。
        </p>
      </div>

      <StudentSearchPanel courseId={courseId} />

      <RosterTable
        courseId={courseId}
        enrollments={enrollments}
        meta={meta}
        page={page}
        onPageChange={setPage}
      />
    </section>
  );
}

function RosterTable({
  courseId,
  enrollments,
  meta,
  page,
  onPageChange,
}: {
  courseId: string;
  enrollments: EnrollmentDto[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  } | null;
  page: number;
  onPageChange: (page: number) => void;
}) {
  if (meta && meta.total === 0) {
    return (
      <p className="rounded-md border border-zinc-200 px-4 py-6 text-center text-sm text-zinc-600 dark:border-zinc-800 dark:text-zinc-400">
        名冊目前沒有學生。使用上方搜尋加入第一位學生。
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <table className="w-full text-sm" aria-label="課程名冊">
        <thead>
          <tr className="border-b border-zinc-200 text-left text-xs text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
            <th scope="col" className="py-2 pr-3 font-medium">
              學生
            </th>
            <th scope="col" className="py-2 pr-3 font-medium">
              狀態
            </th>
            <th scope="col" className="py-2 pr-3 font-medium">
              加選時間
            </th>
            <th scope="col" className="py-2 font-medium">
              <span className="sr-only">操作</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {enrollments.map((enrollment) => (
            <tr
              key={enrollment.id}
              className="border-b border-zinc-100 dark:border-zinc-900"
            >
              <td className="py-2 pr-3">
                <span className="font-medium">
                  {enrollment.student.displayName}
                </span>
                <span className="ml-2 text-xs text-zinc-500 dark:text-zinc-400">
                  {enrollment.student.username}
                </span>
              </td>
              <td className="py-2 pr-3">
                <span
                  className={
                    enrollment.status === "active"
                      ? "text-zinc-900 dark:text-zinc-100"
                      : "text-zinc-500 dark:text-zinc-400"
                  }
                >
                  {enrollment.status === "active" ? "○ " : "✕ "}
                  {ENROLLMENT_STATUS_LABELS[enrollment.status]}
                </span>
              </td>
              <td className="py-2 pr-3 text-zinc-600 dark:text-zinc-400">
                <time dateTime={enrollment.enrolledAt}>
                  {formatEnrolledAt(enrollment.enrolledAt)}
                </time>
              </td>
              <td className="py-2">
                {enrollment.status === "active" ? (
                  <RemoveEnrollmentButton
                    courseId={courseId}
                    student={enrollment.student}
                  />
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {meta && meta.totalPages > 1 ? (
        <nav
          aria-label="名冊分頁"
          className="flex items-center justify-between text-sm"
        >
          <p className="text-zinc-600 dark:text-zinc-400">
            第 {meta.page} / {meta.totalPages} 頁，共 {meta.total} 位學生
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => onPageChange(Math.max(1, page - 1))}
              disabled={page <= 1}
              className="rounded-md border border-zinc-300 px-3 py-1.5 font-medium transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
            >
              上一頁
            </button>
            <button
              type="button"
              onClick={() => onPageChange(Math.min(meta.totalPages, page + 1))}
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

function StudentSearchPanel({ courseId }: { courseId: string }) {
  const [input, setInput] = useState("");
  const [debounced, setDebounced] = useState("");
  const {
    data,
    isLoading: isSearching,
    error: searchError,
  } = useStudentSearch(courseId, { q: debounced });
  const addEnrollment = useAddEnrollment();
  const [feedback, setFeedback] = useState<{
    kind: "success" | "error";
    code?: string;
    text: string;
  } | null>(null);
  const lastAddedRef = useRef<{
    id: string;
    status: StudentSearchResultDto["enrollmentStatus"];
  } | null>(null);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDebounced(input);
      setFeedback(null);
    }, 300);
    return () => window.clearTimeout(timeoutId);
  }, [input]);

  const normalized = normalizeStudentSearchQuery(input);
  const queryLength = Array.from(normalized).length;
  const isQueryTooShort = normalized !== "" && queryLength < 2;

  const results = data?.data ?? [];

  async function handleEnroll(student: StudentSearchResultDto) {
    lastAddedRef.current = { id: student.id, status: student.enrollmentStatus };
    setFeedback(null);
    try {
      await addEnrollment.mutateAsync({
        courseId,
        studentAccountId: student.id,
      });
      // Success message reflects the pre-mutation course-relative status so
      // duplicate add and reactivation get distinct, accurate feedback.
      const text =
        student.enrollmentStatus === "active"
          ? `${student.displayName} 已在名冊中，未重複新增。`
          : student.enrollmentStatus === "removed"
            ? `已重新加選 ${student.displayName}。`
            : `已加入 ${student.displayName}。`;
      setFeedback({ kind: "success", text });
    } catch (error) {
      setFeedback({
        kind: "error",
        code: error instanceof ApiRequestError ? error.code : "INTERNAL_ERROR",
        text: "",
      });
    }
  }

  return (
    <div className="space-y-3">
      <Field
        id="student-search"
        label="搜尋學生"
        hint="輸入學生帳號或姓名（至少 2 個字元）"
        error={isQueryTooShort ? "請輸入至少 2 個字元。" : undefined}
      >
        <input
          id="student-search"
          type="search"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          className={inputClass(
            isQueryTooShort ? { message: "請輸入至少 2 個字元。" } : undefined,
          )}
          autoComplete="off"
        />
      </Field>

      {searchError ? (
        <ErrorAlert error={searchError} id="student-search-error" />
      ) : null}

      {feedback?.kind === "success" ? (
        <p
          role="status"
          aria-live="polite"
          className="rounded-md border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-800 dark:border-green-800 dark:bg-green-950 dark:text-green-200"
        >
          {feedback.text}
        </p>
      ) : null}
      {feedback?.kind === "error" ? (
        <ErrorAlert
          error={{ code: feedback.code ?? "INTERNAL_ERROR" }}
          id="student-enroll-error"
        />
      ) : null}

      {isQueryActive(debounced, normalized) && isSearching ? (
        <p
          role="status"
          aria-live="polite"
          className="text-sm text-zinc-600 dark:text-zinc-400"
        >
          搜尋學生中…
        </p>
      ) : null}

      {isQueryReady(debounced) && !isSearching && results.length === 0 ? (
        <p
          role="status"
          className="rounded-md border border-zinc-200 px-4 py-3 text-sm text-zinc-600 dark:border-zinc-800 dark:text-zinc-400"
        >
          找不到符合的學生。
        </p>
      ) : null}

      {results.length > 0 ? (
        <ul className="divide-y divide-zinc-100 rounded-md border border-zinc-200 dark:divide-zinc-900 dark:border-zinc-800">
          {results.map((student) => (
            <li
              key={student.id}
              className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <p className="break-words text-sm font-medium [overflow-wrap:anywhere]">
                  {student.displayName}
                </p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  {student.username}・
                  {
                    SEARCH_STATUS_LABELS[
                      searchStatusKey(student.enrollmentStatus)
                    ]
                  }
                </p>
              </div>
              <button
                type="button"
                onClick={() => void handleEnroll(student)}
                disabled={addEnrollment.isPending}
                className="shrink-0 rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 dark:border-zinc-700 dark:hover:bg-zinc-900"
              >
                {student.enrollmentStatus === "active"
                  ? "再次加選"
                  : student.enrollmentStatus === "removed"
                    ? "重新加選"
                    : "加入名冊"}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function isQueryReady(debounced: string): boolean {
  const normalized = normalizeStudentSearchQuery(debounced);
  const length = Array.from(normalized).length;
  return length >= 2 && length <= 100;
}

function isQueryActive(debounced: string, normalizedInput: string): boolean {
  return debounced === normalizedInput && isQueryReady(debounced);
}

function RemoveEnrollmentButton({
  courseId,
  student,
}: {
  courseId: string;
  student: EnrollmentDto["student"];
}) {
  const [isOpen, setIsOpen] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const removeEnrollment = useRemoveEnrollment();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const dialog = dialogRef.current;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    dialog?.querySelector<HTMLElement>("button")?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
        return;
      }
      // Minimal focus trap: keep Tab cycling inside the dialog.
      if (event.key !== "Tab" || !dialog) return;
      const focusables = dialog.querySelectorAll<HTMLElement>("button");
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previouslyFocused?.focus();
    };
  }, [isOpen]);

  async function handleConfirmRemove() {
    setError(null);
    try {
      await removeEnrollment.mutateAsync({
        courseId,
        studentAccountId: student.id,
      });
      setIsOpen(false);
    } catch (caught) {
      setError(
        caught instanceof ApiRequestError ? caught.code : "INTERNAL_ERROR",
      );
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="rounded-md border border-red-300 px-3 py-1.5 text-sm font-medium text-red-700 transition hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-950"
      >
        移除
      </button>

      {isOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
          onClick={() => setIsOpen(false)}
        >
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="remove-enrollment-heading"
            className="w-full max-w-sm rounded-md border border-zinc-200 bg-white px-4 py-4 shadow-lg dark:border-zinc-800 dark:bg-zinc-950"
            onClick={(event) => event.stopPropagation()}
          >
            <h3
              id="remove-enrollment-heading"
              className="text-sm font-semibold"
            >
              確認移除學生
            </h3>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
              將「{student.displayName}」（{student.username}
              ）從這門課的名冊移除？
            </p>
            {error ? (
              <div className="mt-3">
                <ErrorAlert
                  error={{ code: error }}
                  id="remove-enrollment-error"
                />
              </div>
            ) : null}
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                disabled={removeEnrollment.isPending}
                className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium transition hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => void handleConfirmRemove()}
                disabled={removeEnrollment.isPending}
                className="rounded-md bg-red-700 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-red-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {removeEnrollment.isPending ? "移除中…" : "確認移除"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
