import { CSRF_HEADER_NAME, getCsrfToken } from "./csrf";
import type { ApiError, ApiResponse } from "./types";

/** Backend REST API base URL. Override with NEXT_PUBLIC_API_BASE when needed. */
export const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:3000/api/v1";

const UI_ORIGIN =
  typeof window !== "undefined" ? window.location.origin : "http://localhost:3001";

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

export type ApiAuthMode =
  | { kind: "session" }
  | { kind: "anonymous-join" }
  | { kind: "anonymous-participant"; participantToken: string };

export type ApiRequestOptions = {
  method?: string;
  body?: unknown;
  /** Override whether this request needs mutation headers. Defaults to non-GET. */
  mutate?: boolean;
  signal?: AbortSignal;
  idempotencyKey?: string;
  auth?: ApiAuthMode;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isApiError(value: unknown): value is ApiError {
  return (
    isRecord(value) &&
    typeof value.code === "string" &&
    typeof value.message === "string" &&
    typeof value.blocking === "boolean" &&
    (value.field === undefined || typeof value.field === "string") &&
    (value.nextStep === undefined || typeof value.nextStep === "string") &&
    (value.retryAfterSeconds === undefined ||
      value.retryAfterSeconds === null ||
      typeof value.retryAfterSeconds === "number")
  );
}

function hasValidMeta(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.schemaVersion === "number" &&
    typeof value.requestId === "string"
  );
}

function invalidResponseError(status: number): ApiRequestError {
  return new ApiRequestError(
    {
      code: "INTERNAL_ERROR",
      message: "伺服器回應格式錯誤。",
      blocking: true,
    },
    status,
  );
}

/** Send a request and return the unwrapped `data` from the API envelope. */
export async function apiRequest<T>(
  path: string,
  options: ApiRequestOptions = {},
): Promise<T> {
  return (await apiRequestWithStatus<T>(path, options)).data;
}

/** Send a request and return its unwrapped data together with the HTTP status. */
export async function apiRequestWithStatus<T>(
  path: string,
  options: ApiRequestOptions = {},
): Promise<{ data: T; status: number }> {
  const url = path.startsWith("http") ? path : `${API_BASE}${path}`;
  const method = options.method ?? "GET";
  const isMutation = options.mutate ?? method.toUpperCase() !== "GET";
  const auth = options.auth ?? { kind: "session" as const };

  if (
    auth.kind === "anonymous-participant" &&
    auth.participantToken.trim().length === 0
  ) {
    throw new ApiRequestError(
      {
        code: "ANONYMOUS_CREDENTIAL_MISSING",
        message: "匿名參與憑證不存在。",
        blocking: true,
      },
      0,
    );
  }

  const headers: Record<string, string> = { Accept: "application/json" };
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  if (isMutation) {
    headers.Origin = UI_ORIGIN;
    if (auth.kind === "session") {
      const csrfToken = getCsrfToken();
      if (csrfToken) headers[CSRF_HEADER_NAME] = csrfToken;
    }
  }
  if (options.idempotencyKey) {
    headers["Idempotency-Key"] = options.idempotencyKey;
  }
  if (auth.kind === "anonymous-participant") {
    headers["X-Participant-Token"] = auth.participantToken;
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      credentials: "include",
      signal: options.signal,
    });
  } catch {
    throw new ApiRequestError(
      {
        code: "NETWORK_ERROR",
        message: "無法連線到伺服器，請稍後再試。",
        blocking: true,
      },
      0,
    );
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw invalidResponseError(response.status);
  }

  if (
    !isRecord(payload) ||
    !("data" in payload) ||
    !("error" in payload) ||
    !hasValidMeta(payload.meta)
  ) {
    throw invalidResponseError(response.status);
  }

  const envelope = payload as unknown as ApiResponse<T>;
  if (envelope.error !== null) {
    const error = envelope.error;
    if (envelope.data !== null || !isApiError(error)) {
      throw invalidResponseError(response.status);
    }
    throw new ApiRequestError(error, response.status);
  }

  if (!response.ok) {
    throw new ApiRequestError(
      {
        code: "INTERNAL_ERROR",
        message: "發生未預期的錯誤。",
        blocking: true,
      },
      response.status,
    );
  }

  return {
    data: envelope.data,
    status: response.status,
  };
}
