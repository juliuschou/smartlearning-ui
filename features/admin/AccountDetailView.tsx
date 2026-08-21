"use client";

import { useState } from "react";
import { ErrorAlert } from "@/components/ui/ErrorAlert";
import { ApiRequestError } from "@/lib/api/client";
import { useAccount, useUpdateAccountPermissions } from "@/lib/api/accounts";

/**
 * Admin account detail and the US-F16 course-creation permission control.
 *
 * The checked state is always the fetched AccountDto value. The mutation is
 * deliberately not optimistic: its AccountDto response seeds the cache and
 * related queries are invalidated only after the server accepts the change.
 */
export function AccountDetailView({ accountId }: { accountId: string }) {
  const { data: account, error, isLoading } = useAccount(accountId);
  const updatePermissions = useUpdateAccountPermissions();
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  if (isLoading) {
    return <p className="text-sm text-zinc-600 dark:text-zinc-400">載入中…</p>;
  }

  if (error) {
    return (
      <ErrorAlert
        error={
          error instanceof ApiRequestError ? error : { code: "INTERNAL_ERROR" }
        }
        id="account-detail-error"
      />
    );
  }

  if (!account) {
    return (
      <ErrorAlert
        error={{ code: "INTERNAL_ERROR" }}
        id="account-detail-error"
      />
    );
  }

  const permissionError =
    updatePermissions.error instanceof ApiRequestError
      ? updatePermissions.error
      : updatePermissions.error
        ? { code: "INTERNAL_ERROR" }
        : null;
  const isStudent = account.role === "student";
  const accountIdForMutation = account.id;

  function updatePermission(nextValue: boolean) {
    setStatusMessage(null);
    updatePermissions.mutate(
      { accountId: accountIdForMutation, canCreateCourse: nextValue },
      {
        onSuccess: () => {
          setStatusMessage("開課授權已更新，畫面已同步伺服器狀態。");
        },
        onError: () => {
          setStatusMessage("更新失敗，開課授權維持伺服器狀態。");
        },
      },
    );
  }

  return (
    <section
      className="space-y-6"
      aria-labelledby="account-information-heading"
    >
      <div>
        <h2
          id="account-information-heading"
          className="text-lg font-semibold tracking-tight"
        >
          {account.displayName}
        </h2>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          {account.username}
        </p>
      </div>

      <dl className="grid gap-4 rounded-md border border-zinc-200 p-4 text-sm dark:border-zinc-800 sm:grid-cols-2">
        <div>
          <dt className="text-zinc-500 dark:text-zinc-400">帳號 ID</dt>
          <dd className="mt-1 break-all font-medium">{account.id}</dd>
        </div>
        <div>
          <dt className="text-zinc-500 dark:text-zinc-400">角色</dt>
          <dd className="mt-1 font-medium">{account.role}</dd>
        </div>
        <div>
          <dt className="text-zinc-500 dark:text-zinc-400">帳號狀態</dt>
          <dd className="mt-1 font-medium">{account.status}</dd>
        </div>
        <div>
          <dt className="text-zinc-500 dark:text-zinc-400">首次登入改密碼</dt>
          <dd className="mt-1 font-medium">
            {account.mustChangePassword ? "需要" : "不需要"}
          </dd>
        </div>
        <div>
          <dt className="text-zinc-500 dark:text-zinc-400">建立時間</dt>
          <dd className="mt-1 font-medium">{account.createdAt}</dd>
        </div>
        <div>
          <dt className="text-zinc-500 dark:text-zinc-400">停用時間</dt>
          <dd className="mt-1 font-medium">{account.disabledAt ?? "未停用"}</dd>
        </div>
      </dl>

      <div
        className="rounded-md border border-zinc-200 p-4 dark:border-zinc-800"
        aria-labelledby="course-permission-heading"
      >
        <h3 id="course-permission-heading" className="font-medium">
          開課授權
        </h3>
        <p
          id="canCreateCourse-description"
          className="mt-1 text-sm text-zinc-600 dark:text-zinc-400"
        >
          這項設定只控制是否能建立新課程，不會停用帳號或撤銷既有憑證。
        </p>

        {isStudent ? (
          <p
            className="mt-4 rounded-md bg-zinc-50 px-3 py-2 text-sm text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
            role="status"
          >
            學生帳號不可開課，權限固定為關閉。
          </p>
        ) : (
          <div className="mt-4 flex items-start gap-3">
            <input
              id="canCreateCourse"
              type="checkbox"
              role="switch"
              checked={account.canCreateCourse}
              aria-checked={account.canCreateCourse}
              aria-describedby="canCreateCourse-description canCreateCourse-status"
              disabled={updatePermissions.isPending}
              onChange={(event) =>
                updatePermission(event.currentTarget.checked)
              }
              className="mt-0.5 size-5 rounded border-zinc-300 accent-zinc-900 outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed dark:border-zinc-700 dark:accent-zinc-100"
            />
            <div>
              <label
                htmlFor="canCreateCourse"
                className="font-medium text-zinc-900 dark:text-zinc-100"
              >
                允許建立課程
              </label>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                目前狀態：{account.canCreateCourse ? "已開啟" : "已關閉"}
                {updatePermissions.isPending ? "（更新中…）" : ""}
              </p>
            </div>
          </div>
        )}

        <div
          id="canCreateCourse-status"
          role="status"
          aria-live="polite"
          className="mt-3 min-h-5 text-sm text-zinc-600 dark:text-zinc-400"
        >
          {statusMessage}
        </div>
        {permissionError ? (
          <ErrorAlert
            error={permissionError}
            id="permission-error"
            className="mt-3"
          />
        ) : null}
      </div>
    </section>
  );
}
