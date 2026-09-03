import type { Metadata } from "next";
import Link from "next/link";
import { LiveClassroomView } from "@/features/live-teacher/LiveClassroomView";

export const metadata: Metadata = {
  title: "課堂控台 | 智學互動平台",
};

type LiveClassroomPageProps = {
  params: Promise<{ liveSessionId: string }>;
};

export default async function LiveClassroomPage({
  params,
}: LiveClassroomPageProps) {
  const { liveSessionId } = await params;

  return (
    <main className="flex flex-1 flex-col px-6 py-10">
      <div className="mx-auto w-full max-w-3xl">
        <Link
          href="/teacher"
          className="text-sm font-medium text-zinc-600 underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 dark:text-zinc-400"
        >
          ← 返回老師首頁
        </Link>
        <h1 className="mt-4 text-xl font-semibold tracking-tight">課堂控台</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          即時掌握課堂狀態、逐題開放作答並查看結果。
        </p>
        <div className="mt-6">
          <LiveClassroomView liveSessionId={liveSessionId} />
        </div>
      </div>
    </main>
  );
}
