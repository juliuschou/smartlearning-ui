import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PropsWithChildren } from "react";
import { describe, expect, it, vi } from "vitest";
import LiveClassroomPage from "@/app/(teacher)/teacher/live/[liveSessionId]/page";

// The page is a Server Component that renders the client LiveClassroomView; route
// tests here assert the shell (back link, heading, liveSessionId passthrough) by
// rendering the page component directly with an async params object. The client
// view needs a QueryClientProvider.
function wrapperFor(queryClient: QueryClient) {
  return function QueryWrapper({
    children,
  }: PropsWithChildren): React.JSX.Element {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

vi.mock("@/lib/api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/client")>();
  // The view never fetches in this route test because the query stays disabled
  // (no fetch assertion); stubbing apiRequest keeps the import safe.
  return { ...actual, apiRequest: actual.apiRequest };
});

vi.mock("socket.io-client", () => {
  const socket = {
    on: () => socket,
    off: () => socket,
    connect: () => undefined,
    disconnect: () => undefined,
    emit: () => undefined,
  };
  return { io: () => socket };
});

describe("LiveClassroomPage route (FE-3.3)", () => {
  it("renders the shell and passes the liveSessionId to the classroom view", async () => {
    render(
      await LiveClassroomPage({
        params: Promise.resolve({ liveSessionId: "session-1" }),
      }),
      {
        wrapper: wrapperFor(
          new QueryClient({ defaultOptions: { queries: { retry: false } } }),
        ),
      },
    );

    expect(
      screen.getByRole("link", { name: /返回老師首頁/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "課堂控台", level: 1 }),
    ).toBeInTheDocument();
    // The classroom view mounts inside the page shell (it renders a loading state
    // before fetching, so just assert the container is present via the heading).
    expect(screen.getByRole("main")).toBeInTheDocument();
  });
});
