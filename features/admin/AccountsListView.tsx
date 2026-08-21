"use client";

import Link from "next/link";
import { useState } from "react";
import { ErrorAlert } from "@/components/ui/ErrorAlert";
import { ApiRequestError } from "@/lib/api/client";
import { useAccounts } from "@/lib/api/accounts";

const PAGE_SIZE = 20;

/**
 * Admin account list. Account data is always read from the backend; this view
 * intentionally exposes no lifecycle or CLI credential controls.
 */
export function AccountsListView() {
  const [page, setPage] = useState(1);
  const { data, error, isLoading } = useAccounts({
    page,
    pageSize: PAGE_SIZE,
  });

  if (isLoading) {
    return <p className="text-sm text-zinc-600 dark:text-zinc-400">載入中…</p>;
  }

  if (error) {
    return (
      <ErrorAlert
        error={
          error instanceof ApiRequestError ? error : { code: "INTERNAL_ERROR" }
        }
        id="accounts-list-error"
      />
    );
  }

  if (!data || data.data.length === 0) {
    return (
      <p className="rounded-md border border-zinc-200 px-4 py-6 text-center text-sm text-zinc-600 dark:border-zinc-800 dark:text-zinc-400">
        目前沒有可管理的帳號。
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-md border border-zinc-200 dark:border-zinc-800">
        <table className="min-w-full divide-y divide-zinc-200 text-left text-sm dark:divide-zinc-800">
          <caption className="sr-only">平台帳號列表</caption>
          <thead className="bg-zinc-50 dark:bg-zinc-900">
            <tr>
              <th scope="col" className="px-4 py-3 font-medium">
                帳號
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                角色
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                狀態
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                開課授權
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {data.data.map((account) => (
              <tr key={account.id}>
                <th scope="row" className="px-4 py-3 font-normal">
                  <Link
                    href={`/admin/accounts/${account.id}`}
                    className="font-medium text-zinc-900 underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 dark:text-zinc-100"
                  >
                    {account.displayName}
                  </Link>
                  <span className="mt-0.5 block text-xs text-zinc-500 dark:text-zinc-400">
                    {account.username}
                  </span>
                </th>
                <td className="px-4 py-3">{account.role}</td>
                <td className="px-4 py-3">{account.status}</td>
                <td className="px-4 py-3">
                  {account.canCreateCourse ? "可開課" : "不可開課"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <nav
        aria-label="帳號分頁"
        className="flex items-center justify-between gap-3 text-sm"
      >
        <p className="text-zinc-600 dark:text-zinc-400">
          第 {data.meta.page} / {data.meta.totalPages} 頁，共 {data.meta.total}{" "}
          個帳號
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setPage((current) => Math.max(1, current - 1))}
            disabled={page <= 1}
            className="rounded-md border border-zinc-300 px-3 py-1.5 font-medium transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
          >
            上一頁
          </button>
          <button
            type="button"
            onClick={() =>
              setPage((current) => Math.min(data.meta.totalPages, current + 1))
            }
            disabled={page >= data.meta.totalPages}
            className="rounded-md border border-zinc-300 px-3 py-1.5 font-medium transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
          >
            下一頁
          </button>
        </div>
      </nav>
    </div>
  );
}
