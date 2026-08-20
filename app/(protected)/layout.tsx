"use client";

import { redirect, usePathname } from "next/navigation";
import { useSession } from "@/lib/auth/session";
import { LogoutButton } from "@/components/auth/LogoutButton";

/**
 * Protected shell for authenticated-only, role-neutral settings. Wraps
 * everything under `app/(protected)/` (currently `/settings/*`).
 *
 * Gates (in order):
 *  1. While session is loading, show a placeholder.
 *  2. Not authenticated → redirect to `/login?next=<current>`, preserving the
 *     intended destination for the post-login redirect (US-F6 honors `next`).
 *
 * IMPORTANT: this layout deliberately does **not** redirect `mustChangePassword`
 * users away — unlike `(admin)`/`(student)`, the password-change page IS the
 * destination they are forced to reach. A `mustChangePassword` user may use
 * this page (and only this page) until they set a new password.
 *
 * Any role may change their own password, so no role check is applied here.
 */
export default function ProtectedLayout({
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

  if (!session) {
    const dest = encodeURIComponent(pathname ?? "/settings/password");
    redirect(`/login?next=${dest}`);
  }

  return (
    <div className="flex min-h-full flex-col">
      <header className="flex items-center justify-between border-b border-zinc-200 px-6 py-3 dark:border-zinc-800">
        <span className="text-sm font-medium text-zinc-700 dark:text-zinc-200">
          帳號設定
        </span>
        <LogoutButton />
      </header>
      {children}
    </div>
  );
}
