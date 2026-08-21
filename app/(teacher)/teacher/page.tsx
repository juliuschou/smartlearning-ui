import type { Metadata } from "next";
import { TeacherHomeView } from "@/features/teacher/TeacherHomeView";

export const metadata: Metadata = {
  title: "老師首頁 | 智學互動平台",
};

export default function TeacherHomePage() {
  return (
    <main className="flex flex-1 flex-col px-6 py-10">
      <div className="mx-auto w-full max-w-3xl">
        <h1 className="text-xl font-semibold tracking-tight">老師首頁</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          查看你的帳號資訊與開課權限。
        </p>
        <div className="mt-6">
          <TeacherHomeView />
        </div>
      </div>
    </main>
  );
}
