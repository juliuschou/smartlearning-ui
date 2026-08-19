import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest, type ApiRequestError } from '@/lib/api/client';
import { queryKeys } from '@/lib/api/query-keys';
import type { LoginPayload, SessionDto } from '@/lib/api/types';

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
      apiRequest<SessionDto>('/auth/login', {
        method: 'POST',
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
 * On success we clear the entire query cache — the session query included —
 * so that browser back never resurfaces protected data that was cached while
 * authenticated. The caller then navigates (replace) to `/login`.
 */
export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation<null, ApiRequestError, void>({
    mutationFn: () =>
      apiRequest<null>('/auth/logout', { method: 'POST', mutate: true }),
    onSuccess: () => {
      queryClient.clear();
    },
  });
}
