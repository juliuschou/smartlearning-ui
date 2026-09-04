import type { Metadata } from "next";
import { LearnerLiveSessionView } from "@/features/live-student/LearnerLiveSessionView";

export const metadata: Metadata = {
  title: "課堂 | 智學互動平台",
};

type LearnerLivePageProps = {
  params: Promise<{ liveSessionId: string }>;
};

export default async function LearnerLivePage({
  params,
}: LearnerLivePageProps) {
  const { liveSessionId } = await params;

  return (
    <main className="flex flex-1 flex-col px-6 py-10">
      <div className="mx-auto w-full max-w-3xl">
        <h1 className="mt-4 text-xl font-semibold tracking-tight">課堂</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          查看目前課堂狀態與開放題目。
        </p>
        <div className="mt-6">
          <LearnerLiveSessionView liveSessionId={liveSessionId} />
        </div>
      </div>
    </main>
  );
}
