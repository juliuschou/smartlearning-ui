'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { ErrorAlert } from '@/components/ui/ErrorAlert';
import { Field, inputClass } from '@/components/ui/Field';
import { ApiRequestError } from '@/lib/api/client';
import { useCreateAccount } from '@/lib/api/accounts';
import type { AccountDto } from '@/lib/api/types';

/**
 * Account creation form — US-F5.
 *
 * Backend DTO (`CreateAccountDto`) allows `admin|teacher|student`; this round
 * the UI only offers `admin|teacher` (SPEC scope). `canCreateCourse` is shown
 * only for `teacher` (for `admin` the backend ignores it; we still send `true`
 * to satisfy the required field). The temp password field is cleared on
 * success — the API never returns it, and we never display a returned password.
 */

const ROLES = [
  { value: 'teacher', label: '老師' },
  { value: 'admin', label: '管理員' },
] as const;

const schema = z.object({
  username: z.string().min(1, '請輸入帳號名稱').max(64, '帳號名稱最長 64 字元'),
  displayName: z
    .string()
    .min(1, '請輸入顯示名稱')
    .max(100, '顯示名稱最長 100 字元'),
  role: z.enum(['admin', 'teacher']),
  canCreateCourse: z.boolean(),
  tempPassword: z
    .string()
    .min(12, '臨時密碼至少 12 字元')
    .max(128, '臨時密碼最長 128 字元'),
});

type FormValues = z.infer<typeof schema>;

export function AccountCreateForm() {
  const createAccount = useCreateAccount();
  const [created, setCreated] = useState<AccountDto | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      username: '',
      displayName: '',
      role: 'teacher',
      canCreateCourse: true,
      tempPassword: '',
    },
  });

  const role = watch('role');

  const onSubmit = handleSubmit(async (values) => {
    try {
      const account = await createAccount.mutateAsync(values);
      setCreated(account);
      // Clear the temp password immediately on success — never persist it.
      reset({ ...values, tempPassword: '' });
    } catch {
      // `createAccount.error` drives the ErrorAlert; no extra handling here.
    }
  });

  const apiError =
    createAccount.error instanceof ApiRequestError ? createAccount.error : null;

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      className="w-full max-w-md space-y-5"
      aria-describedby="form-instructions"
    >
      <p
        id="form-instructions"
        className="text-sm text-zinc-600 dark:text-zinc-400"
      >
        建立老師或管理員帳號。帳號建立後須使用臨時密碼首次登入並自行變更。
      </p>

      {created ? (
        <div
          role="status"
          aria-live="polite"
          className="rounded-md border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-800 dark:border-green-800 dark:bg-green-950 dark:text-green-200"
        >
          已建立帳號「{created.username}」。此帳號首次登入需變更密碼
          （mustChangePassword=true）。
        </div>
      ) : null}

      {apiError ? <ErrorAlert error={apiError} id="form-error" /> : null}

      <Field
        id="username"
        label="帳號名稱"
        error={errors.username?.message}
        hint="1–64 字元，登入時使用"
      >
        <input
          id="username"
          type="text"
          autoComplete="username"
          aria-describedby="username-hint username-error"
          {...register('username')}
          className={inputClass(errors.username)}
        />
      </Field>

      <Field
        id="displayName"
        label="顯示名稱"
        error={errors.displayName?.message}
        hint="1–100 字元，顯示於介面"
      >
        <input
          id="displayName"
          type="text"
          aria-describedby="displayName-hint displayName-error"
          {...register('displayName')}
          className={inputClass(errors.displayName)}
        />
      </Field>

      <Field id="role" label="角色" error={errors.role?.message}>
        <select
          id="role"
          aria-describedby="role-error"
          {...register('role')}
          className={inputClass(errors.role)}
          onChange={(e) => {
            setValue('role', e.target.value as 'admin' | 'teacher', {
              shouldValidate: true,
            });
            // admin always canCreateCourse=true (backend ignores it anyway).
            if (e.target.value === 'admin') {
              setValue('canCreateCourse', true);
            }
          }}
        >
          {ROLES.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
      </Field>

      {role === 'teacher' ? (
        <Field
          id="canCreateCourse"
          label="可建立課程"
          error={errors.canCreateCourse?.message}
          hint="老師可勾選以允許建立課程"
        >
          <input
            id="canCreateCourse"
            type="checkbox"
            aria-describedby="canCreateCourse-hint canCreateCourse-error"
            {...register('canCreateCourse')}
            className="size-4 align-middle"
          />
        </Field>
      ) : null}

      <Field
        id="tempPassword"
        label="臨時密碼"
        error={errors.tempPassword?.message}
        hint="一次性臨時密碼，首次登入需自行變更（12–128 字元）"
      >
        <input
          id="tempPassword"
          type="password"
          autoComplete="new-password"
          aria-describedby="tempPassword-hint tempPassword-error"
          {...register('tempPassword')}
          className={inputClass(errors.tempPassword)}
        />
      </Field>

      <button
        type="submit"
        disabled={isSubmitting}
        className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
      >
        {isSubmitting ? '建立中…' : '建立帳號'}
      </button>
    </form>
  );
}
