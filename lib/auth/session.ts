import { queryOptions, useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api/client";
import { queryKeys } from "@/lib/api/query-keys";
import type { SessionDto } from "@/lib/api/types";

/**
 * Authoritative session source: `GET /api/v1/auth/session` (envelope-unwrapped
 * to `SessionDto`). We do NOT mint our own JWT; the DB-backed session cookie is
 * the only credential and the backend is the authority.
 *
 * `SessionDto.expiresAt` is an ISO timestamp from the backend, but a 401 from
 * the API remains authoritative for expiry; this query then refetches and
 * surfaces the unauthenticated state.
 */

export const sessionQueryOptions = queryOptions<SessionDto>({
  queryKey: queryKeys.session,
  queryFn: ({ signal }) => apiRequest<SessionDto>("/auth/session", { signal }),
  retry: false,
  staleTime: 30_000,
});

/** React hook returning the current session (or `null` when unauthenticated). */
export function useSession() {
  const query = useQuery(sessionQueryOptions);
  // A query error means the session cookie is absent/invalid (401) — treat as
  // "not logged in" rather than surfacing the error to callers.
  const session = query.isSuccess ? query.data : null;
  return {
    session,
    isLoading: query.isLoading,
    isAuthenticated: session !== null,
    refetch: query.refetch,
  };
}
