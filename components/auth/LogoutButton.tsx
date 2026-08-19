'use client';

import { useRouter } from 'next/navigation';
import { useLogout } from '@/lib/api/auth';
import { ApiRequestError } from '@/lib/api/client';

/**
 * Logout button — US-F6. Calls `useLogout` (Session + CSRF). On success the
 * hook clears the entire query cache (so cached protected data cannot be
 * resurfaced via browser back); we then `router.replace('/login')` so the
 * login page replaces the admin page in history (back does not return to
 * protected content).
 */
export function LogoutButton() {
  const logout = useLogout();
  const router = useRouter();

  const onClick = async () => {
    try {
      await logout.mutateAsync();
    } catch {
      // A logout failure (e.g. already-expired session) still leaves us without
      // a usable session locally — navigate to login regardless. The hook's
      // cache-clear only runs on success, so clear is skipped here on error,
      // but the server session is gone/expired and protected queries will 401.
    }
    router.replace('/login');
  };

  const apiError =
    logout.error instanceof ApiRequestError ? logout.error : null;

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={onClick}
        disabled={logout.isPending}
        className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
      >
        {logout.isPending ? '登出中…' : '登出'}
      </button>
      {apiError ? (
        <span role="alert" className="text-xs text-red-700 dark:text-red-300">
          登出失敗，請再試一次。
        </span>
      ) : null}
    </div>
  );
}
