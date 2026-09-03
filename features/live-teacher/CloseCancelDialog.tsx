"use client";

import { useState } from "react";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { ApiRequestError } from "@/lib/api/client";
import {
  useCloseLiveSession,
  useCancelLiveSession,
} from "@/lib/api/live-sessions";
import type { LiveSessionStatus } from "@/lib/api/types";

type ConfirmAction = "close" | "cancel" | null;

/**
 * Close / cancel confirmation (FE-3.3.6).
 *
 * Uses the shared `ConfirmDialog` (Esc close, focus trap, error stays in the dialog).
 * Close is available on a waiting/active session; cancel is available on waiting/active
 * and the backend enforces "no submissions when cancelling". On success the dialog
 * closes and the authoritative detail is invalidated by the mutation.
 */
export function CloseCancelDialog({
  liveSessionId,
  status,
}: {
  liveSessionId: string;
  status: LiveSessionStatus;
}) {
  const [action, setAction] = useState<ConfirmAction>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const closeSession = useCloseLiveSession();
  const cancelSession = useCancelLiveSession();

  const isTerminal = status === "closed" || status === "cancelled";
  const busy = closeSession.isPending || cancelSession.isPending;

  const confirm = async () => {
    if (!action) return;
    setErrorCode(null);
    try {
      if (action === "close") {
        await closeSession.mutateAsync({ liveSessionId });
      } else {
        await cancelSession.mutateAsync({ liveSessionId });
      }
      setAction(null);
    } catch (caught) {
      setErrorCode(
        caught instanceof ApiRequestError ? caught.code : "INTERNAL_ERROR",
      );
    }
  };

  if (isTerminal) return null;

  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        onClick={() => setAction("close")}
        disabled={busy}
        className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-zinc-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
      >
        結束課堂
      </button>
      <button
        type="button"
        onClick={() => setAction("cancel")}
        disabled={busy}
        className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium transition hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
      >
        取消課堂
      </button>

      <ConfirmDialog
        open={action !== null}
        onClose={() => setAction(null)}
        headingId="live-classroom-confirm-heading"
        heading={action === "close" ? "結束課堂" : "取消課堂"}
        body={
          action === "close"
            ? "結束課堂後，參與者的作答將被收斂並無法再開放。確定結束？"
            : "取消課堂將直接終止這堂課，且無法復原。確定取消？"
        }
        confirmLabel={action === "close" ? "確認結束" : "確認取消"}
        pendingLabel={action === "close" ? "結束中…" : "取消中…"}
        isPending={busy}
        errorCode={errorCode}
        errorId="live-classroom-confirm-error"
        onConfirm={() => void confirm()}
        onCancel={() => setAction(null)}
      />
    </div>
  );
}
