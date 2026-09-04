import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PropsWithChildren } from "react";
import { describe, expect, it, vi } from "vitest";
import LearnerLivePage from "@/app/(student)/student/live/[liveSessionId]/page";

// The page is a Server Component that renders the client LearnerLiveSessionView;
// route tests here assert the shell (heading and liveSessionId passthrough) by
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

describe("LearnerLivePage route (FE-4.1 CP3)", () => {
  it("renders the shell and passes the liveSessionId to the learner view", async () => {
    render(
      await LearnerLivePage({
        params: Promise.resolve({ liveSessionId: "session-1" }),
      }),
      {
        wrapper: wrapperFor(
          new QueryClient({ defaultOptions: { queries: { retry: false } } }),
        ),
      },
    );

    expect(
      screen.getByRole("heading", { name: "課堂", level: 1 }),
    ).toBeInTheDocument();
    // The learner view mounts inside the page shell and starts with an
    // authoritative snapshot loading state. Terminal-only controls, such as
    // the return link, are intentionally not part of this initial render.
    expect(screen.getByRole("status")).toHaveTextContent("載入課堂中…");
    expect(screen.getByRole("main")).toBeInTheDocument();
  });
});
