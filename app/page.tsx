import Link from "next/link";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col justify-center px-6 py-14">
      <header className="mb-10">
        <p className="text-sm font-medium text-[var(--pine)]">智學互動平台</p>
        <h1 className="ui-heading mt-2 text-3xl font-semibold sm:text-4xl">
          請選擇使用入口
        </h1>
        <p className="mt-3 max-w-prose text-[var(--grey)]">
          請依照你的使用身分選擇下方入口。
        </p>
      </header>

      <nav aria-label="選擇使用入口" className="grid gap-5 sm:grid-cols-2">
        <Link
          href="/admin"
          className="rounded-lg border border-[var(--line)] bg-[var(--card)] p-7 transition-colors hover:border-[var(--ink)] hover:bg-white"
        >
          <span className="ui-heading block text-2xl font-semibold">管理端</span>
          <span className="mt-2 block text-sm text-[var(--grey)]">
            進入管理端開發空殼
          </span>
        </Link>
        <Link
          href="/learner"
          className="rounded-lg border border-[var(--line)] bg-[var(--card)] p-7 transition-colors hover:border-[var(--pine)] hover:bg-white"
        >
          <span className="ui-heading block text-2xl font-semibold">學員端</span>
          <span className="mt-2 block text-sm text-[var(--grey)]">
            進入學員端開發空殼
          </span>
        </Link>
      </nav>
    </main>
  );
}
