'use client';

import Link from 'next/link';
import { redirect, usePathname } from 'next/navigation';
import { useSession } from '@/lib/auth/session';
import { LogoutButton } from '@/components/auth/LogoutButton';

/**
 * Protected admin shell. Wraps everything under `app/(admin)/`.
 *
 * Gates (in order):
 *  1. While session is loading, show a placeholder.
 *  2. `mustChangePassword=true` → redirect to `/settings/password` *before* the
 *     role check. F7 (the change-password page) is not yet implemented, so this
 *     lands on a 404 — a known SPEC gap (the gate still must block protected
 *     routes for a must-change-password user).
 *  3. Not authenticated or non-admin → redirect to `/login?next=…`, preserving
 *     the intended destination for the post-login redirect (US-F6 honors it).
 *
 * The shell renders a small admin header with a logout button (US-F6).
 */
export default function AdminLayout({
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
    redirect('/settings/password');
  }

  if (!session || session.role !== 'admin') {
    const dest = encodeURIComponent(pathname ?? '/admin');
    redirect(`/login?next=${dest}`);
  }

  return (
    <div className="flex min-h-full flex-col">
      <header className="flex items-center justify-between border-b border-zinc-200 px-6 py-3 dark:border-zinc-800">
        <span className="text-sm font-medium text-zinc-700 dark:text-zinc-200">
          管理員主控台
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
