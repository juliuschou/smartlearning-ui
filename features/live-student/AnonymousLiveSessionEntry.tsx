"use client";

import { useSyncExternalStore } from "react";
import { LearnerLiveSessionView } from "@/features/live-student/LearnerLiveSessionView";
import { getAnonymousParticipantCredential } from "@/lib/live/anonymous-participant-credential";

export function AnonymousLiveSessionEntry({
  liveSessionId,
}: {
  liveSessionId: string;
}) {
  const credential = useSyncExternalStore(
    () => () => undefined,
    () => getAnonymousParticipantCredential(liveSessionId),
    () => null,
  );

  if (credential === null && typeof window === "undefined") {
    return (
      <p role="status" aria-live="polite">
        載入匿名參與狀態…
      </p>
    );
  }

  if (!credential) {
    return (
      <section
        role="alert"
        className="space-y-3 rounded-md border border-zinc-200 px-4 py-4 dark:border-zinc-800"
      >
        <h2 className="font-semibold">匿名參與已失效</h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          找不到此裝置的參與憑證，請重新加入課堂。
        </p>
        <a
          href="/join"
          className="inline-block rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium dark:border-zinc-700"
        >
          返回加入課堂
        </a>
      </section>
    );
  }

  return (
    <LearnerLiveSessionView
      liveSessionId={liveSessionId}
      actor={{
        kind: "anonymous",
        liveSessionId: credential.liveSessionId,
        sessionCode: credential.sessionCode,
      }}
    />
  );
}
