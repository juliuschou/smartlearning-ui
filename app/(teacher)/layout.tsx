"use client";

import Link from "next/link";
import { redirect, usePathname } from "next/navigation";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { useSession } from "@/lib/auth/session";

/**
 * Protected teacher shell. Wraps everything under `app/(teacher)/`.
 *
 * Gates (in order): loading, forced password change, then authentication and
 * role validation. Keeping the password gate before the role check ensures a
 * teacher who must change their password can reach only that settings route.
 */
export default function TeacherLayout({
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
    redirect("/settings/password");
  }

  if (!session || session.role !== "teacher") {
    const dest = encodeURIComponent(pathname ?? "/teacher");
    redirect(`/login?next=${dest}`);
  }

  return (
    <div className="flex min-h-full flex-col">
      <header className="flex items-center justify-between border-b border-zinc-200 px-6 py-3 dark:border-zinc-800">
        <span className="text-sm font-medium text-zinc-700 dark:text-zinc-200">
          老師專區
        </span>
        <div className="flex items-center gap-4">
          <Link
            href="/settings/password"
            className="text-sm font-medium text-zinc-700 transition hover:text-zinc-900 dark:text-zinc-200 dark:hover:text-zinc-50"
          >
            變更密碼
          </Link>
          <LogoutButton />
        </div>
      </header>
      {children}
    </div>
  );
}
