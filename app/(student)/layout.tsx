"use client";

import { redirect, usePathname } from "next/navigation";
import { useSession } from "@/lib/auth/session";
import { LogoutButton } from "@/components/auth/LogoutButton";

/**
 * Protected student shell. Wraps everything under `app/(student)/`.
 *
 * Gates (in order):
 *  1. While session is loading, show a placeholder.
 *  2. `mustChangePassword=true` → redirect to `/settings/password` *before* the
 *     role check. F7 (the change-password page) is not yet implemented, so this
 *     lands on a 404 — a known SPEC gap (the gate still must block protected
 *     routes for a must-change-password user).
 *  3. Not authenticated or non-student → redirect to `/login?next=…`, preserving
 *     the intended destination for the post-login redirect (US-F6 honors it).
 *     Non-students (admin/teacher) are redirected away so the student page is
 *     never leaked to other roles.
 *
 * The shell renders a small student header with a logout button (US-F6).
 */
export default function StudentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { session, isLoading } = useSession();
  const pathname = usePathname();

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center px-6 py-16">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">載入中…</p>
      </div>
    );
  }

  if (session?.mustChangePassword) {
    // F7 change-password page not yet implemented → 404 (known gap).
    redirect("/settings/password");
  }

  if (!session || session.role !== "student") {
    const dest = encodeURIComponent(pathname ?? "/student");
    redirect(`/login?next=${dest}`);
  }

  return (
    <div className="flex min-h-full flex-col">
      <header className="flex items-center justify-between border-b border-zinc-200 px-6 py-3 dark:border-zinc-800">
        <span className="text-sm font-medium text-zinc-700 dark:text-zinc-200">
          學員專區
        </span>
        <LogoutButton />
      </header>
      {children}
    </div>
  );
}
