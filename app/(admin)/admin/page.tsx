import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "管理員首頁 | 智學互動平台",
};

export default function AdminHomePage() {
  return (
    <main className="flex flex-1 flex-col px-6 py-10">
      <div className="mx-auto w-full max-w-3xl">
        <h1 className="text-xl font-semibold tracking-tight">管理員首頁</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          管理平台帳號與使用者權限。
        </p>
        <div className="mt-6">
          <Link
            href="/admin/accounts/new"
            className="inline-flex rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
          >
            建立帳號
          </Link>
        </div>
      </div>
    </main>
  );
}
