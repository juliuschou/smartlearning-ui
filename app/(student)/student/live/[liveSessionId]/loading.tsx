export default function LearnerLiveLoading() {
  return (
    <p
      role="status"
      aria-live="polite"
      className="text-sm text-zinc-600 dark:text-zinc-400"
    >
      載入課堂中…
    </p>
  );
}
