import { describe, expect, it, beforeEach, vi, type Mock } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AccountDetailView } from "@/features/admin/AccountDetailView";
import { queryKeys } from "@/lib/api/query-keys";

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

const baseAccount = {
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

let serverAccount = { ...baseAccount };

function renderView() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  const invalidateQueries = vi.spyOn(queryClient, "invalidateQueries");
  render(
    <QueryClientProvider client={queryClient}>
      <AccountDetailView accountId={baseAccount.id} />
    </QueryClientProvider>,
  );
  return { queryClient, invalidateQueries };
}

beforeEach(() => {
  vi.clearAllMocks();
  serverAccount = { ...baseAccount };
  (apiRequest as unknown as Mock).mockImplementation(
    async (path: string, options?: { method?: string }) => {
      if (options?.method === "PATCH") {
        serverAccount = { ...serverAccount, canCreateCourse: false };
      }
      if (path === "/admin/accounts/acct-1") return serverAccount;
      if (path === "/admin/accounts/acct-1/permissions") return serverAccount;
      throw new Error(`Unexpected request: ${path}`);
    },
  );
});

describe("AccountDetailView", () => {
  it("renders the server value with accessible switch semantics", async () => {
    renderView();

    const switchControl = await screen.findByRole("switch", {
      name: "允許建立課程",
    });
    expect(switchControl).toBeChecked();
    expect(switchControl).toHaveAttribute("aria-checked", "true");
    expect(switchControl).toHaveAttribute(
      "aria-describedby",
      "canCreateCourse-description canCreateCourse-status",
    );
  });

  it("sends the permission mutation and uses the server response as canonical state", async () => {
    const user = userEvent.setup();
    const { queryClient, invalidateQueries } = renderView();

    const switchControl = await screen.findByRole("switch", {
      name: "允許建立課程",
    });
    await user.click(switchControl);

    await waitFor(() => expect(switchControl).not.toBeChecked());
    expect(apiRequest).toHaveBeenCalledWith(
      "/admin/accounts/acct-1/permissions",
      {
        method: "PATCH",
        body: { canCreateCourse: false },
        mutate: true,
      },
    );
    expect(
      queryClient.getQueryData(queryKeys.accounts.detail("acct-1")),
    ).toEqual(serverAccount);
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: queryKeys.accounts.all,
    });
    expect(
      await screen.findByText("開課授權已更新，畫面已同步伺服器狀態。"),
    ).toBeInTheDocument();
  });

  it("disables the switch while updating and prevents duplicate submissions", async () => {
    const user = userEvent.setup();
    let resolveMutation!: (value: typeof baseAccount) => void;
    (apiRequest as unknown as Mock).mockImplementation(
      (path: string, options?: { method?: string }) => {
        if (options?.method === "PATCH") {
          return new Promise((resolve) => {
            resolveMutation = resolve;
          });
        }
        return Promise.resolve(serverAccount);
      },
    );

    renderView();
    const switchControl = await screen.findByRole("switch", {
      name: "允許建立課程",
    });
    await user.click(switchControl);
    expect(switchControl).toBeDisabled();
    expect(screen.getByText(/更新中/)).toBeInTheDocument();
    await user.click(switchControl);
    expect(apiRequest).toHaveBeenCalledTimes(2); // GET + one PATCH

    resolveMutation({ ...baseAccount, canCreateCourse: false });
    await waitFor(() => expect(switchControl).not.toBeDisabled());
  });

  it("keeps the server value and shows stable error text when mutation fails", async () => {
    const user = userEvent.setup();
    const { ApiRequestError } = await import("@/lib/api/client");
    (apiRequest as unknown as Mock).mockImplementation(
      async (path: string, options?: { method?: string }) => {
        if (options?.method === "PATCH") {
          throw new ApiRequestError(
            {
              code: "FORBIDDEN",
              message: "internal permission detail",
              blocking: true,
            },
            403,
          );
        }
        return serverAccount;
      },
    );

    renderView();
    const switchControl = await screen.findByRole("switch", {
      name: "允許建立課程",
    });
    await user.click(switchControl);

    expect(await screen.findByText("你沒有權限執行此操作。"));
    expect(
      screen.queryByText("internal permission detail"),
    ).not.toBeInTheDocument();
    expect(switchControl).toBeChecked();
    expect(
      screen.getByText("更新失敗，開課授權維持伺服器狀態。"),
    ).toBeInTheDocument();
  });

  it("does not render an editable switch for a student account", async () => {
    serverAccount = { ...baseAccount, role: "student", canCreateCourse: false };

    renderView();

    expect(await screen.findByText("學生帳號不可開課，權限固定為關閉。"));
    expect(screen.queryByRole("switch")).not.toBeInTheDocument();
  });
});
