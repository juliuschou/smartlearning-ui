import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type React from "react";

const apiRequestWithStatusMock = vi.hoisted(() => vi.fn());
const apiRequestMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/client")>()),
  apiRequest: apiRequestMock,
  apiRequestWithStatus: apiRequestWithStatusMock,
}));

import { PollSingleQuestion } from "@/features/live-student/PollSingleQuestion";
import type { SessionQuestion } from "@/lib/api/types";

const QUESTION_ID = "01945f3e-0000-7000-8000-000000000001";
const FIRST_OPTION_ID = "01945f3e-0000-7000-8000-000000000002";
const SECOND_OPTION_ID = "01945f3e-0000-7000-8000-000000000003";

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
  );
}

function question(overrides: Partial<SessionQuestion> = {}): SessionQuestion {
  return {
    id: QUESTION_ID,
    liveSessionId: "01945f3e-0000-7000-8000-000000000010",
    questionDefinitionId: "01945f3e-0000-7000-8000-000000000011",
    position: 0,
    status: "open",
    snapshotType: "poll",
    snapshotPrompt: "你最喜歡哪個科目？",
    snapshotSelectionMode: "single",
    openedAt: "2026-09-03T09:01:00.000Z",
    closedAt: null,
    hasSubmitted: false,
    options: [
      { id: FIRST_OPTION_ID, optionRef: "A", text: "數學", position: 0 },
      { id: SECOND_OPTION_ID, optionRef: "B", text: "英文", position: 1 },
    ],
    ...overrides,
  };
}

describe("PollSingleQuestion (FE-4.2 CP1)", () => {
  it("renders an ordered native radio group using formal option UUIDs", () => {
    renderWithClient(<PollSingleQuestion question={question()} />);

    expect(
      screen.getByRole("group", { name: "你最喜歡哪個科目？" }),
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole("radio").map((radio) => radio.getAttribute("value")),
    ).toEqual([FIRST_OPTION_ID, SECOND_OPTION_ID]);
    expect(screen.getByText("數學")).toBeInTheDocument();
    expect(screen.getByText("英文")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "送出答案" })).toBeDisabled();
  });

  it("submits one selected formal UUID and locks after canonical success", async () => {
    const onSubmit = vi.fn();
    apiRequestWithStatusMock.mockResolvedValueOnce({
      status: 201,
      data: {
        id: "submission-1",
        liveSessionId: "01945f3e-0000-7000-8000-000000000010",
        sessionQuestionId: QUESTION_ID,
        participantId: "participant-1",
        selectedOptionRefs: [SECOND_OPTION_ID],
        textAnswer: null,
        submittedAt: "2026-09-04T00:00:00.000Z",
      },
    });
    renderWithClient(
      <PollSingleQuestion question={question()} onSubmit={onSubmit} />,
    );

    const radios = screen.getAllByRole("radio");
    fireEvent.click(radios[1]);
    expect(radios[1]).toBeChecked();
    expect(radios[0]).not.toBeChecked();
    expect(screen.getByRole("button", { name: "送出答案" })).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: "送出答案" }));
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(SECOND_OPTION_ID),
    );
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(apiRequestWithStatusMock).toHaveBeenCalledWith(
      `/live-sessions/${question().liveSessionId}/submissions`,
      expect.objectContaining({
        method: "POST",
        mutate: true,
        idempotencyKey: expect.any(String),
        body: {
          sessionQuestionId: QUESTION_ID,
          selectedOptionRefs: [SECOND_OPTION_ID],
        },
      }),
    );
  });

  it("keeps an authoritative submitted question read-only", () => {
    const onSubmit = vi.fn();
    renderWithClient(
      <PollSingleQuestion
        question={question({ hasSubmitted: true })}
        onSubmit={onSubmit}
      />,
    );

    expect(screen.getAllByRole("radio").every((radio) => radio)).toBe(true);
    expect(screen.getAllByRole("radio").every((radio) => radio)).toBe(true);
    for (const radio of screen.getAllByRole("radio")) {
      expect(radio).toBeDisabled();
    }
    expect(screen.getByRole("button", { name: "送出答案" })).toBeDisabled();
    expect(screen.getByText("你已作答。")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "送出答案" }));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it.each([
    ["quiz", "single"],
    ["poll", "multiple"],
  ] as const)(
    "fails closed for unsupported %s/%s questions",
    (snapshotType, snapshotSelectionMode) => {
      renderWithClient(
        <PollSingleQuestion
          question={question({ snapshotType, snapshotSelectionMode })}
        />,
      );

      expect(screen.queryAllByRole("radio")).toHaveLength(0);
      expect(
        screen.queryByRole("button", { name: "送出答案" }),
      ).not.toBeInTheDocument();
      expect(screen.getByText("此題型目前無法作答。")).toBeInTheDocument();
    },
  );

  const malformedCases: Array<[string, Partial<SessionQuestion>]> = [
    [
      "invalid option id",
      { options: [{ id: "opt-1", optionRef: "A", text: "數學", position: 0 }] },
    ],
    [
      "duplicate option ids",
      {
        options: [
          { id: FIRST_OPTION_ID, optionRef: "A", text: "數學", position: 0 },
          { id: FIRST_OPTION_ID, optionRef: "B", text: "英文", position: 1 },
        ],
      },
    ],
  ];

  it.each(malformedCases)("fails closed for %s", (_label, overrides) => {
    renderWithClient(<PollSingleQuestion question={question(overrides)} />);

    expect(screen.queryAllByRole("radio")).toHaveLength(0);
    expect(
      screen.queryByRole("button", { name: "送出答案" }),
    ).not.toBeInTheDocument();
  });

  it("renders reordered participant results by formal option UUID", async () => {
    apiRequestMock.mockResolvedValueOnce({
      snapshotType: "poll",
      selectionMode: "single",
      status: "open",
      options: [
        {
          optionId: SECOND_OPTION_ID,
          optionRef: "B",
          text: "ignored",
          count: 2,
        },
        {
          optionId: FIRST_OPTION_ID,
          optionRef: "A",
          text: "ignored",
          count: 1,
        },
      ],
      totalResponses: 3,
    });
    renderWithClient(
      <PollSingleQuestion question={question({ hasSubmitted: true })} />,
    );
    await waitFor(() =>
      expect(screen.getByText("共 3 份回答")).toBeInTheDocument(),
    );
    const rows = screen.getByRole("list").querySelectorAll("li");
    expect(rows[0]).toHaveTextContent("數學");
    expect(rows[0]).toHaveTextContent("1 票");
    expect(rows[1]).toHaveTextContent("英文");
    expect(rows[1]).toHaveTextContent("2 票");
    expect(screen.queryByText(/correct|正確|錯誤/i)).not.toBeInTheDocument();
  });

  it("treats RESULTS_NOT_REVEALED as a normal gated state", async () => {
    apiRequestMock.mockRejectedValueOnce({ code: "RESULTS_NOT_REVEALED" });
    renderWithClient(
      <PollSingleQuestion question={question({ hasSubmitted: true })} />,
    );
    await waitFor(() =>
      expect(screen.getByText("結果尚未公開。")).toBeInTheDocument(),
    );
    expect(screen.getByText("你已作答。")).toBeInTheDocument();
  });
});
