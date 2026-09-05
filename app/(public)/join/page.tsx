import type { Metadata } from "next";
import { AnonymousJoinForm } from "@/features/live-student/AnonymousJoinForm";

export const metadata: Metadata = {
  title: "加入課堂 | 智學互動平台",
};

export default function AnonymousJoinPage() {
  return (
    <main className="flex flex-1 flex-col px-6 py-10">
      <div className="mx-auto w-full max-w-3xl">
        <h1 className="text-xl font-semibold tracking-tight">加入課堂</h1>
        <div className="mt-6">
          <AnonymousJoinForm />
        </div>
      </div>
    </main>
  );
}
