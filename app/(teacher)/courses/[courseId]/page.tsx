import type { Metadata } from "next";
import Link from "next/link";
import { CourseDetailView } from "@/features/courses/CourseDetailView";
import { CourseRosterSection } from "@/features/enrollments/CourseRosterSection";

export const metadata: Metadata = {
  title: "課程詳情 | 智學互動平台",
};

type CourseDetailPageProps = {
  params: Promise<{ courseId: string }>;
};

export default async function CourseDetailPage({
  params,
}: CourseDetailPageProps) {
  const { courseId } = await params;

  return (
    <main className="flex flex-1 flex-col px-6 py-10">
      <div className="mx-auto w-full max-w-3xl">
        <Link
          href="/teacher"
          className="text-sm font-medium text-zinc-600 underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 dark:text-zinc-400"
        >
          ← 返回老師首頁
        </Link>
        <h1 className="mt-4 text-xl font-semibold tracking-tight">課程詳情</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          查看課程的伺服器狀態與唯一老師資訊。
        </p>
        <div className="mt-6">
          <CourseDetailView courseId={courseId} />
        </div>
        <div className="mt-10">
          <CourseRosterSection courseId={courseId} />
        </div>
      </div>
    </main>
  );
}
