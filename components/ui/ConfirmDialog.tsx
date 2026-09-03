"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { ErrorAlert } from "@/components/ui/ErrorAlert";

/**
 * Shared confirmation dialog (FE-3.3.6).
 *
 * Encapsulates the accessible dialog shell used by roster removal and the live
 * session close/cancel confirmations: fixed overlay, `role="dialog"` + `aria-modal`,
 * Esc-to-close, a minimal Tab focus trap, and an optional stable-code error alert that
 * stays inside the dialog on failure. The caller supplies the heading, body, and the
 * confirm/cancel button labels + pending state.
 */
export function ConfirmDialog({
  open,
  onClose,
  headingId,
  heading,
  body,
  confirmLabel,
  cancelLabel = "取消",
  pendingLabel,
  isPending,
  errorCode,
  errorId,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  onClose: () => void;
  headingId: string;
  heading: string;
  body: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  pendingLabel: string;
  isPending: boolean;
  errorCode: string | null;
  errorId: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const dialog = dialogRef.current;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    dialog?.querySelector<HTMLElement>("button")?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
        return;
      }
      // Minimal focus trap: keep Tab cycling inside the dialog.
      if (event.key !== "Tab" || !dialog) return;
      const focusables = dialog.querySelectorAll<HTMLElement>("button");
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previouslyFocused?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        className="w-full max-w-sm rounded-md border border-zinc-200 bg-white px-4 py-4 shadow-lg dark:border-zinc-800 dark:bg-zinc-950"
        onClick={(event) => event.stopPropagation()}
      >
        <h3 id={headingId} className="text-sm font-semibold">
          {heading}
        </h3>
        <div className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          {body}
        </div>
        {errorCode ? (
          <div className="mt-3">
            <ErrorAlert error={{ code: errorCode }} id={errorId} />
          </div>
        ) : null}
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={isPending}
            className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium transition hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isPending}
            className="rounded-md bg-red-700 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-red-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPending ? pendingLabel : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
