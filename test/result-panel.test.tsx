import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PropsWithChildren } from "react";
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { ResultPanel } from "@/features/live-teacher/ResultPanel";
import { ApiRequestError } from "@/lib/api/client";
import type { SessionQuestionResults } from "@/lib/api/types";

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
    defaultOptions: { queries: { retry: false } },
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

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ResultPanel (FE-3.3.5)", () => {
  it("renders poll results with counts and percentage bars", async () => {
    const results: SessionQuestionResults = {
      snapshotType: "poll",
      selectionMode: "single",
      status: "closed",
      options: [
        { optionId: "opt-1", optionRef: "A", text: "數學", count: 8 },
        { optionId: "opt-2", optionRef: "B", text: "國文", count: 4 },
      ],
      totalResponses: 12,
    };
    apiRequestMock.mockResolvedValueOnce(results);

    render(<ResultPanel liveSessionId="session-1" sessionQuestionId="sq-1" />, {
      wrapper: wrapperFor(makeQueryClient()),
    });

    await waitFor(() =>
      expect(screen.getByText("共 12 人作答")).toBeInTheDocument(),
    );
    expect(screen.getByText("數學")).toBeInTheDocument();
    expect(screen.getByText("8 票（67%）")).toBeInTheDocument();
    expect(screen.getByText("4 票（33%）")).toBeInTheDocument();
  });

  it("renders quiz results with the correctness badge for the correct option", async () => {
    const results: SessionQuestionResults = {
      snapshotType: "quiz",
      status: "closed",
      options: [
        {
          optionId: "opt-1",
          optionRef: "A",
          text: "數學",
          count: 8,
          isCorrect: true,
        },
        {
          optionId: "opt-2",
          optionRef: "B",
          text: "國文",
          count: 4,
          isCorrect: false,
        },
      ],
      totalResponses: 12,
      correctCount: 8,
      incorrectCount: 4,
      correctnessRate: 0.67,
    };
    apiRequestMock.mockResolvedValueOnce(results);

    render(<ResultPanel liveSessionId="session-1" sessionQuestionId="sq-1" />, {
      wrapper: wrapperFor(makeQueryClient()),
    });

    await waitFor(() => expect(screen.getByText("正解")).toBeInTheDocument());
  });

  it("renders open_text responses as a list", async () => {
    const results: SessionQuestionResults = {
      snapshotType: "open_text",
      status: "closed",
      responses: [{ text: "我喜歡數學" }, { text: "我喜歡國文" }],
      totalResponses: 2,
    };
    apiRequestMock.mockResolvedValueOnce(results);

    render(<ResultPanel liveSessionId="session-1" sessionQuestionId="sq-1" />, {
      wrapper: wrapperFor(makeQueryClient()),
    });

    await waitFor(() =>
      expect(screen.getByText("我喜歡數學")).toBeInTheDocument(),
    );
    expect(screen.getByText("我喜歡國文")).toBeInTheDocument();
  });

  it("shows a generic message on a 404 (no raw backend detail)", async () => {
    apiRequestMock.mockRejectedValueOnce(
      new ApiRequestError(
        {
          code: "SESSION_QUESTION_NOT_FOUND",
          message: "internal",
          blocking: true,
        },
        404,
      ),
    );

    render(<ResultPanel liveSessionId="session-1" sessionQuestionId="sq-1" />, {
      wrapper: wrapperFor(makeQueryClient()),
    });

    await waitFor(() =>
      expect(screen.getByText("此題結果目前無法取得。")).toBeInTheDocument(),
    );
  });

  it("shows a stable-code error alert for other errors", async () => {
    apiRequestMock.mockRejectedValueOnce(
      new ApiRequestError(
        { code: "RESULTS_NOT_REVEALED", message: "internal", blocking: true },
        409,
      ),
    );

    render(<ResultPanel liveSessionId="session-1" sessionQuestionId="sq-1" />, {
      wrapper: wrapperFor(makeQueryClient()),
    });

    await waitFor(() =>
      expect(screen.getByText(/結果尚未公布/)).toBeInTheDocument(),
    );
  });
});
