import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { AnonymousJoinForm } from "@/features/live-student/AnonymousJoinForm";

const replace = vi.fn();
const mutateAsync = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
}));

vi.mock("@/lib/api/participant-live-sessions", () => ({
  normalizeSessionCode: (value: string) => value.trim().toUpperCase(),
  useJoinAnonymousLiveSession: () => ({ mutateAsync, error: null }),
}));

function renderForm() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <AnonymousJoinForm />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("AnonymousJoinForm", () => {
  it("validates required fields without making a request", async () => {
    const user = userEvent.setup();
    renderForm();

    await user.click(screen.getByRole("button", { name: "加入課堂" }));

    expect(await screen.findByText("請輸入課堂代碼")).toBeInTheDocument();
    expect(screen.getByText("請輸入顯示名稱")).toBeInTheDocument();
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it("normalizes the code and display name, then navigates by server ID", async () => {
    const user = userEvent.setup();
    mutateAsync.mockResolvedValueOnce({
      liveSessionId: "018f0f54-7b7b-7b7b-8b7b-7b7b7b7b7b7b",
      sessionCode: "ABCD2345",
    });
    renderForm();

    await user.type(screen.getByLabelText("課堂代碼"), " abcd2345 ");
    await user.type(screen.getByLabelText("顯示名稱"), "  Learner  ");
    await user.click(screen.getByRole("button", { name: "加入課堂" }));

    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith(
        "/live/018f0f54-7b7b-7b7b-8b7b-7b7b7b7b7b7b",
      ),
    );
    expect(mutateAsync).toHaveBeenCalledWith({
      sessionCode: "ABCD2345",
      displayName: "Learner",
    });
  });
});
