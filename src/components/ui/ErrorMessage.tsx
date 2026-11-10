export type ErrorMessageProps = {
  message: string;
  title?: string;
  onRetry?: () => void;
  retryLabel?: string;
  className?: string;
};

export function ErrorMessage({
  message,
  title = "發生問題",
  onRetry,
  retryLabel = "再試一次",
  className = "",
}: ErrorMessageProps) {
  return (
    <section
      role="alert"
      className={`rounded-xl border border-rose-200 bg-rose-50 px-6 py-5 text-center ${className}`}
    >
      <h2 className="text-base font-semibold text-rose-950">{title}</h2>
      <p className="mx-auto mt-2 max-w-prose text-sm leading-6 text-rose-900">
        {message}
      </p>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="mt-4 inline-flex min-h-10 items-center justify-center rounded-lg bg-rose-700 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-rose-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-700"
        >
          {retryLabel}
        </button>
      ) : null}
    </section>
  );
}
