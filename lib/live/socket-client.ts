import { API_BASE } from "@/lib/api/client";
import { io } from "socket.io-client";
import type { ManagerOptions, Socket, SocketOptions } from "socket.io-client";

export type SocketConnectionStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "failed";

export type SocketClientOptions = {
  /** Socket.IO server origin. Defaults to the origin of NEXT_PUBLIC_API_BASE. */
  url?: string;
  /** Socket.IO transport options, including reconnection policy. */
  socketOptions?: Partial<ManagerOptions & SocketOptions>;
};

export type SocketClient = {
  /** Open the connection, reusing the current socket if one already exists. */
  connect(): Socket;
  /** Close the current connection and release its lifecycle listeners. */
  disconnect(): void;
  /** Read the latest connection state. */
  getStatus(): SocketConnectionStatus;
  /** Subscribe to state changes. The current state is emitted immediately. */
  subscribe(listener: (status: SocketConnectionStatus) => void): () => void;
};

function defaultSocketUrl(): string {
  const baseOrigin =
    typeof window === "undefined" ? "http://localhost:3001" : window.location.origin;
  return new URL(API_BASE, baseOrigin).origin;
}

/** Create an explicitly managed Socket.IO connection without connecting on import. */
export function createSocketClient(options: SocketClientOptions = {}): SocketClient {
  const url = options.url ?? defaultSocketUrl();
  const socketOptions = options.socketOptions ?? {};
  const listeners = new Set<(status: SocketConnectionStatus) => void>();
  let socket: Socket | null = null;
  let status: SocketConnectionStatus = "disconnected";

  function setStatus(nextStatus: SocketConnectionStatus): void {
    if (status === nextStatus) return;
    status = nextStatus;
    for (const listener of listeners) listener(status);
  }

  function cleanupSocket(): void {
    if (!socket) return;
    socket.off("connect", onConnect);
    socket.off("disconnect", onDisconnect);
    socket.off("connect_error", onConnectError);
    socket.io.off("reconnect_attempt", onReconnectAttempt);
    socket.io.off("reconnect", onReconnect);
    socket.io.off("reconnect_failed", onReconnectFailed);
    socket.disconnect();
    socket = null;
  }

  function onConnect(): void {
    setStatus("connected");
  }

  function onDisconnect(): void {
    setStatus(socket?.active ? "reconnecting" : "disconnected");
  }

  function onConnectError(): void {
    // Socket.IO reports automatic attempts through the manager. Before the
    // first connection succeeds, remain in the connecting state.
    if (socket?.active) setStatus("reconnecting");
    else setStatus("failed");
  }

  function onReconnectAttempt(): void {
    setStatus("reconnecting");
  }

  function onReconnect(): void {
    setStatus("connected");
  }

  function onReconnectFailed(): void {
    setStatus("failed");
  }

  return {
    connect() {
      if (socket) {
        if (!socket.connected && !socket.active) {
          setStatus("connecting");
          socket.connect();
        }
        return socket;
      }

      setStatus("connecting");
      socket = io(url, {
        ...socketOptions,
        reconnection: socketOptions.reconnection ?? true,
        reconnectionAttempts: socketOptions.reconnectionAttempts ?? 5,
        reconnectionDelay: socketOptions.reconnectionDelay ?? 1_000,
        reconnectionDelayMax: socketOptions.reconnectionDelayMax ?? 5_000,
        autoConnect: false,
      });
      socket.on("connect", onConnect);
      socket.on("disconnect", onDisconnect);
      socket.on("connect_error", onConnectError);
      socket.io.on("reconnect_attempt", onReconnectAttempt);
      socket.io.on("reconnect", onReconnect);
      socket.io.on("reconnect_failed", onReconnectFailed);
      socket.connect();
      return socket;
    },
    disconnect() {
      cleanupSocket();
      setStatus("disconnected");
    },
    getStatus() {
      return status;
    },
    subscribe(listener) {
      listeners.add(listener);
      listener(status);
      return () => listeners.delete(listener);
    },
  };
}
