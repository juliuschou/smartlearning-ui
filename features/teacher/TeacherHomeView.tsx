"use client";

import Link from "next/link";
import { useSession } from "@/lib/auth/session";

/**
 * Session-only teacher landing content.
 *
 * Access control and loading belong to the `(teacher)` layout. This view only
 * renders fields already present in the authoritative SessionDto.
 */
export function TeacherHomeView() {
  const { session } = useSession();

  if (!session) return null;

  return (
    <section
      aria-labelledby="teacher-account-heading"
      className="rounded-md border border-zinc-200 px-4 py-4 dark:border-zinc-800"
    >
      <h2
        id="teacher-account-heading"
        className="text-sm font-medium text-zinc-900 dark:text-zinc-100"
      >
        帳號資訊
      </h2>
      <dl className="mt-4 space-y-3 text-sm">
        <div className="flex items-baseline justify-between gap-4">
          <dt className="text-zinc-600 dark:text-zinc-400">顯示名稱</dt>
          <dd className="text-right font-medium text-zinc-900 dark:text-zinc-100">
            {session.displayName}
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-4">
          <dt className="text-zinc-600 dark:text-zinc-400">帳號</dt>
          <dd className="text-right font-medium text-zinc-900 dark:text-zinc-100">
            {session.username}
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-4">
          <dt className="text-zinc-600 dark:text-zinc-400">角色</dt>
          <dd className="text-right font-medium text-zinc-900 dark:text-zinc-100">
            {session.role}
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-4">
          <dt className="text-zinc-600 dark:text-zinc-400">開課權限</dt>
          <dd className="text-right font-medium text-zinc-900 dark:text-zinc-100">
            {session.canCreateCourse ? "可以開課" : "目前無法開課"}
          </dd>
        </div>
      </dl>
      {session.canCreateCourse ? (
        <Link
          href="/courses/new"
          className="mt-5 inline-flex rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 focus-visible:ring-offset-2 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          建立課程
        </Link>
      ) : (
        <p className="mt-5 text-sm text-zinc-700 dark:text-zinc-300">
          目前無法開課：目前帳號沒有開課權限。
        </p>
      )}
    </section>
  );
}
