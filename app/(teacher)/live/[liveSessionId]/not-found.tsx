export default function LiveClassroomNotFound() {
  return (
    <section
      role="alert"
      aria-labelledby="live-classroom-not-found-heading"
      className="rounded-md border border-zinc-200 px-4 py-4 dark:border-zinc-800"
    >
      <h2 id="live-classroom-not-found-heading" className="font-semibold">
        找不到這堂課
      </h2>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
        請確認連結仍然有效。
      </p>
    </section>
  );
}
