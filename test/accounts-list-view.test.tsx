import { describe, expect, it, beforeEach, vi, type Mock } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AccountsListView } from "@/features/admin/AccountsListView";

vi.mock("@/lib/api/client", () => ({
  apiRequest: vi.fn(),
  ApiRequestError: class ApiRequestError extends Error {
    readonly code: string;
    readonly field?: string;
    readonly status: number;

    constructor(
      error: { code: string; message: string; field?: string },
      status: number,
    ) {
      super(error.message);
      this.name = "ApiRequestError";
      this.code = error.code;
      this.field = error.field;
      this.status = status;
    }
  },
}));

import { apiRequest } from "@/lib/api/client";

const account = {
  id: "acct-1",
  username: "teacher-a",
  displayName: "老師甲",
  role: "teacher",
  status: "active",
  canCreateCourse: true,
  mustChangePassword: false,
  disabledAt: null,
  createdAt: "2026-08-21T00:00:00.000Z",
};

function renderView() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <AccountsListView />
    </QueryClientProvider>,
  );
  return queryClient;
}

function accountsPage(rows: (typeof account)[]) {
  return {
    data: rows,
    meta: { page: 1, pageSize: 20, total: rows.length, totalPages: 1 },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("AccountsListView", () => {
  it("shows a loading state while the account query is pending", () => {
    (apiRequest as unknown as Mock).mockReturnValueOnce(new Promise(() => {}));

    renderView();

    expect(screen.getByText("載入中…")).toBeInTheDocument();
  });

  it("renders server account rows and links to account details", async () => {
    (apiRequest as unknown as Mock).mockResolvedValueOnce(
      accountsPage([account]),
    );

    renderView();

    expect(await screen.findByText("老師甲")).toBeInTheDocument();
    expect(screen.getByText("teacher-a")).toBeInTheDocument();
    expect(screen.getByText("可開課")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "老師甲" })).toHaveAttribute(
      "href",
      "/admin/accounts/acct-1",
    );
    expect(apiRequest).toHaveBeenCalledWith(
      "/admin/accounts?page=1&pageSize=20",
      expect.objectContaining({ signal: expect.anything() }),
    );
  });

  it("renders an explicit empty state", async () => {
    (apiRequest as unknown as Mock).mockResolvedValueOnce(accountsPage([]));

    renderView();

    expect(
      await screen.findByText("目前沒有可管理的帳號。"),
    ).toBeInTheDocument();
  });

  it("renders a localized stable error without leaking backend detail", async () => {
    const { ApiRequestError } = await import("@/lib/api/client");
    (apiRequest as unknown as Mock).mockRejectedValueOnce(
      new ApiRequestError(
        {
          code: "NOT_FOUND",
          message: "internal account lookup",
          blocking: true,
        },
        404,
      ),
    );

    renderView();

    expect(await screen.findByText("找不到指定的帳號。"));
    expect(
      screen.queryByText("internal account lookup"),
    ).not.toBeInTheDocument();
  });
});
