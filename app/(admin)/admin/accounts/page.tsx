import type { Metadata } from "next";
import Link from "next/link";
import { AccountsListView } from "@/features/admin/AccountsListView";

export const metadata: Metadata = {
  title: "管理帳號 | 智學互動平台",
};

export default function AccountsPage() {
  return (
    <main className="flex flex-1 flex-col px-6 py-10">
      <div className="mx-auto w-full max-w-5xl">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">管理帳號</h1>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
              查看帳號狀態與開課授權。
            </p>
          </div>
          <Link
            href="/admin/accounts/new"
            className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 focus-visible:ring-offset-2 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
          >
            建立帳號
          </Link>
        </div>
        <div className="mt-6">
          <AccountsListView />
        </div>
      </div>
    </main>
  );
}
