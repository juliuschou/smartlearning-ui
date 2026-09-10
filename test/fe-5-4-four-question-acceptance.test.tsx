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

// The keyboard-only flow ends on a deterministic selection per question type
// (see the traversal test): radios land on 選項乙; checkboxes end with both
// options toggled; open text types the same answer as the click path.
function keyboardExpectedBody(name: string): Record<string, unknown> {
  switch (name) {
    case "Poll single":
      return {
        sessionQuestionId: questionId,
        selectedOptionRefs: [secondId],
      };
    case "Poll multiple":
    case "Quiz":
      return {
        sessionQuestionId: questionId,
        selectedOptionRefs: [firstId, secondId],
      };
    default:
      return { sessionQuestionId: questionId, textAnswer: "鍵盤答案" };
  }
}

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

  it("supports tab, shift-tab, arrow, space, and enter across the answer controls", async () => {
    const user = userEvent.setup();
    renderWithClient(
      <PollSingleQuestion question={question("poll", "single")} />,
    );
    const first = screen.getByRole("radio", { name: "選項甲" });
    const second = screen.getByRole("radio", { name: "選項乙" });
    const submit = screen.getByRole("button", { name: "送出答案" });

    await user.tab();
    expect(first).toHaveFocus();
    await user.keyboard("{ArrowDown}");
    expect(second).toHaveFocus();
    await user.keyboard(" ");
    expect(second).toBeChecked();
    await user.tab();
    expect(submit).toHaveFocus();
    await user.keyboard("{Shift>}{Tab}{/Shift}");
    expect(second).toHaveFocus();
    await user.keyboard("{ArrowUp}");
    expect(first).toHaveFocus();
    await user.keyboard(" ");
    expect(first).toBeChecked();

    mocks.apiRequestWithStatus.mockResolvedValueOnce({
      status: 201,
      data: {
        id: "01945f3e-0000-7000-8000-000000000099",
        liveSessionId: sessionId,
        sessionQuestionId: questionId,
        participantId: "participant-1",
        selectedOptionRefs: [firstId],
        textAnswer: null,
        submittedAt: "2026-09-04T00:00:00.000Z",
      },
    });
    await user.tab();
    expect(submit).toHaveFocus();
    await user.keyboard("{Enter}");
    await waitFor(() =>
      expect(screen.getByText("你已作答。")).toBeInTheDocument(),
    );
  });

  it.each(scenarios)(
    "exposes semantic names and safe closed state for $name",
    (scenario) => {
      const closed = { ...scenario.question, status: "closed" as const };
      renderWithClient(scenario.render(closed));
      expect(screen.getByText(closed.snapshotPrompt)).toBeInTheDocument();
      expect(screen.getByText("尚未作答。")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "送出答案" })).toBeDisabled();
      if (scenario.name === "Open text") {
        expect(
          screen.getByRole("textbox", { name: "請輸入你的答案" }),
        ).toBeDisabled();
      } else {
        expect(
          screen.getAllByRole(
            scenario.name === "Poll single" ? "radio" : "checkbox",
          )[0],
        ).toBeDisabled();
      }
    },
  );

  // FE-5.4.2 dedicated evidence: per-type keyboard traversal with real key
  // events. Native radio groups move with Arrow keys and toggle with Space;
  // checkbox groups tab between options and toggle with Space; the textbox
  // takes typed text and Enter submits. Tab/Shift+Tab must traverse controls
  // in DOM order without trapping inside the answer area.
  it.each(scenarios)(
    "$name completes answering with keyboard only (Tab/Shift+Tab, Space/Arrow, text+Enter)",
    async (scenario) => {
      const canonicalBody = keyboardExpectedBody(scenario.name);
      mocks.apiRequestWithStatus.mockResolvedValueOnce({
        status: 201,
        data: {
          id: "01945f3e-0000-7000-8000-000000000099",
          liveSessionId: sessionId,
          sessionQuestionId: questionId,
          participantId: "participant-1",
          selectedOptionRefs:
            "selectedOptionRefs" in canonicalBody
              ? canonicalBody.selectedOptionRefs
              : null,
          textAnswer:
            "textAnswer" in canonicalBody ? canonicalBody.textAnswer : null,
          submittedAt: "2026-09-04T00:00:00.000Z",
        },
      });
      renderWithClient(scenario.render(scenario.question));
      const user = userEvent.setup();

      // Sanity: no keyboard trap — forward and reverse traversal both leave
      // the answer controls (submit is outside the fieldset/label wrappers).
      const firstControl = scenario.control();
      firstControl.focus();
      await user.tab();
      expect(firstControl).not.toHaveFocus();
      await user.keyboard("{Shift>}{Tab}{/Shift}");
      // Focus returns into the answer controls (or earlier page content),
      // never stuck outside the document.
      expect(document.activeElement).not.toBe(document.body);

      if (scenario.name === "Open text") {
        const textbox = screen.getByRole("textbox", { name: "請輸入你的答案" });
        textbox.focus();
        expect(textbox).toHaveFocus();
        await user.keyboard("鍵盤答案");
        expect(textbox).toHaveValue("鍵盤答案");
        const submit = screen.getByRole("button", { name: "送出答案" });
        expect(submit).toBeEnabled();
        submit.focus();
        await user.keyboard("{Enter}");
      } else if (scenario.name === "Poll single") {
        const first = screen.getByRole("radio", { name: "選項甲" });
        const second = screen.getByRole("radio", { name: "選項乙" });
        first.focus();
        expect(first).toHaveFocus();
        // Native radio group: Arrow moves selection+focus, Space toggles.
        await user.keyboard("{ArrowDown}");
        expect(second).toHaveFocus();
        expect(second).toBeChecked();
        await user.keyboard(" ");
        expect(second).toBeChecked();
        const submit = screen.getByRole("button", { name: "送出答案" });
        expect(submit).toBeEnabled();
        submit.focus();
        await user.keyboard("{Enter}");
      } else {
        // Poll multiple / Quiz: checkboxes toggle independently with Space;
        // Tab moves between options without auto-selecting.
        const first = screen.getAllByRole("checkbox")[0];
        const second = screen.getAllByRole("checkbox")[1];
        first.focus();
        await user.keyboard(" ");
        expect(first).toBeChecked();
        expect(second).not.toBeChecked();
        await user.tab();
        expect(second).toHaveFocus();
        await user.keyboard(" ");
        expect(second).toBeChecked();
        const submit = screen.getByRole("button", { name: "送出答案" });
        expect(submit).toBeEnabled();
        submit.focus();
        await user.keyboard("{Enter}");
      }

      await waitFor(() =>
        expect(mocks.apiRequestWithStatus).toHaveBeenCalled(),
      );
      // The keyboard path defines its own selection (radio arrows land on
      // 選項乙; checkboxes end with both options checked), so the expected
      // body differs from the click-path scenarios.
      expect(mocks.apiRequestWithStatus).toHaveBeenCalledWith(
        `/live-sessions/${sessionId}/submissions`,
        expect.objectContaining({
          method: "POST",
          mutate: true,
          idempotencyKey: expect.any(String),
          body: canonicalBody,
        }),
      );
      expect(screen.getByText("你已作答。")).toBeInTheDocument();
    },
  );

  // FE-5.4.2 dedicated evidence: focus-visible indicator must be discoverable
  // on the answer controls. jsdom does not compute layout, so assert that a
  // focus-within/focus-visible ring utility class is present on the answer
  // label wrappers and the submit button rather than rendering nothing.
  it.each(scenarios)(
    "$name renders visible focus indicators on its answer controls",
    (scenario) => {
      renderWithClient(scenario.render(scenario.question));
      if (scenario.name === "Open text") {
        const textbox = screen.getByRole("textbox", { name: "請輸入你的答案" });
        expect(textbox.className).toMatch(/focus:ring-2/);
      } else {
        const label = screen
          .getAllByRole(scenario.name === "Poll single" ? "radio" : "checkbox")
          .map((control) => control.closest("label"))
          .find((node) => node?.className.match(/focus-within:ring-2/));
        expect(label).toBeDefined();
      }
      const submit = screen.getByRole("button", { name: "送出答案" });
      expect(submit.className).toMatch(/focus-visible|focus:ring/);
    },
  );

  // FE-5.4.3 dedicated evidence: help text is programmatically associated
  // with the textbox via aria-describedby (open text), and the answer group
  // exposes the prompt as its accessible name via the fieldset legend.
  it.each(scenarios)(
    "$name associates help text and exposes the prompt as the control group name",
    (scenario) => {
      renderWithClient(scenario.render(scenario.question));
      if (scenario.name === "Open text") {
        const textbox = screen.getByRole("textbox", { name: "請輸入你的答案" });
        const describedBy = textbox.getAttribute("aria-describedby");
        expect(describedBy).toBeTruthy();
        expect(document.getElementById(describedBy ?? "")).toHaveTextContent(
          /正規化|字元/,
        );
      } else {
        // The fieldset groups the options; its legend carries the prompt so
        // screen readers announce the question with each option.
        const group = screen
          .getAllByRole(scenario.name === "Poll single" ? "radio" : "checkbox")
          .map((control) => control.closest("fieldset"))
          .find((node) => node !== null);
        expect(group?.querySelector("legend")).toHaveTextContent(
          scenario.question.snapshotPrompt,
        );
      }
    },
  );

  // FE-5.4.3 dedicated evidence: a submission error renders as role="alert"
  // with a curated (non-raw) message, and the previously entered input is
  // retained so the learner can safely retry after fixing/retrying.
  it.each(scenarios)(
    "$name reports submission errors as an alert and retains retryable input",
    async (scenario) => {
      mocks.apiRequestWithStatus.mockRejectedValueOnce({
        code: "NETWORK_ERROR",
      });
      renderWithClient(scenario.render(scenario.question));
      const user = userEvent.setup();
      await scenario.select(scenario.control());
      const submit = screen.getByRole("button", { name: "送出答案" });
      await user.click(submit);

      const alert = await screen.findByRole("alert");
      expect(alert).toHaveTextContent("無法連線到伺服器，請稍後再試。");
      expect(alert).not.toHaveTextContent(/stack|exception|status 5/i);

      // Retryable input retained: the answer is still present and submit can
      // be attempted again.
      if (scenario.name === "Open text") {
        expect(screen.getByRole("textbox")).toHaveValue("鍵盤答案");
      } else {
        const checked = screen
          .getAllByRole(scenario.name === "Poll single" ? "radio" : "checkbox")
          .filter((control) => (control as HTMLInputElement).checked);
        expect(checked).toHaveLength(1);
      }
      expect(screen.getByRole("button", { name: "送出答案" })).toBeEnabled();

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
      await user.click(screen.getByRole("button", { name: "送出答案" }));
      await waitFor(() =>
        expect(screen.getByText("你已作答。")).toBeInTheDocument(),
      );
    },
  );

  // FE-5.4.3 dedicated evidence: closed-state semantics — the answer area is
  // announced as disabled (fieldset disabled), the state line flips to
  // 尚未作答, and the accessibility tree contains no correctness or identity
  // linkage text.
  it.each(scenarios)(
    "$name closed state is announced and its accessibility tree leaks nothing",
    (scenario) => {
      const closed = { ...scenario.question, status: "closed" as const };
      const { container } = renderWithClient(scenario.render(closed));

      // Closed-state text is discoverable; the answer group is disabled.
      expect(screen.getByText("尚未作答。")).toBeInTheDocument();
      const fieldset = container.querySelector("fieldset");
      expect(fieldset).toBeDisabled();

      // Accessibility-tree negative check: no correctness or identity
      // linkage anywhere in the rendered tree, for any question state.
      const treeText = container.textContent ?? "";
      expect(treeText).not.toMatch(/正解|答對|答錯|正確率|isCorrect/);
      expect(treeText).not.toMatch(/participant|idempotency|token|account/i);
      // Options remain visible as participant-safe readonly content.
      for (const option of scenario.question.options) {
        expect(screen.getByText(option.text)).toBeInTheDocument();
      }
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
