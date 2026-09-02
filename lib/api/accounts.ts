import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api/client";
import { queryKeys } from "@/lib/api/query-keys";
import type {
  AccountDto,
  CreateAccountPayload,
  Page,
  SessionDto,
  UpdateAccountPermissionsPayload,
} from "@/lib/api/types";

/**
 * Create an account via `POST /api/v1/admin/accounts`.
 *
 * Backend guard: Session + CSRF + Admin. The UI offers `admin|teacher|student`
 * and forces `canCreateCourse` to false for student accounts.
 * `canCreateCourse` is always sent; for `admin` the backend ignores it, for
 * `teacher` it controls course-creation permission.
 *
 * On success the caller resets the form (tempPassword must not persist) and we
 * invalidate the `accounts` cache so a future list view would refetch.
 */
export function useCreateAccount() {
  const queryClient = useQueryClient();
  return useMutation<AccountDto, Error, CreateAccountPayload>({
    mutationFn: (payload) =>
      apiRequest<AccountDto>("/admin/accounts", {
        method: "POST",
        body: payload,
        mutate: true,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.accounts.all });
    },
  });
}

export interface AccountListParams {
  page?: number;
  pageSize?: number;
}

/** Fetch the admin account list with the backend's inner Page metadata. */
export function useAccounts({
  page = 1,
  pageSize = 20,
}: AccountListParams = {}) {
  return useQuery<Page<AccountDto>, Error>({
    queryKey: queryKeys.accounts.list(page, pageSize),
    queryFn: ({ signal }) => {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
      });
      return apiRequest<Page<AccountDto>>(`/admin/accounts?${params}`, {
        signal,
      });
    },
    retry: false,
    staleTime: 30_000,
  });
}

/** Fetch one metadata-only account projection for the admin detail page. */
export function useAccount(accountId: string) {
  return useQuery<AccountDto, Error>({
    queryKey: queryKeys.accounts.detail(accountId),
    queryFn: ({ signal }) =>
      apiRequest<AccountDto>(`/admin/accounts/${accountId}`, { signal }),
    enabled: Boolean(accountId),
    retry: false,
    staleTime: 30_000,
  });
}

export interface UpdateAccountPermissionsVariables extends UpdateAccountPermissionsPayload {
  accountId: string;
}

/**
 * Update only `canCreateCourse` through the server-authoritative permission
 * endpoint. The response is seeded into the detail cache before related
 * account/session queries are invalidated so no optimistic success is shown.
 */
export function useUpdateAccountPermissions() {
  const queryClient = useQueryClient();

  return useMutation<AccountDto, Error, UpdateAccountPermissionsVariables>({
    mutationFn: ({ accountId, canCreateCourse }) =>
      apiRequest<AccountDto>(`/admin/accounts/${accountId}/permissions`, {
        method: "PATCH",
        body: { canCreateCourse },
        mutate: true,
      }),
    onSuccess: (account) => {
      queryClient.setQueryData(queryKeys.accounts.detail(account.id), account);
      void queryClient.invalidateQueries({ queryKey: queryKeys.accounts.all });

      const session = queryClient.getQueryData<SessionDto>(queryKeys.session);
      if (session?.accountId === account.id) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.session });
      }
    },
  });
}
