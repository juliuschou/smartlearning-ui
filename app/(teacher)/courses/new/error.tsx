"use client";

type CourseCreateError = Error & {
  digest?: string;
};

type CourseCreateErrorProps = {
  error: CourseCreateError;
  reset: () => void;
};

export default function CourseCreateError({
  reset,
}: CourseCreateErrorProps) {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-16">
      <div
        role="alert"
        className="w-full max-w-md rounded-md border border-red-200 bg-red-50 px-4 py-4 text-center dark:border-red-900 dark:bg-red-950"
      >
        <h1 className="text-base font-semibold text-red-900 dark:text-red-100">
          建立課程頁面暫時無法載入
        </h1>
        <p className="mt-2 text-sm text-red-800 dark:text-red-200">
          發生未預期的問題，請再試一次。
        </p>
        <button
          type="button"
          onClick={reset}
          className="mt-4 rounded-md bg-red-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-700 focus-visible:ring-offset-2 dark:bg-red-100 dark:text-red-950 dark:hover:bg-red-200"
        >
          再試一次
        </button>
      </div>
    </main>
  );
}
