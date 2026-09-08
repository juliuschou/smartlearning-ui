import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
import { PollMultipleQuestion } from "@/features/live-student/PollMultipleQuestion";
import { PollSingleQuestion } from "@/features/live-student/PollSingleQuestion";
import { QuizQuestion } from "@/features/live-student/QuizQuestion";
import type { SessionQuestion } from "@/lib/api/types";

const sessionId = "01945f3e-0000-7000-8000-000000000010";
const questionId = "01945f3e-0000-7000-8000-000000000001";
const firstId = "01945f3e-0000-7000-8000-000000000002";
const secondId = "01945f3e-0000-7000-8000-000000000003";

function renderWithClient(ui: React.ReactElement) {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({
          defaultOptions: {
            queries: { retry: false },
            mutations: { retry: false },
          },
        })
      }
    >
      {ui}
    </QueryClientProvider>,
  );
}

function question(
  type: "poll" | "quiz" | "open_text",
  mode: "single" | "multiple" | null,
  overrides: Partial<SessionQuestion> = {},
): SessionQuestion {
  return {
    id: questionId,
    liveSessionId: sessionId,
    questionDefinitionId: "01945f3e-0000-7000-8000-000000000011",
    position: 0,
    status: "open",
    snapshotType: type,
    snapshotPrompt: `CP1 ${type} prompt`,
    snapshotSelectionMode: mode,
    openedAt: "2026-09-03T09:01:00.000Z",
    closedAt: null,
    hasSubmitted: false,
    options:
      type === "open_text"
        ? []
        : [
            { id: firstId, optionRef: "A", text: "選項甲", position: 0 },
            { id: secondId, optionRef: "B", text: "選項乙", position: 1 },
          ],
    ...overrides,
  };
}

type Scenario = {
  name: string;
  question: SessionQuestion;
  render: (question: SessionQuestion) => React.ReactElement;
  control: () => HTMLElement;
  select: (control: HTMLElement) => Promise<void>;
  expectedBody: Record<string, unknown>;
};

const scenarios: Scenario[] = [
  {
    name: "Poll single",
    question: question("poll", "single"),
    render: (value) => <PollSingleQuestion question={value} />,
    control: () => screen.getAllByRole("radio")[0],
    select: async (control) => {
      await userEvent.setup().click(control);
    },
    expectedBody: {
      sessionQuestionId: questionId,
      selectedOptionRefs: [firstId],
    },
  },
  {
    name: "Poll multiple",
    question: question("poll", "multiple"),
    render: (value) => <PollMultipleQuestion question={value} />,
    control: () => screen.getAllByRole("checkbox")[0],
    select: async (control) => {
      await userEvent.setup().click(control);
    },
    expectedBody: {
      sessionQuestionId: questionId,
      selectedOptionRefs: [firstId],
    },
  },
  {
    name: "Quiz",
    question: question("quiz", null),
    render: (value) => <QuizQuestion question={value} />,
    control: () => screen.getAllByRole("checkbox")[0],
    select: async (control) => {
      await userEvent.setup().click(control);
    },
    expectedBody: {
      sessionQuestionId: questionId,
      selectedOptionRefs: [firstId],
    },
  },
  {
    name: "Open text",
    question: question("open_text", null),
    render: (value) => <OpenTextQuestion question={value} />,
    control: () => screen.getByRole("textbox", { name: "請輸入你的答案" }),
    select: async (control) => {
      await userEvent.setup().type(control, "鍵盤答案");
    },
    expectedBody: { sessionQuestionId: questionId, textAnswer: "鍵盤答案" },
  },
];

beforeEach(() => {
  mocks.apiRequest.mockReset();
  mocks.apiRequestWithStatus.mockReset();
  window.sessionStorage.clear();
});

describe("FE-5.4 CP1 four-question shared acceptance", () => {
  it.each(scenarios)(
    "$name exposes an accessible prompt/control and submits keyboard input with the expected payload",
    async (scenario) => {
      mocks.apiRequestWithStatus.mockResolvedValueOnce({
        status: 201,
        data: {
          id: "01945f3e-0000-7000-8000-000000000099",
          liveSessionId: sessionId,
          sessionQuestionId: questionId,
          participantId: "participant-1",
          selectedOptionRefs:
            "selectedOptionRefs" in scenario.expectedBody
              ? scenario.expectedBody.selectedOptionRefs
              : null,
          textAnswer:
            "textAnswer" in scenario.expectedBody
              ? scenario.expectedBody.textAnswer
              : null,
          submittedAt: "2026-09-04T00:00:00.000Z",
        },
      });
      renderWithClient(scenario.render(scenario.question));

      expect(
        screen.getByText(scenario.question.snapshotPrompt),
      ).toBeInTheDocument();
      const control = scenario.control();
      await scenario.select(control);
      const submit = screen.getByRole("button", { name: "送出答案" });
      expect(submit).toBeEnabled();
      await userEvent.setup().click(submit);

      await waitFor(() =>
        expect(mocks.apiRequestWithStatus).toHaveBeenCalled(),
      );
      expect(mocks.apiRequestWithStatus).toHaveBeenCalledWith(
        `/live-sessions/${sessionId}/submissions`,
        expect.objectContaining({
          method: "POST",
          mutate: true,
          idempotencyKey: expect.any(String),
          body: scenario.expectedBody,
        }),
      );
      expect(screen.getByText("你已作答。")).toBeInTheDocument();
    },
  );

  it.each(scenarios)(
    "$name exposes result loading as a status",
    async (scenario) => {
      mocks.apiRequest.mockImplementation(() => new Promise(() => undefined));
      const submitted = { ...scenario.question, hasSubmitted: true };
      renderWithClient(scenario.render(submitted));
      expect(await screen.findByRole("status")).toHaveTextContent(
        /載入(中|結果中…)/,
      );
    },
  );

  it.each(scenarios)(
    "$name is read-only when the lifecycle gate supplies a closed question",
    (scenario) => {
      const closed = { ...scenario.question, status: "closed" as const };
      renderWithClient(scenario.render(closed));
      expect(screen.getByText(closed.snapshotPrompt)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "送出答案" })).toBeDisabled();
      for (const control of screen.queryAllByRole("radio")) {
        expect(control).toBeDisabled();
      }
      for (const control of screen.queryAllByRole("checkbox")) {
        expect(control).toBeDisabled();
      }
      const textbox = screen.queryByRole("textbox");
      if (textbox) expect(textbox).toBeDisabled();
    },
  );

  it("keeps quiz correctness absent before reveal and keeps open-text results anonymous", async () => {
    mocks.apiRequest
      .mockResolvedValueOnce({
        snapshotType: "quiz",
        status: "open",
        options: [
          { optionId: firstId, optionRef: "A", text: "ignored", count: 1 },
          { optionId: secondId, optionRef: "B", text: "ignored", count: 0 },
        ],
        totalResponses: 1,
      })
      .mockResolvedValueOnce({
        snapshotType: "open_text",
        status: "closed",
        responses: [{ text: "匿名答案" }],
        totalResponses: 1,
      });

    renderWithClient(
      <QuizQuestion
        question={question("quiz", null, { hasSubmitted: true })}
      />,
    );
    await waitFor(() =>
      expect(screen.getByText("共 1 份回答")).toBeInTheDocument(),
    );
    expect(screen.queryByText(/正解|答對|答錯|正確率/)).not.toBeInTheDocument();

    renderWithClient(
      <OpenTextQuestion
        question={question("open_text", null, { hasSubmitted: true })}
      />,
    );
    await waitFor(() =>
      expect(screen.getByText("匿名答案")).toBeInTheDocument(),
    );
    expect(
      screen.queryByText(/participant|account|idempotency/i),
    ).not.toBeInTheDocument();
  });
});
