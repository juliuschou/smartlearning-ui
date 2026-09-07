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

import { PollMultipleQuestion } from "@/features/live-student/PollMultipleQuestion";
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
    snapshotType: "poll",
    snapshotPrompt: "選擇喜歡的科目",
    snapshotSelectionMode: "multiple",
    openedAt: "2026-09-03T09:01:00.000Z",
    closedAt: null,
    hasSubmitted: false,
    options: [
      { id: firstId, optionRef: "A", text: "數學", position: 0 },
      { id: secondId, optionRef: "B", text: "英文", position: 1 },
    ],
    ...overrides,
  };
}
const canonicalResponse = {
  id: "submission-1",
  liveSessionId: sessionId,
  sessionQuestionId: questionId,
  participantId: "participant-1",
  selectedOptionRefs: [firstId, secondId],
  textAnswer: null,
  submittedAt: "2026-09-04T00:00:00.000Z",
};

describe("PollMultipleQuestion", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    requestStatusMock.mockReset();
    requestMock.mockReset();
  });

  it("renders checkboxes and disables empty submission", () => {
    renderWithClient(<PollMultipleQuestion question={question()} />);
    expect(screen.getAllByRole("checkbox")).toHaveLength(2);
    expect(screen.getByText("可複選")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "送出答案" })).toBeDisabled();
  });

  it("submits nonempty options, requires 201 canonical response, and calls back", async () => {
    const onSubmit = vi.fn();
    requestStatusMock.mockResolvedValue({
      status: 201,
      data: canonicalResponse,
    });
    renderWithClient(
      <PollMultipleQuestion question={question()} onSubmit={onSubmit} />,
    );
    fireEvent.click(screen.getAllByRole("checkbox")[1]);
    fireEvent.click(screen.getAllByRole("checkbox")[0]);
    fireEvent.click(screen.getByRole("button", { name: "送出答案" }));
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith([firstId, secondId]),
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
  });

  it("restores a reordered reload snapshot and retries the stored attempt unchanged", async () => {
    requestStatusMock
      .mockRejectedValueOnce({ code: "NETWORK_ERROR", message: "暫時失敗" })
      .mockResolvedValueOnce({ status: 201, data: canonicalResponse });
    const initialQuestion = question({
      options: [
        { id: firstId, optionRef: "A", text: "數學", position: 0 },
        { id: secondId, optionRef: "B", text: "英文", position: 1 },
        { id: thirdId, optionRef: "C", text: "自然", position: 2 },
      ],
    });
    const view = renderWithClient(
      <PollMultipleQuestion question={initialQuestion} />,
    );
    fireEvent.click(screen.getByDisplayValue(firstId));
    fireEvent.click(screen.getByDisplayValue(secondId));
    fireEvent.click(screen.getByRole("button", { name: "送出答案" }));
    await waitFor(() => expect(requestStatusMock).toHaveBeenCalledTimes(1));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "無法連線到伺服器，請稍後再試。",
    );
    const firstRequest = requestStatusMock.mock.calls[0][1];

    view.unmount();
    renderWithClient(
      <PollMultipleQuestion
        question={question({
          options: [
            { id: thirdId, optionRef: "C", text: "自然", position: 0 },
            { id: secondId, optionRef: "B", text: "英文", position: 1 },
            { id: firstId, optionRef: "A", text: "數學", position: 2 },
          ],
        })}
      />,
    );
    expect(screen.getByDisplayValue(firstId)).toBeChecked();
    expect(screen.getByDisplayValue(secondId)).toBeChecked();
    expect(screen.getByDisplayValue(thirdId)).not.toBeChecked();
    expect(screen.getByRole("button", { name: "送出答案" })).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: "送出答案" }));
    await waitFor(() => expect(requestStatusMock).toHaveBeenCalledTimes(2));
    expect(requestStatusMock.mock.calls[1][1]).toEqual(firstRequest);
    await waitFor(() =>
      expect(screen.getByText("你已作答。")).toBeInTheDocument(),
    );
    expect(screen.getByRole("button", { name: "送出答案" })).toBeDisabled();
  });

  it("does not mark success for invalid canonical response or non-201", async () => {
    const onSubmit = vi.fn();
    requestStatusMock.mockResolvedValue({
      status: 200,
      data: canonicalResponse,
    });
    renderWithClient(
      <PollMultipleQuestion question={question()} onSubmit={onSubmit} />,
    );
    fireEvent.click(screen.getAllByRole("checkbox")[0]);
    fireEvent.click(screen.getByRole("button", { name: "送出答案" }));
    await waitFor(() => expect(requestStatusMock).toHaveBeenCalled());
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "作答內容有衝突，請重新整理後再試一次。",
    );
    expect(screen.getByRole("button", { name: "送出答案" })).toBeEnabled();
  });

  it("aligns result options by id and uses totalResponses", async () => {
    requestMock.mockResolvedValue({
      snapshotType: "poll",
      selectionMode: "multiple",
      status: "closed",
      options: [
        { optionId: secondId, optionRef: "B", text: "ignored", count: 2 },
        { optionId: firstId, optionRef: "A", text: "ignored", count: 1 },
      ],
      totalResponses: 2,
    });
    renderWithClient(
      <PollMultipleQuestion question={question({ hasSubmitted: true })} />,
    );
    await waitFor(() =>
      expect(screen.getByText("共 2 份回答")).toBeInTheDocument(),
    );
    const rows = screen.getByRole("list").querySelectorAll("li");
    expect(rows[0]).toHaveTextContent("數學");
    expect(rows[0]).toHaveTextContent("1 票");
    expect(rows[1]).toHaveTextContent("英文");
    expect(rows[1]).toHaveTextContent("2 票");
  });

  it("fails closed for unsupported questions and handles anonymous access loss", async () => {
    renderWithClient(
      <PollMultipleQuestion
        question={question({ snapshotSelectionMode: "single" })}
      />,
    );
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
    expect(screen.getByText("此題型目前無法作答。")).toBeInTheDocument();
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
      <PollMultipleQuestion
        question={question()}
        actor={{
          kind: "anonymous",
          liveSessionId: sessionId,
          sessionCode: "ABC123",
        }}
        onParticipantAccessLoss={onLoss}
      />,
    );
    fireEvent.click(screen.getAllByRole("checkbox")[0]);
    fireEvent.click(screen.getByRole("button", { name: "送出答案" }));
    await waitFor(() => expect(onLoss).toHaveBeenCalledTimes(1));
  });
});
