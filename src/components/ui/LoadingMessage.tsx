export type LoadingMessageProps = {
  message?: string;
  className?: string;
};

export function LoadingMessage({
  message = "正在載入…",
  className = "",
}: LoadingMessageProps) {
  return (
    <div
      role="status"
      aria-label="讀取中"
      className={`flex items-center justify-center gap-3 rounded-xl border border-slate-200 bg-white px-5 py-8 text-center text-sm text-slate-600 shadow-sm ${className}`}
    >
      <span
        aria-hidden="true"
        className="size-4 animate-spin rounded-full border-2 border-slate-300 border-t-blue-600"
      />
      <span>{message}</span>
    </div>
  );
}
