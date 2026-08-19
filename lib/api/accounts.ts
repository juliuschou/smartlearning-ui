import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/api/client';
import { queryKeys } from '@/lib/api/query-keys';
import type { AccountDto, CreateAccountPayload } from '@/lib/api/types';

/**
 * Create an account via `POST /api/v1/admin/accounts`.
 *
 * Backend guard: Session + CSRF + Admin. The UI only offers `admin|teacher`
 * (student is intentionally excluded this round even though the DTO allows it).
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
      apiRequest<AccountDto>('/admin/accounts', {
        method: 'POST',
        body: payload,
        mutate: true,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.accounts.all });
    },
  });
}