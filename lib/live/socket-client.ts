"use client";

import { useCallback, useEffect, useState } from "react";
import { io, type Socket } from "socket.io-client";

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
  lastEventSeq?: string;
}

/**
 * Create (but do not connect) a Socket.IO client bound to the `/live` namespace.
 * The durable realtime contract requires `websocket` transport and the session cookie.
 */
export function createLiveSocket({
  liveSessionId,
  lastEventSeq,
}: CreateLiveSocketOptions): Socket {
  return io(liveSocketBase() + SOCKET_LOOKUP, {
    auth: {
      liveSessionId,
      ...(lastEventSeq ? { lastEventSeq } : {}),
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

export interface LiveConnection {
  status: LiveConnectionStatus;
  /** Stable code from the server `error` event (e.g. `REALTIME_UNAVAILABLE`). */
  errorCode: string | null;
  /** Ask the server for a fresh authoritative snapshot (reconnect/recovery). */
  sendSnapshotFetch: (lastEventSeq?: string) => void;
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
export function useLiveConnection(liveSessionId: string): LiveConnection {
  const [socket] = useState<Socket | null>(() =>
    liveSessionId ? createLiveSocket({ liveSessionId }) : null,
  );
  const [status, setStatus] = useState<LiveConnectionStatus>(() =>
    liveSessionId ? "connecting" : "idle",
  );
  const [errorCode, setErrorCode] = useState<string | null>(null);

  useEffect(() => {
    if (!socket) return;
    const onConnect = () => setStatus("connected");
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
    socket.on("disconnect", onDisconnect);
    socket.on("connect_error", onConnectError);
    socket.on("error", onError);
    socket.connect();

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("connect_error", onConnectError);
      socket.off("error", onError);
      socket.disconnect();
    };
  }, [socket]);

  const sendSnapshotFetch = useCallback(
    (cursor?: string) => {
      if (!socket || !socket.connected) return;
      socket.emit("snapshot.fetch", cursor ? { lastEventSeq: cursor } : {});
    },
    [socket],
  );

  return {
    status,
    errorCode,
    sendSnapshotFetch,
    socket,
  };
}
