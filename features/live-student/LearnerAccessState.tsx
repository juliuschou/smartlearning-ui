"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ApiRequestError } from "@/lib/api/client";
import { errorMessage } from "@/lib/api/error-messages";

/**
 * Stable access-loss codes shared by the join control and the learner view.
 * These are the CP0-frozen codes that must be classified by `code`, never by
 * parsing the backend `message` or by status heuristics.
 */
const ACCESS_CODES = [
  "ENROLLMENT_REQUIRED",
  "ENROLLMENT_REMOVED",
  "FORBIDDEN",
  "AUTH_ACCOUNT_DISABLED",
  "AUTH_SESSION_EXPIRED",
  "UNAUTHORIZED",
] as const;

/** True when an error is a learner access-loss code (FE-4.1 CP4). */
export function isLearnerAccessError(error: ApiRequestError): boolean {
  return (ACCESS_CODES as readonly string[]).includes(error.code);
}

/**
 * Specialized learner access state (FE-4.1 CP4).
 *
 * Maps the frozen stable codes to a dedicated access-denied UI. Never renders
 * the raw backend message, IDs, cookies, CSRF, or tokens. Expired/missing
 * sessions redirect to login with a safe same-origin `next` (US-F6 honors it).
 *
 * Shared by the My Courses join control and the learner live-session view so
 * both classify access loss identically. The caller supplies a stable `id` so
 * browser tests never rely on a non-unique `getByRole("alert")`.
 */
export function LearnerAccessState({
  error,
  id,
  className = "",
}: {
  error: ApiRequestError;
  id: string;
  className?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();

  // Expired/missing session → safe redirect to login, preserving the intended
  // destination for the post-login redirect. No access UI is rendered. The
  // redirect runs in an effect (not during render) to avoid a render-phase
  // side effect.
  const isSessionLoss =
    error.code === "AUTH_SESSION_EXPIRED" || error.code === "UNAUTHORIZED";
  useEffect(() => {
    if (!isSessionLoss) return;
    const dest = encodeURIComponent(pathname ?? "/student");
    router.replace(`/login?next=${dest}`);
  }, [isSessionLoss, pathname, router]);
  if (isSessionLoss) return null;

  const heading =
    error.code === "AUTH_ACCOUNT_DISABLED" ? "帳號已停用" : "無法進入課堂";

  return (
    <section
      role="alert"
      id={id}
      aria-labelledby={`${id}-heading`}
      className={`rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200 ${className}`}
    >
      <h2 id={`${id}-heading`} className="font-semibold">
        {heading}
      </h2>
      <p className="mt-1">{errorMessage(error)}</p>
    </section>
  );
}
