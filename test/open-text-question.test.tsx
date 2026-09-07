import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  apiRequest: vi.fn(),
  apiRequestWithStatus: vi.fn(),
}));

vi.mock("@/lib/api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/client")>()),
  apiRequest: mocks.apiRequest,
  apiRequestWithStatus: mocks.apiRequestWithStatus,
}));

import { OpenTextQuestion } from "@/features/live-student/OpenTextQuestion";
import type { ParticipantActor, SessionQuestion } from "@/lib/api/types";

const SESSION_ID = "01945f3e-0000-7000-8000-000000000010";
const QUESTION_ID = "01945f3e-0000-7000-8000-000000000001";

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
  );
}

function question(overrides: Partial<SessionQuestion> = {}): SessionQuestion {
  return {
    id: QUESTION_ID,
    liveSessionId: SESSION_ID,
    questionDefinitionId: "01945f3e-0000-7000-8000-000000000011",
    position: 0,
    status: "open",
    snapshotType: "open_text",
    snapshotPrompt: "請分享一個學習想法。",
    snapshotSelectionMode: null,
    openedAt: "2026-09-03T09:01:00.000Z",
    closedAt: null,
    hasSubmitted: false,
    options: [],
    ...overrides,
  };
}

function submission(textAnswer: string) {
  return {
    id: "submission-1",
    liveSessionId: SESSION_ID,
    sessionQuestionId: QUESTION_ID,
    participantId: "participant-1",
    selectedOptionRefs: null,
    textAnswer,
    submittedAt: "2026-09-04T00:00:00.000Z",
  };
}

beforeEach(() => {
  mocks.apiRequest.mockReset();
  mocks.apiRequestWithStatus.mockReset();
  window.sessionStorage.clear();
});

describe("OpenTextQuestion (CP2)", () => {
  it("normalizes whitespace, counts Unicode code points, and submits the normalized answer", async () => {
    const onSubmit = vi.fn();
    mocks.apiRequestWithStatus.mockResolvedValueOnce({
      status: 201,
      data: submission("é 答案"),
    });
    renderWithClient(
      <OpenTextQuestion question={question()} onSubmit={onSubmit} />,
    );

    const textarea = screen.getByRole("textbox", { name: "請輸入你的答案" });
    fireEvent.change(textarea, { target: { value: "  é\n\t　答案  " } });
    expect(screen.getByText(/送出時空白與換行會正規化。/)).toHaveTextContent(
      "4/2000",
    );
    fireEvent.click(screen.getByRole("button", { name: "送出答案" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith("é 答案"));
    expect(mocks.apiRequestWithStatus).toHaveBeenCalledWith(
      `/live-sessions/${SESSION_ID}/submissions`,
      expect.objectContaining({
        method: "POST",
        mutate: true,
        idempotencyKey: expect.any(String),
        body: { sessionQuestionId: QUESTION_ID, textAnswer: "é 答案" },
      }),
    );
    expect(screen.getByText("你已作答。")).toBeInTheDocument();
    expect(textarea).toBeDisabled();
  });

  it("rejects empty or over-limit normalized answers before making a request", () => {
    renderWithClient(<OpenTextQuestion question={question()} />);
    const textarea = screen.getByRole("textbox", { name: "請輸入你的答案" });
    const submit = screen.getByRole("button", { name: "送出答案" });
    fireEvent.change(textarea, { target: { value: " \n\t" } });
    expect(submit).toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent("1–2,000");
    fireEvent.change(textarea, { target: { value: "😀".repeat(2_001) } });
    expect(submit).toBeDisabled();
    expect(mocks.apiRequestWithStatus).not.toHaveBeenCalled();
  });

  it("fails closed when the submission attempt cannot be persisted", () => {
    const originalStorage = window.sessionStorage;
    Object.defineProperty(window, "sessionStorage", {
      configurable: true,
      value: {
        getItem: () => null,
        setItem: () => {
          throw new Error("storage unavailable");
        },
        removeItem: () => undefined,
      },
    });
    try {
      renderWithClient(<OpenTextQuestion question={question()} />);
      fireEvent.change(
        screen.getByRole("textbox", { name: "請輸入你的答案" }),
        {
          target: { value: "答案" },
        },
      );
      fireEvent.click(screen.getByRole("button", { name: "送出答案" }));
      expect(
        screen.getByText("目前無法保存匿名參與狀態，請稍後再試。"),
      ).toBeInTheDocument();
      expect(mocks.apiRequestWithStatus).not.toHaveBeenCalled();
    } finally {
      Object.defineProperty(window, "sessionStorage", {
        configurable: true,
        value: originalStorage,
      });
    }
  });

  it("keeps the attempt and allows the same-key retry after a transport error", async () => {
    mocks.apiRequestWithStatus.mockRejectedValueOnce({
      code: "NETWORK_ERROR",
      message: "network",
    });
    renderWithClient(<OpenTextQuestion question={question()} />);
    const textarea = screen.getByRole("textbox", { name: "請輸入你的答案" });
    fireEvent.change(textarea, { target: { value: "答案" } });
    fireEvent.click(screen.getByRole("button", { name: "送出答案" }));
    await waitFor(() =>
      expect(
        screen.getByText("無法連線到伺服器，請稍後再試。"),
      ).toBeInTheDocument(),
    );
    expect(textarea).toHaveValue("答案");
    expect(screen.getByRole("button", { name: "送出答案" })).toBeEnabled();
  });

  it.each([
    ["non-201", { status: 200, data: submission("答案") }],
    ["mismatched receipt", { status: 201, data: { ...submission("其他") } }],
  ])(
    "shows a conflict and does not claim success for %s",
    async (_label, response) => {
      mocks.apiRequestWithStatus.mockResolvedValueOnce(response);
      const onSubmit = vi.fn();
      renderWithClient(
        <OpenTextQuestion question={question()} onSubmit={onSubmit} />,
      );
      fireEvent.change(
        screen.getByRole("textbox", { name: "請輸入你的答案" }),
        {
          target: { value: "答案" },
        },
      );
      fireEvent.click(screen.getByRole("button", { name: "送出答案" }));
      await waitFor(() =>
        expect(
          screen.getByText("作答內容有衝突，請重新整理後再試一次。"),
        ).toBeInTheDocument(),
      );
      expect(onSubmit).not.toHaveBeenCalled();
      expect(screen.getByRole("button", { name: "送出答案" })).toBeEnabled();
    },
  );

  it("renders participant-safe open-text results and handles unrevealed results", async () => {
    mocks.apiRequest.mockResolvedValueOnce({
      snapshotType: "open_text",
      status: "closed",
      responses: [{ text: "匿名回答" }],
      totalResponses: 1,
    });
    renderWithClient(
      <OpenTextQuestion question={question({ hasSubmitted: true })} />,
    );
    await waitFor(() =>
      expect(screen.getByText("匿名回答")).toBeInTheDocument(),
    );
    expect(screen.getByText("共 1 份回答")).toBeInTheDocument();
    expect(
      screen.queryByText(/participant|account|idempotency/i),
    ).not.toBeInTheDocument();

    mocks.apiRequest.mockReset();
    mocks.apiRequest.mockRejectedValueOnce({ code: "RESULTS_NOT_REVEALED" });
    renderWithClient(
      <OpenTextQuestion question={question({ hasSubmitted: true })} />,
    );
    await waitFor(() =>
      expect(screen.getByText("結果尚未公開。")).toBeInTheDocument(),
    );
  });

  it("fails closed on malformed result data and generic result errors", async () => {
    mocks.apiRequest.mockResolvedValueOnce({
      snapshotType: "open_text",
      status: "closed",
      responses: [{ text: "答案", extra: "leak" }],
      totalResponses: 1,
    });
    renderWithClient(
      <OpenTextQuestion question={question({ hasSubmitted: true })} />,
    );
    await waitFor(() =>
      expect(screen.getByText("目前無法顯示結果。")).toBeInTheDocument(),
    );

    mocks.apiRequest.mockReset();
    mocks.apiRequest.mockRejectedValueOnce({ code: "INTERNAL_ERROR" });
    renderWithClient(
      <OpenTextQuestion question={question({ hasSubmitted: true })} />,
    );
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "伺服器發生問題，請稍後再試。",
      ),
    );
  });

  it("notifies the caller when an anonymous participant loses access", async () => {
    const onParticipantAccessLoss = vi.fn();
    const actor: ParticipantActor = {
      kind: "anonymous",
      liveSessionId: SESSION_ID,
      sessionCode: "ABC123",
    };
    window.sessionStorage.setItem(
      `smartlearning:v1:anonymous-participant:${SESSION_ID}`,
      JSON.stringify({
        version: 1,
        liveSessionId: SESSION_ID,
        sessionCode: "ABC123",
        participantToken: "token",
      }),
    );
    mocks.apiRequestWithStatus.mockRejectedValueOnce({ code: "UNAUTHORIZED" });
    renderWithClient(
      <OpenTextQuestion
        question={question()}
        actor={actor}
        onParticipantAccessLoss={onParticipantAccessLoss}
      />,
    );
    fireEvent.change(screen.getByRole("textbox", { name: "請輸入你的答案" }), {
      target: { value: "答案" },
    });
    fireEvent.click(screen.getByRole("button", { name: "送出答案" }));
    await waitFor(() =>
      expect(onParticipantAccessLoss).toHaveBeenCalledTimes(1),
    );
  });

  it("renders closed questions read-only without an answer control", () => {
    renderWithClient(
      <OpenTextQuestion question={question({ status: "closed" })} />,
    );
    expect(
      screen.getByRole("textbox", { name: "請輸入你的答案" }),
    ).toBeDisabled();
    expect(screen.getByRole("button", { name: "送出答案" })).toBeDisabled();
  });
});
