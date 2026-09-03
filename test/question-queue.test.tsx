import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PropsWithChildren } from "react";
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { QuestionQueue } from "@/features/live-teacher/QuestionQueue";
import { queryKeys } from "@/lib/api/query-keys";
import type { SessionQuestion } from "@/lib/api/types";

const mocks = vi.hoisted(() => ({
  apiRequest: vi.fn(),
}));

vi.mock("@/lib/api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/client")>();
  return { ...actual, apiRequest: mocks.apiRequest };
});

const apiRequestMock = mocks.apiRequest as unknown as Mock;

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}

function wrapperFor(queryClient: QueryClient) {
  return function QueryWrapper({
    children,
  }: PropsWithChildren): React.JSX.Element {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

function question(overrides: Partial<SessionQuestion> = {}): SessionQuestion {
  return {
    id: "sq-1",
    liveSessionId: "session-1",
    questionDefinitionId: "question-1",
    position: 0,
    status: "not_open",
    snapshotType: "poll",
    snapshotPrompt: "你最喜歡哪個科目？",
    snapshotSelectionMode: "single",
    openedAt: null,
    closedAt: null,
    options: [{ id: "opt-1", optionRef: "A", text: "數學", position: 0 }],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("QuestionQueue (FE-3.3.2 / FE-3.3.3)", () => {
  it("shows an empty message when there are no questions", () => {
    render(<QuestionQueue liveSessionId="session-1" questions={[]} />, {
      wrapper: wrapperFor(makeQueryClient()),
    });
    expect(screen.getByText("這堂課目前沒有題目。")).toBeInTheDocument();
  });

  it("renders the prompt, type, and status label for each question", () => {
    render(
      <QuestionQueue
        liveSessionId="session-1"
        questions={[question({ status: "open" })]}
      />,
      { wrapper: wrapperFor(makeQueryClient()) },
    );
    expect(screen.getByText("你最喜歡哪個科目？")).toBeInTheDocument();
    expect(screen.getByText(/選擇題/)).toBeInTheDocument();
    expect(screen.getByText(/作答中/)).toBeInTheDocument();
  });

  it("opens a not_open question via the open mutation", async () => {
    const opened = question({ status: "open" });
    apiRequestMock.mockResolvedValueOnce(opened);

    const queryClient = makeQueryClient();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    render(
      <QuestionQueue
        liveSessionId="session-1"
        questions={[question({ status: "not_open" })]}
      />,
      { wrapper: wrapperFor(queryClient) },
    );

    fireEvent.click(screen.getByRole("button", { name: "開放作答" }));

    await waitFor(() => expect(apiRequestMock).toHaveBeenCalledTimes(1));
    expect(apiRequestMock).toHaveBeenCalledWith(
      "/live-sessions/session-1/questions/sq-1/open",
      { method: "POST", mutate: true },
    );
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: queryKeys.liveSessions.detail("session-1"),
    });
  });

  it("closes an open question via the close mutation", async () => {
    const closed = question({ status: "closed" });
    apiRequestMock.mockResolvedValueOnce(closed);

    const queryClient = makeQueryClient();
    render(
      <QuestionQueue
        liveSessionId="session-1"
        questions={[question({ status: "open" })]}
      />,
      { wrapper: wrapperFor(queryClient) },
    );

    fireEvent.click(screen.getByRole("button", { name: "關閉作答" }));

    await waitFor(() => expect(apiRequestMock).toHaveBeenCalledTimes(1));
    expect(apiRequestMock).toHaveBeenCalledWith(
      "/live-sessions/session-1/questions/sq-1/close",
      { method: "POST", mutate: true },
    );
  });

  it("shows a disabled '已結束' state for a closed question (no reopen)", () => {
    render(
      <QuestionQueue
        liveSessionId="session-1"
        questions={[question({ status: "closed" })]}
      />,
      { wrapper: wrapperFor(makeQueryClient()) },
    );
    expect(screen.getByText("已結束")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "開放作答" })).toBeNull();
  });
});
