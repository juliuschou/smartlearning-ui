/**
 * Read the CSRF token from the non-HttpOnly `__Host-csrf` cookie.
 *
 * The backend has no dedicated `/csrf` endpoint. The token is set only by the
 * login response (`Set-Cookie: __Host-csrf`, non-HttpOnly). Every authenticated
 * mutation thereafter needs `X-CSRF-Token` (read from this cookie) + `Origin`.
 *
 * This is a client-only helper; `document.cookie` is not available on the
 * server, and that is correct — CSRF applies to browser mutations only.
 */

export const CSRF_COOKIE_NAME = '__Host-csrf';
export const CSRF_HEADER_NAME = 'X-CSRF-Token';

/** Returns the CSRF token from the cookie, or `null` if absent. */
export function getCsrfToken(): string | null {
  if (typeof document === 'undefined') return null;
  // `document.cookie` is a sequence of `name=value` pairs separated by `; `.
  const match = document.cookie
    .split(';')
    .map((pair) => pair.trim())
    .find((pair) => pair.startsWith(`${CSRF_COOKIE_NAME}=`));
  if (!match) return null;
  const value = match.slice(`${CSRF_COOKIE_NAME}=`.length);
  return decodeURIComponent(value);
}