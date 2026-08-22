import type { Metadata } from "next";
import { CourseCreateForm } from "@/features/courses/CourseCreateForm";

export const metadata: Metadata = {
  title: "建立課程 | 智學互動平台",
};

export default function NewCoursePage() {
  return (
    <main className="flex flex-1 flex-col px-6 py-10">
      <div className="mx-auto w-full max-w-3xl">
        <h1 className="text-xl font-semibold tracking-tight">建立課程</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          建立一門課程，設定課程名稱與說明。
        </p>
        <div className="mt-6 flex justify-center">
          <CourseCreateForm />
        </div>
      </div>
    </main>
  );
}
