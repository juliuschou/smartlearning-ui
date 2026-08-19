import type { ReactNode } from 'react';

/**
 * Shared form field primitive used by auth/admin forms.
 *
 * Extracted from `AccountCreateForm` (US-F5) so the login form (US-F6) reuses
 * the same label + hint + error layout. Render the control as `children` (the
 * caller wires `register`, `id`, `aria-describedby`, and `inputClass`).
 */
export function Field({
  id,
  label,
  error,
  hint,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label
        htmlFor={id}
        className="block text-sm font-medium text-zinc-800 dark:text-zinc-200"
      >
        {label}
      </label>
      {children}
      {hint ? (
        <p
          id={`${id}-hint`}
          className="text-xs text-zinc-500 dark:text-zinc-400"
        >
          {hint}
        </p>
      ) : null}
      {error ? (
        <p
          id={`${id}-error`}
          role="alert"
          className="text-xs text-red-700 dark:text-red-300"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Shared input class with an error-tone variant. The `error` argument accepts
 * a react-hook-form field error (which has `.message`) or a plain string.
 */
export function inputClass(error?: { message?: string } | string): string {
  const base =
    'block w-full rounded-md border px-3 py-2 text-sm shadow-sm outline-none focus:ring-2 disabled:opacity-60';
  const tone = error
    ? 'border-red-400 focus:ring-red-300 dark:border-red-700'
    : 'border-zinc-300 focus:ring-zinc-400 dark:border-zinc-700';
  return `${base} ${tone}`;
}
