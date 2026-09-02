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

    await expect(apiRequest("/health/ready")).rejects.toMatchObject({
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
});
