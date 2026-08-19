import type { ApiRequestError } from '@/lib/api/client';
import { errorMessage } from '@/lib/api/error-messages';

/**
 * Stable, accessible error alert. Renders a localized message derived from the
 * stable `error.code` — never the raw `error.message` (which may leak internal
 * detail for server errors). Unknown codes fall back to a generic message.
 *
 * Status is conveyed by both icon/role and text, not color alone (a11y).
 */
export function ErrorAlert({
  error,
  id,
  className = '',
}: {
  error: ApiRequestError | { code: string } | null | undefined;
  id?: string;
  className?: string;
}) {
  if (!error) return null;
  const message = errorMessage(error);
  return (
    <div
      id={id}
      role="alert"
      aria-live="assertive"
      className={`rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200 ${className}`}
    >
      <span aria-hidden="true" className="mr-1.5">⚠</span>
      {message}
    </div>
  );
}