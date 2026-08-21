import type { Metadata } from "next";
import Link from "next/link";
import { AccountDetailView } from "@/features/admin/AccountDetailView";

export const metadata: Metadata = {
  title: "帳號詳情 | 智學互動平台",
};

type AccountDetailPageProps = {
  params: Promise<{ accountId: string }>;
};

export default async function AccountDetailPage({
  params,
}: AccountDetailPageProps) {
  const { accountId } = await params;

  return (
    <main className="flex flex-1 flex-col px-6 py-10">
      <div className="mx-auto w-full max-w-3xl">
        <Link
          href="/admin/accounts"
          className="text-sm font-medium text-zinc-600 underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 dark:text-zinc-400"
        >
          ← 返回帳號列表
        </Link>
        <h1 className="mt-4 text-xl font-semibold tracking-tight">帳號詳情</h1>
        <div className="mt-6">
          <AccountDetailView accountId={accountId} />
        </div>
      </div>
    </main>
  );
}
