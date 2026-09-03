import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest, type ApiRequestError } from "@/lib/api/client";
import { queryKeys } from "@/lib/api/query-keys";
import type {
  ChangePasswordPayload,
  LoginPayload,
  SessionDto,
} from "@/lib/api/types";

/**
 * Login via `POST /api/v1/auth/login`.
 *
 * Backend deliberately exempts login from CSRF (the CSRF cookie is *set* by the
 * login response, so it cannot be required to make the request). We pass
 * `mutate: false` so `apiRequest` does NOT attach `X-CSRF-Token` / `Origin` —
 * `credentials: 'include'` still applies (cookie is sent) and the body is still
 * serialized. This keeps `client.ts` unchanged.
 *
 * On success the backend returns `SessionDto` and sets `__Host-session`
 * (HttpOnly) + `__Host-csrf` (non-HttpOnly). We write the returned session
 * straight into the session query cache so callers don't immediately refetch
 * `/auth/session`.
 */
export function useLogin() {
  const queryClient = useQueryClient();
  return useMutation<SessionDto, ApiRequestError, LoginPayload>({
    mutationFn: (payload) =>
      apiRequest<SessionDto>("/auth/login", {
        method: "POST",
        body: payload,
        mutate: false,
      }),
    onSuccess: (session) => {
      queryClient.setQueryData(queryKeys.session, session);
    },
  });
}

/**
 * Logout via `POST /api/v1/auth/logout` (Session + CSRF).
 *
 * On settle (success or failure) we clear the entire query cache — the session
 * query included — so that browser back never resurfaces protected data that was
 * cached while authenticated. The caller then navigates (replace) to `/login`.
 */
export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation<null, ApiRequestError, void>({
    mutationFn: () =>
      apiRequest<null>("/auth/logout", { method: "POST", mutate: true }),
    onSettled: () => {
      queryClient.clear();
    },
  });
}

/**
 * Change password via `POST /api/v1/auth/change-password` (US-F7).
 *
 * Backend guard: Session + CSRF (NOT step-up — `currentPassword` is verified
 * inline by the service). `mutate: true` attaches `X-CSRF-Token` + `Origin`.
 *
 * On success the backend rotates the session (all other sessions are revoked)
 * and returns a fresh `SessionDto` with new `__Host-session` / `__Host-csrf`
 * cookies. We seed the returned session into the session query cache so the
 * `mustChangePassword` flag flips to `false` immediately without a refetch —
 * the force-change flow can then redirect to the role home.
 *
 * Errors (stable `code`):
 *  - `AUTH_INVALID_CREDENTIALS` — wrong `currentPassword`.
 *  - `VALIDATION_FAILED` (field `newPassword`) — too short / common password.
 *  - `RATE_LIMITED` is a login response; the form renders it defensively from
 *    the shared stable error-code contract.
 */
export function useChangePassword() {
  const queryClient = useQueryClient();
  return useMutation<SessionDto, ApiRequestError, ChangePasswordPayload>({
    mutationFn: (payload) =>
      apiRequest<SessionDto>("/auth/change-password", {
        method: "POST",
        body: payload,
        mutate: true,
      }),
    onSuccess: (session) => {
      queryClient.setQueryData(queryKeys.session, session);
    },
  });
}
