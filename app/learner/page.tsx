import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "學員端｜智學互動平台",
  description: "智學互動平台學員端開發空殼。",
};

export default function LearnerPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-6xl items-center px-6 py-12">
      <section className="w-full rounded-lg border border-[var(--line)] bg-[var(--card)] p-8 shadow-sm">
        <Link href="/" className="ui-link text-sm underline underline-offset-4">
          ← 返回入口
        </Link>
        <p className="mt-6 text-sm font-medium text-[var(--pine)]">學員端</p>
        <h1 className="ui-heading mt-2 text-3xl font-semibold">學員端開發空殼</h1>
        <p className="mt-3 text-[var(--grey)]">
          此頁面目前僅確認學員端 Next.js 專案可正常啟動。
        </p>
      </section>
    </main>
  );
}
