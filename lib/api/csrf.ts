export const CSRF_COOKIE_NAME = "__Host-csrf";
export const CSRF_HEADER_NAME = "X-CSRF-Token";

/** Returns the browser CSRF cookie value, or null when unavailable. */
export function getCsrfToken(): string | null {
  if (typeof document === "undefined") return null;

  const prefix = `${CSRF_COOKIE_NAME}=`;
  const pair = document.cookie
    .split(";")
    .map((value) => value.trim())
    .find((value) => value.startsWith(prefix));

  if (!pair) return null;

  try {
    return decodeURIComponent(pair.slice(prefix.length));
  } catch {
    return null;
  }
}
