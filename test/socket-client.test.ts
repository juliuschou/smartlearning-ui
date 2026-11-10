import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createSocketClient,
  type SocketConnectionStatus,
} from "@/lib/live/socket-client";

const { ioMock } = vi.hoisted(() => ({ ioMock: vi.fn() }));
vi.mock("socket.io-client", () => ({ io: ioMock }));

type Handler = (...args: unknown[]) => void;

function eventEmitter() {
  const handlers = new Map<string, Set<Handler>>();
  return {
    on(event: string, handler: Handler) {
      const eventHandlers = handlers.get(event) ?? new Set<Handler>();
      eventHandlers.add(handler);
      handlers.set(event, eventHandlers);
      return this;
    },
    off(event: string, handler?: Handler) {
      if (!handler) handlers.delete(event);
      else handlers.get(event)?.delete(handler);
      return this;
    },
    emit(event: string, ...args: unknown[]) {
      for (const handler of handlers.get(event) ?? []) handler(...args);
    },
    count(event: string) {
      return handlers.get(event)?.size ?? 0;
    },
  };
}

type FakeSocket = ReturnType<typeof eventEmitter> & {
  io: ReturnType<typeof eventEmitter>;
  connected: boolean;
  active: boolean;
  connect: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
};

function fakeSocket(): FakeSocket {
  const events = eventEmitter();
  const manager = eventEmitter();
  const socket = Object.assign(events, {
    io: manager,
    connected: false,
    active: false,
    connect: vi.fn(function (this: { active: boolean }) {
      this.active = true;
      return socket;
    }),
    disconnect: vi.fn(function (this: { active: boolean; connected: boolean }) {
      this.active = false;
      this.connected = false;
      return socket;
    }),
  });
  return socket;
}

let socket: ReturnType<typeof fakeSocket>;

beforeEach(() => {
  socket = fakeSocket();
  ioMock.mockReset().mockReturnValue(socket);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("Socket.IO client wrapper", () => {
  it("opens explicitly with reconnect enabled and reports connection states", () => {
    const client = createSocketClient({ url: "https://realtime.example.test" });
    const seen: SocketConnectionStatus[] = [];
    client.subscribe((status) => seen.push(status));

    const returnedSocket = client.connect();
    expect(returnedSocket).toBe(socket);
    expect(ioMock).toHaveBeenCalledWith("https://realtime.example.test", {
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1_000,
      reconnectionDelayMax: 5_000,
      autoConnect: false,
    });
    expect(socket.connect).toHaveBeenCalledTimes(1);
    expect(client.getStatus()).toBe("connecting");

    socket.connected = true;
    socket.emit("connect");
    expect(client.getStatus()).toBe("connected");

    socket.connected = false;
    socket.emit("disconnect", "transport close");
    expect(client.getStatus()).toBe("reconnecting");
    socket.io.emit("reconnect_attempt", 1);
    expect(client.getStatus()).toBe("reconnecting");
    socket.connected = true;
    socket.io.emit("reconnect");
    expect(client.getStatus()).toBe("connected");
    expect(seen).toEqual([
      "disconnected",
      "connecting",
      "connected",
      "reconnecting",
      "connected",
    ]);
  });

  it("uses API_BASE origin by default and allows Socket.IO options to be overridden", () => {
    const client = createSocketClient({
      socketOptions: { reconnection: false, reconnectionAttempts: 2 },
    });

    client.connect();

    expect(ioMock).toHaveBeenCalledWith(
      new URL(
        process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:3000/api/v1",
        window.location.origin,
      ).origin,
      {
        reconnection: false,
        reconnectionAttempts: 2,
        reconnectionDelay: 1_000,
        reconnectionDelayMax: 5_000,
        autoConnect: false,
      },
    );
  });

  it("reports terminal connection failure and allows a new explicit attempt", () => {
    const client = createSocketClient({ url: "http://localhost:3000" });
    client.connect();
    socket.active = false;
    socket.emit("connect_error", new Error("unavailable"));
    expect(client.getStatus()).toBe("failed");

    client.connect();
    expect(socket.connect).toHaveBeenCalledTimes(2);
    expect(client.getStatus()).toBe("connecting");
  });

  it("reports exhausted retries and manual disconnect without retaining event handlers", () => {
    const client = createSocketClient({ url: "http://localhost:3000" });
    const statuses: SocketConnectionStatus[] = [];
    client.subscribe((status) => statuses.push(status));
    client.connect();
    socket.io.emit("reconnect_failed");
    expect(client.getStatus()).toBe("failed");

    client.disconnect();
    expect(client.getStatus()).toBe("disconnected");
    expect(socket.disconnect).toHaveBeenCalledTimes(1);
    expect(socket.count("connect")).toBe(0);
    expect(socket.count("disconnect")).toBe(0);
    expect(socket.io.count("reconnect_attempt")).toBe(0);
    expect(statuses.at(-1)).toBe("disconnected");
  });

  it("reuses one socket and supports removing status subscribers", () => {
    const client = createSocketClient({ url: "http://localhost:3000" });
    const listener = vi.fn();
    const unsubscribe = client.subscribe(listener);
    const firstSocket = client.connect();
    const secondSocket = client.connect();

    expect(secondSocket).toBe(firstSocket);
    expect(ioMock).toHaveBeenCalledTimes(1);
    expect(socket.connect).toHaveBeenCalledTimes(1);
    expect(socket.count("connect")).toBe(1);

    unsubscribe();
    socket.connected = true;
    socket.emit("connect");
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("disconnects and creates a fresh socket on the next connect", () => {
    const client = createSocketClient({ url: "http://localhost:3000" });
    client.connect();
    client.disconnect();

    const nextSocket = fakeSocket();
    ioMock.mockReturnValueOnce(nextSocket);
    expect(client.connect()).toBe(nextSocket);
    expect(ioMock).toHaveBeenCalledTimes(2);
  });
});
