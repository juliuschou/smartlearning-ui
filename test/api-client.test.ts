import { afterEach, describe, expect, it, vi } from "vitest";
import {
  API_BASE,
  ApiRequestError,
  apiRequest,
  apiRequestWithStatus,
} from "@/lib/api/client";

vi.mock("@/lib/api/csrf", () => ({
  CSRF_HEADER_NAME: "X-CSRF-Token",
  getCsrfToken: () => "test-token",
}));

afterEach(() => {
  vi.unstubAllGlobals();
  document.cookie = "__Host-csrf=; Max-Age=0; path=/";
});

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const success = <T>(data: T) => ({
  data,
  meta: { schemaVersion: 1, requestId: "request-1" },
  error: null,
});

const failure = (code: string, message = "Request failed") => ({
  data: null,
  meta: { schemaVersion: 1, requestId: "request-1" },
  error: { code, message, blocking: true },
});

describe("API client", () => {
  it("unwraps successful responses and can include the HTTP status", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(() => response(success({ id: "a1" }), 201)),
    );

    await expect(apiRequest<{ id: string }>("/courses")).resolves.toEqual({ id: "a1" });
    await expect(apiRequestWithStatus<{ id: string }>("/courses")).resolves.toEqual({
      data: { id: "a1" },
      status: 201,
    });
  });

  it("sends JSON requests with cookies and mutation protection headers", async () => {
    document.cookie = "__Host-csrf=test-token; path=/";
    const fetchMock = vi.fn().mockResolvedValue(response(success({ ok: true }), 201));
    vi.stubGlobal("fetch", fetchMock);

    await apiRequest("/courses", {
      method: "POST",
      body: { name: "Math" },
      idempotencyKey: "once-only",
    });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${API_BASE}/courses`);
    expect(init).toMatchObject({
      method: "POST",
      credentials: "include",
      body: JSON.stringify({ name: "Math" }),
    });
    expect(init.headers).toMatchObject({
      Accept: "application/json",
      "Content-Type": "application/json",
      Origin: window.location.origin,
      "X-CSRF-Token": "test-token",
      "Idempotency-Key": "once-only",
    });
  });

  it("does not add mutation headers to GET requests", async () => {
    const fetchMock = vi.fn().mockResolvedValue(response(success([])));
    vi.stubGlobal("fetch", fetchMock);

    await apiRequest("/courses");

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.headers).toEqual({ Accept: "application/json" });
  });

  it("throws a typed error for API error envelopes, including 2xx responses", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(failure("COURSE_MISSING"))));

    await expect(apiRequest("/courses/missing")).rejects.toMatchObject({
      name: "ApiRequestError",
      code: "COURSE_MISSING",
      status: 200,
    });
  });

  it("normalizes malformed JSON envelopes and malformed API errors", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation(() => response(null)));
    await expect(apiRequest("/courses")).rejects.toMatchObject({
      name: "ApiRequestError",
      code: "INTERNAL_ERROR",
      status: 200,
    });

    vi.stubGlobal("fetch", vi.fn().mockImplementation(() => response({ data: [] })));
    await expect(apiRequest("/courses")).rejects.toMatchObject({
      code: "INTERNAL_ERROR",
    });

    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(() => response({ data: null, error: { code: 42 } })),
    );
    await expect(apiRequest("/courses")).rejects.toMatchObject({
      code: "INTERNAL_ERROR",
    });

    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(() =>
        response({ data: [], meta: "bad", error: null }),
      ),
    );
    await expect(apiRequest("/courses")).rejects.toMatchObject({
      code: "INTERNAL_ERROR",
    });

    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(() =>
        response({
          data: { unexpected: true },
          meta: { schemaVersion: 1, requestId: "request-1" },
          error: { code: "FAILED", message: "failed", blocking: true },
        }),
      ),
    );
    await expect(apiRequest("/courses")).rejects.toMatchObject({
      code: "INTERNAL_ERROR",
    });
  });

  it("throws a typed error for non-success HTTP responses", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(failure("NOT_ALLOWED"), 403)));

    await expect(apiRequest("/courses")).rejects.toMatchObject({
      code: "NOT_ALLOWED",
      status: 403,
    });
  });

  it("maps network and invalid response failures to consistent errors", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    await expect(apiRequest("/courses")).rejects.toMatchObject({
      code: "NETWORK_ERROR",
      status: 0,
    });

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("not json", { status: 502 })));
    await expect(apiRequest("/courses")).rejects.toMatchObject({
      code: "INTERNAL_ERROR",
      status: 502,
    });
  });

  it("rejects a missing anonymous participant token before sending a request", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const request = apiRequest("/live-sessions/x", {
      auth: { kind: "anonymous-participant", participantToken: " " },
    });
    await expect(request).rejects.toBeInstanceOf(ApiRequestError);
    await expect(request).rejects.toMatchObject({
      code: "ANONYMOUS_CREDENTIAL_MISSING",
      status: 0,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends the participant token in its dedicated header", async () => {
    const fetchMock = vi.fn().mockResolvedValue(response(success({ ok: true })));
    vi.stubGlobal("fetch", fetchMock);

    await apiRequest("/live-sessions/x", {
      auth: { kind: "anonymous-participant", participantToken: "private-token" },
    });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.headers).toMatchObject({ "X-Participant-Token": "private-token" });
  });
});
