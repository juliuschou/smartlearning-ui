export type EmptyMessageProps = {
  message: string;
  title?: string;
  className?: string;
};

export function EmptyMessage({
  message,
  title = "目前沒有內容",
  className = "",
}: EmptyMessageProps) {
  return (
    <section
      aria-label={title}
      className={`rounded-xl border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center ${className}`}
    >
      <div
        aria-hidden="true"
        className="mx-auto mb-4 flex size-11 items-center justify-center rounded-full bg-white text-lg text-slate-500 shadow-sm"
      >
        —
      </div>
      <h2 className="text-base font-semibold text-slate-900">{title}</h2>
      <p className="mx-auto mt-2 max-w-prose text-sm leading-6 text-slate-600">
        {message}
      </p>
    </section>
  );
}
