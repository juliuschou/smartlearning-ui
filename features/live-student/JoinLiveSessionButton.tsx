"use client";

import { useRouter } from "next/navigation";
import { ErrorAlert } from "@/components/ui/ErrorAlert";
import { ApiRequestError } from "@/lib/api/client";
import { useJoinLiveSession } from "@/lib/api/participant-live-sessions";
import type { CurrentJoinableSession } from "@/lib/api/types";

const ENTRY_LABELS: Record<CurrentJoinableSession["status"], string> = {
  waiting: "等候中課堂入口",
  active: "進入課堂",
};

/**
 * Row-local join control for a course's current joinable session (FE-4.1 CP2).
 *
 * Renders only from the server discovery projection (`currentJoinableSession`):
 * `waiting` → waiting-room entry, `active` → enter classroom, and any unexpected
 * status fails closed (no entry). On click it joins with the discovery
 * `sessionCode` and, on success, navigates to `/student/live/:id` using only the
 * server-returned `liveSession.id`. A `SESSION_NOT_JOINABLE` race (the session
 * closed between discovery and join) surfaces a curated inline error plus a
 * discovery refresh; raw backend messages are never shown.
 */
export function JoinLiveSessionButton({
  session,
  onRefreshDiscovery,
}: {
  session: CurrentJoinableSession;
  onRefreshDiscovery: () => void;
}) {
  const router = useRouter();
  const join = useJoinLiveSession();

  const label = ENTRY_LABELS[session.status];
  // Fail closed on any unexpected/terminal status the backend must never
  // advertise as joinable.
  if (!label) return null;

  const handleJoin = () => {
    if (join.isPending) return;
    join.mutate(
      { sessionCode: session.sessionCode },
      {
        onSuccess: (response) => {
          router.replace(`/student/live/${response.liveSession.id}`);
        },
      },
    );
  };

  const isJoinableRace =
    join.error instanceof ApiRequestError &&
    join.error.code === "SESSION_NOT_JOINABLE";

  return (
    <div className="flex flex-col items-start gap-2">
      <button
        type="button"
        onClick={handleJoin}
        disabled={join.isPending}
        className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:hover:bg-zinc-900"
      >
        {join.isPending ? "加入中…" : label}
      </button>
      {join.error ? (
        <ErrorAlert
          error={join.error}
          id={`join-error-${session.id}`}
          className="max-w-full"
        />
      ) : null}
      {isJoinableRace ? (
        <button
          type="button"
          onClick={onRefreshDiscovery}
          className="text-sm font-medium text-zinc-600 underline underline-offset-2 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
        >
          重新整理課堂狀態
        </button>
      ) : null}
    </div>
  );
}
