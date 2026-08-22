export default function Loading() {
  return (
    <main className="flex flex-1 items-center justify-center px-6 py-16">
      <p
        role="status"
        aria-live="polite"
        className="text-sm text-zinc-600 dark:text-zinc-400"
      >
        載入建立課程頁面中…
      </p>
    </main>
  );
}
