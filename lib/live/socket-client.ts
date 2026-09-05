"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { getAnonymousParticipantCredential } from "@/lib/live/anonymous-participant-credential";
import type { ParticipantActor } from "@/lib/api/types";

/**
 * Teacher live-classroom realtime adapter (FE-3.2).
 *
 * Thin typed wrapper around `socket.io-client` for the backend `/live` namespace.
 * Teacher is identified by the `__Host-session` cookie (sent via `withCredentials`);
 * the server joins the socket to `session:<id>` and `teacher:<id>` rooms based purely
 * on the authenticated account + `auth.liveSessionId`. `SOCKET_BASE` mirrors the REST
 * `API_BASE` (backend origin without the `/api/v1` path suffix).
 */

const SOCKET_LOOKUP = "/live";
const DECIMAL_SEQUENCE = /^(?:0|[1-9][0-9]*)$/u;

/**
 * Backend origin for the Socket.IO `io()` connection. Derived from the same env the
 * REST client uses (`NEXT_PUBLIC_API_BASE`, default `http://localhost:3000/api/v1`) by
 * stripping the `/api/v1` suffix so only the origin remains.
 */
export function liveSocketBase(): string {
  const base =
    process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:3000/api/v1";
  return base.replace(/\/api\/v1\/?$/, "");
}

export interface CreateLiveSocketOptions {
  liveSessionId: string;
  actor?: ParticipantActor;
  lastEventSeq?: string;
}

/**
 * Create (but do not connect) a Socket.IO client bound to the `/live` namespace.
 * The durable realtime contract requires `websocket` transport and the session cookie.
 */
export function createLiveSocket({
  liveSessionId,
  actor = { kind: "student" },
  lastEventSeq,
}: CreateLiveSocketOptions): Socket | null {
  const auth =
    actor.kind === "anonymous"
      ? (() => {
          const credential = getAnonymousParticipantCredential(liveSessionId);
          if (!credential || credential.sessionCode !== actor.sessionCode)
            return null;
          return {
            participantToken: credential.participantToken,
            sessionCode: credential.sessionCode,
          };
        })()
      : { liveSessionId };
  if (!auth) return null;
  return io(liveSocketBase() + SOCKET_LOOKUP, {
    auth: {
      ...auth,
      ...(actor.kind === "student" ? { liveSessionId } : {}),
      ...(lastEventSeq && DECIMAL_SEQUENCE.test(lastEventSeq)
        ? { lastEventSeq }
        : {}),
    },
    transports: ["websocket"],
    withCredentials: true,
  });
}

/**
 * Connection lifecycle states surfaced to the UI. `connected` means the socket is up
 * and authenticated; `connecting` covers initial connect and automatic reconnects.
 */
export type LiveConnectionStatus =
  "idle" | "connecting" | "connected" | "disconnected" | "error";

function setSocketCursor(socket: Socket, eventSeq: string | null): void {
  const auth = socket.auth as Record<string, unknown>;
  if (eventSeq !== null) auth.lastEventSeq = eventSeq;
  else delete auth.lastEventSeq;
}

export interface LiveConnection {
  status: LiveConnectionStatus;
  /** Stable code from the server `error` event (e.g. `REALTIME_UNAVAILABLE`). */
  errorCode: string | null;
  /** Update the lossless reconnect cursor after accepting a wire message. */
  acceptEventSeq: (eventSeq: string | null) => void;
  /** Ask the server for a fresh authoritative snapshot (reconnect/recovery). */
  sendSnapshotFetch: (lastEventSeq?: string) => void;
  /** Stop reconnecting and close the socket after confirmed access loss. */
  terminate: () => void;
  /** Underlying socket for event listeners. */
  socket: Socket | null;
}

/**
 * Own the Socket.IO client lifecycle for one live session.
 *
 * The socket is created once per mounted session (client-only, via lazy state init)
 * and held in state so the event hook can subscribe to it across renders. The effect
 * only attaches listeners and connects; every status transition happens in an async
 * socket callback (never synchronously in the effect body). On unmount the socket is
 * disconnected. The hook deliberately does NOT write React Query state — realtime
 * events only invalidate/seed the authoritative REST caches.
 */
export function useLiveConnection(
  liveSessionId: string,
  actor: ParticipantActor = { kind: "student" },
): LiveConnection {
  const actorKey =
    actor.kind === "anonymous"
      ? `anonymous:${liveSessionId}:${actor.sessionCode}`
      : `student:${liveSessionId}`;
  const socket = useMemo(
    () => (liveSessionId ? createLiveSocket({ liveSessionId, actor }) : null),
    [
      actor.kind,
      actor.kind === "anonymous" ? actor.sessionCode : "",
      actorKey,
      liveSessionId,
    ],
  );
  const [status, setStatus] = useState<LiveConnectionStatus>(() =>
    socket ? "connecting" : "idle",
  );
  const [errorCode, setErrorCode] = useState<string | null>(null);

  useEffect(() => {
    if (!socket) return;
    const onConnect = () => {
      setStatus("connected");
      setErrorCode(null);
    };
    const onReconnectAttempt = () => setStatus("connecting");
    const onDisconnect = () => setStatus("disconnected");
    const onConnectError = () => {
      setStatus("error");
      setErrorCode("CONNECTION_FAILED");
    };
    const onError = (payload?: { code?: string }) => {
      setStatus("error");
      setErrorCode(payload?.code ?? "REALTIME_UNAVAILABLE");
    };

    socket.on("connect", onConnect);
    socket.on("reconnect_attempt", onReconnectAttempt);
    socket.on("disconnect", onDisconnect);
    socket.on("connect_error", onConnectError);
    socket.on("error", onError);
    socket.connect();

    return () => {
      socket.off("connect", onConnect);
      socket.off("reconnect_attempt", onReconnectAttempt);
      socket.off("disconnect", onDisconnect);
      socket.off("connect_error", onConnectError);
      socket.off("error", onError);
      socket.disconnect();
    };
  }, [socket]);

  const acceptEventSeq = useCallback(
    (eventSeq: string | null) => {
      if (!socket) return;
      setSocketCursor(socket, eventSeq);
    },
    [socket],
  );

  const sendSnapshotFetch = useCallback(
    (cursor?: string) => {
      if (!socket || !socket.connected) return;
      socket.emit("snapshot.fetch", cursor ? { lastEventSeq: cursor } : {});
    },
    [socket],
  );
  const terminate = useCallback(() => {
    if (!socket) return;
    socket.io.reconnection(false);
    socket.disconnect();
  }, [socket]);

  return {
    status,
    errorCode,
    acceptEventSeq,
    sendSnapshotFetch,
    terminate,
    socket,
  };
}
