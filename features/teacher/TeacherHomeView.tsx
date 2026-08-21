"use client";

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
    </section>
  );
}
