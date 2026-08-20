import { CSRF_HEADER_NAME, getCsrfToken } from "./csrf";
import type { ApiError, ApiSuccessEnvelope, ApiResponse } from "./types";

/**
 * Base URL for the backend `/api/v1` REST contract.
 * Overridable via `NEXT_PUBLIC_API_BASE`; defaults to the local backend.
 * Health probes are raw and must NOT go through this client.
 */
export const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:3000/api/v1";

/** The UI origin, sent as the `Origin` header on mutations (CSRF Origin check). */
const UI_ORIGIN =
  typeof window !== "undefined"
    ? window.location.origin
    : "http://localhost:3001";

/**
 * Error thrown when the API returns an error envelope or the request fails.
 * Carries the stable `code` so UI can render a localized, stable message
 * (never the raw `message`, which may leak internal detail for server errors).
 */
export class ApiRequestError extends Error {
  readonly code: string;
  readonly field?: string;
  readonly retryAfterSeconds?: number | null;
  readonly status: number;

  constructor(error: ApiError, status: number) {
    super(error.message);
    this.name = "ApiRequestError";
    this.code = error.code;
    this.field = error.field;
    this.retryAfterSeconds = error.retryAfterSeconds;
    this.status = status;
  }
}

type RequestOptions = {
  method?: string;
  body?: unknown;
  /** True for mutations that require CSRF (POST/PUT/PATCH/DELETE on /api/v1). */
  mutate?: boolean;
  signal?: AbortSignal;
};

/**
 * Fetch wrapper for the versioned `/api/v1` REST contract.
 *
 * - `credentials: 'include'` so the DB-backed session cookie is sent.
 * - Mutations automatically attach `X-CSRF-Token` (from the `__Host-csrf`
 *   cookie) and `Origin`. GET requests omit the CSRF header.
 * - Success: unwraps the envelope and returns `body.data`.
 * - Error: throws `ApiRequestError` carrying the stable `code` + `field`.
 */
export async function apiRequest<T>(
  path: string,
  opts: RequestOptions = {},
): Promise<T> {
  const url = path.startsWith("http") ? path : `${API_BASE}${path}`;
  const method = opts.method ?? "GET";
  const isMutation = opts.mutate ?? method !== "GET";

  const headers: Record<string, string> = {
    Accept: "application/json",
  };
  if (opts.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  if (isMutation) {
    headers["Origin"] = UI_ORIGIN;
    const csrf = getCsrfToken();
    if (csrf) headers[CSRF_HEADER_NAME] = csrf;
  }

  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      credentials: "include",
      signal: opts.signal,
    });
  } catch {
    // Network failure / CORS / server unreachable. No stable code available.
    throw new ApiRequestError(
      {
        code: "NETWORK_ERROR",
        message: "無法連線到伺服器，請稍後再試。",
        blocking: true,
      },
      0,
    );
  }

  let envelope: ApiResponse<T> | null = null;
  try {
    envelope = (await res.json()) as ApiResponse<T>;
  } catch {
    throw new ApiRequestError(
      {
        code: "INTERNAL_ERROR",
        message: "伺服器回應格式錯誤。",
        blocking: true,
      },
      res.status,
    );
  }

  if (!res.ok || envelope.error) {
    const error =
      envelope && envelope.error
        ? envelope.error
        : {
            code: "INTERNAL_ERROR",
            message: "發生未預期的錯誤。",
            blocking: true,
          };
    throw new ApiRequestError(error, res.status);
  }

  return (envelope as ApiSuccessEnvelope<T>).data;
}
