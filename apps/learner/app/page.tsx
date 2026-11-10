export default function LearnerHome() {
  return (
    <main className="mx-auto flex min-h-screen max-w-6xl items-center px-6 py-12">
      <section className="w-full rounded-lg border border-[var(--line)] bg-[var(--card)] p-8 shadow-sm">
        <p className="text-sm font-medium text-[var(--pine)]">學員端</p>
        <h1 className="ui-heading mt-2 text-3xl font-semibold">學員端開發空殼</h1>
        <p className="mt-3 text-[var(--grey)]">
          此頁面目前僅確認學員端 Next.js 專案可正常啟動。
        </p>
        <p className="mt-6 border-t border-[var(--line)] pt-4 text-sm text-[var(--grey)]">
          開發網址：<span className="font-mono">http://localhost:3002</span>
        </p>
      </section>
    </main>
  );
}
