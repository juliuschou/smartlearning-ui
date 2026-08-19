import type { Metadata } from "next";
import { MyCoursesView } from "@/features/student/MyCoursesView";

export const metadata: Metadata = {
  title: "我的課程 | 智學互動平台",
};

/**
 * Student home — 我的課程.
 *
 * Server-component shell for `/student`. The client `MyCoursesView` reads the
 * session via `useSession()` and fetches `GET /me/courses` (StudentGuard).
 * Enrollment (adding a student to a course) is a teacher/admin flow not yet
 * built in the UI, so a freshly-created student typically sees the empty state
 * until an admin enrolls them via the backend/CLI.
 */
export default function StudentHomePage() {
  return (
    <main className="flex flex-1 flex-col px-6 py-10">
      <div className="mx-auto w-full max-w-3xl">
        <h1 className="text-xl font-semibold tracking-tight">我的課程</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          你已加選且有效的課程。
        </p>
        <div className="mt-6">
          <MyCoursesView />
        </div>
      </div>
    </main>
  );
}
