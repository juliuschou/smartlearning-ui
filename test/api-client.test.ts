import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiRequestError, apiRequest } from "@/lib/api/client";

const fetchMock = vi.fn();

const meta = { schemaVersion: 1, requestId: "request-1" };

function responseFor(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function successResponse(data: unknown, status = 200) {
  return responseFor({ data, meta, error: null }, status);
}

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  Object.defineProperty(document, "cookie", {
    configurable: true,
    writable: true,
    value: "__Host-csrf=test-csrf-token",
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("apiRequest transport boundary", () => {
  it("unwraps a successful envelope to data only", async () => {
    fetchMock.mockResolvedValueOnce(successResponse({ id: "course-1" }));

    await expect(
      apiRequest<{ id: string }>("/courses/course-1"),
    ).resolves.toEqual({ id: "course-1" });
  });

  it("maps an error envelope to ApiRequestError with stable metadata", async () => {
    fetchMock.mockResolvedValueOnce(
      responseFor(
        {
          data: null,
          meta,
          error: {
            code: "RATE_LIMITED",
            message: "internal retry detail",
            field: "username",
            blocking: true,
            retryAfterSeconds: 12,
          },
        },
        429,
      ),
    );

    const request = apiRequest("/auth/login", {
      method: "POST",
      mutate: false,
    });
    await expect(request).rejects.toBeInstanceOf(ApiRequestError);
    await expect(request).rejects.toMatchObject({
      code: "RATE_LIMITED",
      status: 429,
      field: "username",
      retryAfterSeconds: 12,
    });
  });

  it("rejects a 2xx response that contains an error envelope", async () => {
    fetchMock.mockResolvedValueOnce(
      responseFor({
        data: null,
        meta,
        error: {
          code: "FORBIDDEN",
          message: "internal authorization detail",
          blocking: true,
        },
      }),
    );

    await expect(apiRequest("/courses")).rejects.toMatchObject({
      code: "FORBIDDEN",
      status: 200,
    });
  });

  it("maps malformed and non-JSON responses to INTERNAL_ERROR with status", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response("not-json", {
        status: 502,
        headers: { "Content-Type": "text/plain" },
      }),
    );

    await expect(apiRequest("/courses")).rejects.toMatchObject({
      code: "INTERNAL_ERROR",
      status: 502,
    });
  });

  it("maps fetch failures to NETWORK_ERROR with status zero", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("fetch failed"));

    await expect(apiRequest("/courses")).rejects.toMatchObject({
      code: "NETWORK_ERROR",
      status: 0,
    });
  });

  it("uses credentials for GET without mutation-only Origin or CSRF headers", async () => {
    fetchMock.mockResolvedValueOnce(successResponse({ ok: true }));

    await apiRequest<{ ok: boolean }>("/me/courses");

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:3000/api/v1/me/courses",
      expect.objectContaining({
        method: "GET",
        credentials: "include",
      }),
    );
    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers).toEqual({ Accept: "application/json" });
    expect(init.headers).not.toHaveProperty("Origin");
    expect(init.headers).not.toHaveProperty("X-CSRF-Token");
  });

  it("serializes an enrollment POST with credentials, Origin, CSRF, and 201 unwrap", async () => {
    fetchMock.mockResolvedValueOnce(
      successResponse({ id: "enrollment-1" }, 201),
    );

    await expect(
      apiRequest<{ id: string }>("/courses/course-1/enrollments", {
        method: "POST",
        body: { studentAccountId: "student-1" },
        mutate: true,
      }),
    ).resolves.toEqual({ id: "enrollment-1" });

    const [, init] = fetchMock.mock.calls[0];
    expect(init).toMatchObject({
      method: "POST",
      credentials: "include",
      body: JSON.stringify({ studentAccountId: "student-1" }),
    });
    expect(init.headers).toMatchObject({
      Accept: "application/json",
      "Content-Type": "application/json",
      Origin: window.location.origin,
      "X-CSRF-Token": "test-csrf-token",
    });
  });

  it("sends an anonymous join mutation without CSRF or participant token", async () => {
    fetchMock.mockResolvedValueOnce(
      successResponse({ id: "participant-1" }, 201),
    );

    await apiRequest("/live-sessions/ABCD2345/join", {
      method: "POST",
      body: { displayName: "Learner" },
      mutate: true,
      auth: { kind: "anonymous-join" },
    });

    const [, init] = fetchMock.mock.calls[0];
    expect(init.credentials).toBe("include");
    expect(init.headers).toMatchObject({
      Accept: "application/json",
      "Content-Type": "application/json",
      Origin: window.location.origin,
    });
    expect(init.headers).not.toHaveProperty("X-CSRF-Token");
    expect(init.headers).not.toHaveProperty("X-Participant-Token");
  });

  it("sends anonymous participant and idempotency headers without CSRF", async () => {
    fetchMock.mockResolvedValueOnce(
      successResponse({ id: "submission-1" }, 201),
    );

    await apiRequest("/live-sessions/session-1/submissions", {
      method: "POST",
      body: {
        sessionQuestionId: "question-1",
        selectedOptionRefs: ["option-1"],
      },
      mutate: true,
      idempotencyKey: "idempotency-1",
      auth: {
        kind: "anonymous-participant",
        participantToken: "participant-secret",
      },
    });

    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers).toMatchObject({
      Origin: window.location.origin,
      "Idempotency-Key": "idempotency-1",
      "X-Participant-Token": "participant-secret",
    });
    expect(init.headers).not.toHaveProperty("X-CSRF-Token");
  });

  it("rejects an empty anonymous participant token before fetch", async () => {
    await expect(
      apiRequest("/live-sessions/session-1/snapshot", {
        auth: { kind: "anonymous-participant", participantToken: "  " },
      }),
    ).rejects.toMatchObject({
      code: "ANONYMOUS_CREDENTIAL_MISSING",
      status: 0,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not include participant token in transport errors", async () => {
    fetchMock.mockResolvedValueOnce(
      responseFor(
        {
          data: null,
          meta,
          error: {
            code: "UNAUTHORIZED",
            message: "not authorized",
            blocking: true,
          },
        },
        401,
      ),
    );

    const error = await apiRequest("/live-sessions/session-1/snapshot", {
      auth: {
        kind: "anonymous-participant",
        participantToken: "participant-secret",
      },
    }).catch((value) => value);

    expect(error).toBeInstanceOf(ApiRequestError);
    expect(String(error)).not.toContain("participant-secret");
    expect(JSON.stringify(error)).not.toContain("participant-secret");
  });

  it("sends a bodyless enrollment DELETE with credentials, Origin, CSRF, and null unwrap", async () => {
    fetchMock.mockResolvedValueOnce(successResponse(null, 200));

    await expect(
      apiRequest<null>("/courses/course-1/enrollments/student-1", {
        method: "DELETE",
        mutate: true,
      }),
    ).resolves.toBeNull();

    const [, init] = fetchMock.mock.calls[0];
    expect(init).toMatchObject({
      method: "DELETE",
      credentials: "include",
      body: undefined,
    });
    expect(init.headers).toEqual({
      Accept: "application/json",
      Origin: window.location.origin,
      "X-CSRF-Token": "test-csrf-token",
    });
  });
});
