"use client";

type LearnerLiveError = Error & {
  digest?: string;
};

type LearnerLiveErrorProps = {
  error: LearnerLiveError;
  retry: () => void;
};

export default function LearnerLiveError({ retry }: LearnerLiveErrorProps) {
  return (
    <div className="space-y-4">
      <div
        role="alert"
        className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200"
      >
        <span aria-hidden="true" className="mr-1.5">
          ⚠
        </span>
        課堂頁面暫時無法載入，請再試一次。
      </div>
      <button
        type="button"
        onClick={retry}
        className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium transition hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 dark:border-zinc-700 dark:hover:bg-zinc-900"
      >
        再試一次
      </button>
    </div>
  );
}
