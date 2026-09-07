import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const requestStatusMock = vi.hoisted(() => vi.fn());
const requestMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/client")>()),
  apiRequest: requestMock,
  apiRequestWithStatus: requestStatusMock,
}));

import { QuizQuestion } from "@/features/live-student/QuizQuestion";
import { ApiRequestError } from "@/lib/api/client";
import { persistAnonymousParticipantCredential } from "@/lib/live/anonymous-participant-credential";
import type { SessionQuestion } from "@/lib/api/types";

const sessionId = "01945f3e-0000-7000-8000-000000000010";
const questionId = "01945f3e-0000-7000-8000-000000000001";
const firstId = "01945f3e-0000-7000-8000-000000000002";
const secondId = "01945f3e-0000-7000-8000-000000000003";
const thirdId = "01945f3e-0000-7000-8000-000000000004";

function renderWithClient(ui: React.ReactElement) {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({
          defaultOptions: {
            mutations: { retry: false },
            queries: { retry: false },
          },
        })
      }
    >
      {ui}
    </QueryClientProvider>,
  );
}
function question(overrides: Partial<SessionQuestion> = {}): SessionQuestion {
  return {
    id: questionId,
    liveSessionId: sessionId,
    questionDefinitionId: "01945f3e-0000-7000-8000-000000000011",
    position: 0,
    status: "open",
    snapshotType: "quiz",
    snapshotPrompt: "哪兩個是首都？",
    snapshotSelectionMode: null,
    openedAt: "2026-09-03T09:01:00.000Z",
    closedAt: null,
    hasSubmitted: false,
    options: [
      { id: firstId, optionRef: "A", text: "台北", position: 0 },
      { id: secondId, optionRef: "B", text: "倫敦", position: 1 },
      { id: thirdId, optionRef: "C", text: "東京", position: 2 },
    ],
    ...overrides,
  };
}
const canonicalResponse = {
  id: "submission-1",
  liveSessionId: sessionId,
  sessionQuestionId: questionId,
  participantId: "participant-1",
  selectedOptionRefs: [secondId, firstId],
  textAnswer: null,
  submittedAt: "2026-09-04T00:00:00.000Z",
};

describe("QuizQuestion", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    requestStatusMock.mockReset();
    requestMock.mockReset();
  });

  it("renders checkboxes and disables empty submission", () => {
    renderWithClient(<QuizQuestion question={question()} />);
    expect(screen.getAllByRole("checkbox")).toHaveLength(3);
    expect(screen.getByText("可複選")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "送出答案" })).toBeDisabled();
  });

  it("submits a nonempty exact set, requires 201 canonical response, and calls back", async () => {
    const onSubmit = vi.fn();
    requestStatusMock.mockResolvedValue({
      status: 201,
      data: canonicalResponse,
    });
    renderWithClient(
      <QuizQuestion question={question()} onSubmit={onSubmit} />,
    );
    // Select first + second, then submit; the canonical response is permuted
    // ([secondId, firstId]) yet must be accepted as the same set.
    fireEvent.click(screen.getByDisplayValue(firstId));
    fireEvent.click(screen.getByDisplayValue(secondId));
    fireEvent.click(screen.getByRole("button", { name: "送出答案" }));
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith([secondId, firstId]),
    );
    expect(requestStatusMock).toHaveBeenCalledWith(
      `/live-sessions/${sessionId}/submissions`,
      expect.objectContaining({
        method: "POST",
        mutate: true,
        idempotencyKey: expect.any(String),
        body: {
          sessionQuestionId: questionId,
          selectedOptionRefs: [firstId, secondId],
        },
      }),
    );
    expect(screen.getByText("你已作答。")).toBeInTheDocument();
  });

  it("replays a stored attempt unchanged after a failed first submit", async () => {
    const onLoss = vi.fn();
    persistAnonymousParticipantCredential({
      liveSessionId: sessionId,
      sessionCode: "ABC123",
      participantToken: "token",
    });
    // First submit fails (non-access error); the durable attempt stays.
    requestStatusMock.mockRejectedValueOnce(
      new ApiRequestError(
        { code: "NETWORK_ERROR", message: "暫時失敗", blocking: true },
        0,
      ),
    );
    requestStatusMock.mockResolvedValueOnce({
      status: 201,
      data: canonicalResponse,
    });
    const view = renderWithClient(
      <QuizQuestion
        question={question()}
        actor={{
          kind: "anonymous",
          liveSessionId: sessionId,
          sessionCode: "ABC123",
        }}
        onParticipantAccessLoss={onLoss}
      />,
    );
    fireEvent.click(screen.getByDisplayValue(firstId));
    fireEvent.click(screen.getByDisplayValue(secondId));
    fireEvent.click(screen.getByRole("button", { name: "送出答案" }));
    await waitFor(() => expect(requestStatusMock).toHaveBeenCalledTimes(1));
    const firstRequest = requestStatusMock.mock.calls[0][1];

    // Reload: the stored attempt must prefill selection and be replayed unchanged.
    view.unmount();
    renderWithClient(
      <QuizQuestion
        question={question()}
        actor={{
          kind: "anonymous",
          liveSessionId: sessionId,
          sessionCode: "ABC123",
        }}
        onParticipantAccessLoss={onLoss}
      />,
    );
    expect(screen.getByDisplayValue(firstId)).toBeChecked();
    expect(screen.getByDisplayValue(secondId)).toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "送出答案" }));
    await waitFor(() => expect(requestStatusMock).toHaveBeenCalledTimes(2));
    expect(requestStatusMock.mock.calls[1][1]).toEqual(firstRequest);
    await waitFor(() =>
      expect(screen.getByText("你已作答。")).toBeInTheDocument(),
    );
  });

  it("does not mark success for a non-201 or invalid canonical response", async () => {
    const onSubmit = vi.fn();
    requestStatusMock.mockResolvedValue({
      status: 200,
      data: canonicalResponse,
    });
    renderWithClient(
      <QuizQuestion question={question()} onSubmit={onSubmit} />,
    );
    fireEvent.click(screen.getByDisplayValue(firstId));
    fireEvent.click(screen.getByRole("button", { name: "送出答案" }));
    await waitFor(() => expect(requestStatusMock).toHaveBeenCalled());
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "作答內容有衝突，請重新整理後再試一次。",
    );
    expect(screen.getByRole("button", { name: "送出答案" })).toBeEnabled();
  });

  it("renders pre-reveal results with counts and totals but no correctness", async () => {
    requestMock.mockResolvedValue({
      snapshotType: "quiz",
      status: "open",
      options: [
        { optionId: secondId, optionRef: "B", text: "ignored", count: 2 },
        { optionId: firstId, optionRef: "A", text: "ignored", count: 1 },
        { optionId: thirdId, optionRef: "C", text: "ignored", count: 0 },
      ],
      totalResponses: 2,
    });
    renderWithClient(
      <QuizQuestion question={question({ hasSubmitted: true })} />,
    );
    await waitFor(() =>
      expect(screen.getByText("共 2 份回答")).toBeInTheDocument(),
    );
    const rows = screen.getByRole("list").querySelectorAll("li");
    expect(rows[0]).toHaveTextContent("台北");
    expect(rows[0]).toHaveTextContent("1 票");
    expect(rows[1]).toHaveTextContent("倫敦");
    expect(rows[1]).toHaveTextContent("2 票");
    // Pre-reveal: no correctness marker, no aggregate correctness, no text "正解".
    expect(screen.queryByText(/正解/)).not.toBeInTheDocument();
    expect(screen.queryByText(/答對|答錯|正確率/)).not.toBeInTheDocument();
  });

  it("fails closed if a pre-reveal projection leaks any correctness field", async () => {
    requestMock.mockResolvedValue({
      snapshotType: "quiz",
      status: "open",
      options: [
        {
          optionId: firstId,
          optionRef: "A",
          text: "ignored",
          count: 1,
          isCorrect: true,
        },
        { optionId: secondId, optionRef: "B", text: "ignored", count: 1 },
        { optionId: thirdId, optionRef: "C", text: "ignored", count: 0 },
      ],
      totalResponses: 1,
    });
    renderWithClient(
      <QuizQuestion question={question({ hasSubmitted: true })} />,
    );
    await waitFor(() =>
      expect(screen.getByText("目前無法顯示結果。")).toBeInTheDocument(),
    );
    expect(screen.queryByText(/正解/)).not.toBeInTheDocument();
  });

  it("renders post-reveal correctness markers and aggregate metrics", async () => {
    requestMock.mockResolvedValue({
      snapshotType: "quiz",
      status: "closed",
      options: [
        {
          optionId: firstId,
          optionRef: "A",
          text: "ignored",
          count: 1,
          isCorrect: true,
        },
        {
          optionId: secondId,
          optionRef: "B",
          text: "ignored",
          count: 1,
          isCorrect: true,
        },
        {
          optionId: thirdId,
          optionRef: "C",
          text: "ignored",
          count: 1,
          isCorrect: false,
        },
      ],
      totalResponses: 2,
      correctCount: 1,
      incorrectCount: 1,
      correctnessRate: 0.5,
    });
    renderWithClient(
      <QuizQuestion
        question={question({ hasSubmitted: true, status: "closed" })}
      />,
    );
    await waitFor(() =>
      expect(
        screen.getByText("答對 1 份 · 答錯 1 份 · 正確率 50%"),
      ).toBeInTheDocument(),
    );
    expect(screen.getAllByText(/✓ 正解/)).toHaveLength(2);
    // No personal per-submission correct/wrong judgment is ever rendered.
    expect(screen.queryByText(/你答對|你答錯/)).not.toBeInTheDocument();
  });

  it("shows a results-not-revealed message and no correctness when not revealed", async () => {
    persistAnonymousParticipantCredential({
      liveSessionId: sessionId,
      sessionCode: "ABC123",
      participantToken: "token",
    });
    requestMock.mockRejectedValue(
      new ApiRequestError(
        { code: "RESULTS_NOT_REVEALED", message: "隱藏", blocking: true },
        409,
      ),
    );
    renderWithClient(
      <QuizQuestion
        question={question({ hasSubmitted: true })}
        actor={{
          kind: "anonymous",
          liveSessionId: sessionId,
          sessionCode: "ABC123",
        }}
      />,
    );
    await waitFor(() =>
      expect(screen.getByText("結果尚未公開。")).toBeInTheDocument(),
    );
    expect(screen.queryByText(/正解/)).not.toBeInTheDocument();
  });

  it("invokes the anonymous access-loss callback on a submission access error", async () => {
    const onLoss = vi.fn();
    persistAnonymousParticipantCredential({
      liveSessionId: sessionId,
      sessionCode: "ABC123",
      participantToken: "token",
    });
    requestStatusMock.mockRejectedValue(
      new ApiRequestError(
        { code: "UNAUTHORIZED", message: "失效", blocking: true },
        401,
      ),
    );
    renderWithClient(
      <QuizQuestion
        question={question()}
        actor={{
          kind: "anonymous",
          liveSessionId: sessionId,
          sessionCode: "ABC123",
        }}
        onParticipantAccessLoss={onLoss}
      />,
    );
    fireEvent.click(screen.getByDisplayValue(firstId));
    fireEvent.click(screen.getByRole("button", { name: "送出答案" }));
    await waitFor(() => expect(onLoss).toHaveBeenCalledTimes(1));
  });

  it("fails closed for unsupported questions", () => {
    renderWithClient(
      <QuizQuestion question={question({ snapshotType: "poll" })} />,
    );
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
    expect(screen.getByText("此題型目前無法作答。")).toBeInTheDocument();
  });
});
