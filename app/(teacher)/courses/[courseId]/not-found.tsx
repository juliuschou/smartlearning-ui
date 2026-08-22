import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-16">
      <div className="w-full max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight">找不到課程</h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          這個課程不存在或目前無法查看，請返回老師首頁。
        </p>
        <Link
          href="/teacher"
          className="mt-5 inline-flex rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 focus-visible:ring-offset-2 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          返回老師首頁
        </Link>
      </div>
    </main>
  );
}
