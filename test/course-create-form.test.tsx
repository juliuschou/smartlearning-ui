import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CourseCreateForm } from "@/features/courses/CourseCreateForm";
import type { CourseDto } from "@/lib/api/types";

const navigationMocks = vi.hoisted(() => ({
  replace: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => navigationMocks,
}));

const mocks = vi.hoisted(() => {
  class MockApiRequestError extends Error {
    readonly code: string;
    readonly field?: string;
    readonly retryAfterSeconds?: number | null;
    readonly status: number;

    constructor(
      error: {
        code: string;
        message: string;
        field?: string;
        retryAfterSeconds?: number | null;
      },
      status: number,
    ) {
      super(error.message);
      this.name = "ApiRequestError";
      this.code = error.code;
      this.field = error.field;
      this.retryAfterSeconds = error.retryAfterSeconds;
      this.status = status;
    }
  }

  return {
    apiRequest: vi.fn(),
    MockApiRequestError,
  };
});

vi.mock("@/lib/api/client", () => ({
  apiRequest: mocks.apiRequest,
  ApiRequestError: mocks.MockApiRequestError,
}));

import { ApiRequestError } from "@/lib/api/client";

const course: CourseDto = {
  id: "course-1",
  name: "微積分一",
  description: "基礎微積分",
  status: "draft",
  ownerAccountId: "teacher-1",
  createdAt: "2026-08-22T00:00:00.000Z",
  updatedAt: "2026-08-22T00:00:00.000Z",
};

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}

function renderForm() {
  const queryClient = makeQueryClient();
  render(
    <QueryClientProvider client={queryClient}>
      <CourseCreateForm />
    </QueryClientProvider>,
  );
}

async function fillCourse(
  user: ReturnType<typeof userEvent.setup>,
  values: { name?: string; description?: string } = {},
) {
  await user.type(screen.getByLabelText("課程名稱"), values.name ?? "微積分一");
  if (values.description !== undefined) {
    await user.type(screen.getByLabelText("課程說明"), values.description);
  }
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("CourseCreateForm — validation and accessibility", () => {
  it("rejects an empty name without calling the API", async () => {
    const user = userEvent.setup();
    renderForm();

    await user.click(screen.getByRole("button", { name: "建立課程" }));

    expect(await screen.findByText("請輸入課程名稱")).toBeInTheDocument();
    expect(mocks.apiRequest).not.toHaveBeenCalled();
    expect(navigationMocks.replace).not.toHaveBeenCalled();
  });

  it("rejects a name longer than 200 characters without calling the API", async () => {
    const user = userEvent.setup();
    renderForm();

    await user.type(screen.getByLabelText("課程名稱"), "a".repeat(201));
    await user.click(screen.getByRole("button", { name: "建立課程" }));

    expect(
      await screen.findByText("課程名稱最長 200 字元"),
    ).toBeInTheDocument();
    expect(mocks.apiRequest).not.toHaveBeenCalled();
    expect(navigationMocks.replace).not.toHaveBeenCalled();
  });

  it("rejects a description longer than 2,000 characters without calling the API", async () => {
    const user = userEvent.setup();
    renderForm();

    await fillCourse(user, { description: "a".repeat(2001) });
    await user.click(screen.getByRole("button", { name: "建立課程" }));

    expect(
      await screen.findByText("課程說明最多 2,000 字元"),
    ).toBeInTheDocument();
    expect(mocks.apiRequest).not.toHaveBeenCalled();
    expect(navigationMocks.replace).not.toHaveBeenCalled();
  });

  it("uses native labelled controls and exposes the validation relationships", () => {
    renderForm();

    const form = screen.getByRole("form");
    const name = screen.getByLabelText("課程名稱");
    const description = screen.getByLabelText("課程說明");

    expect(form).toHaveAttribute("novalidate");
    expect(name.tagName).toBe("INPUT");
    expect(description.tagName).toBe("TEXTAREA");
    expect(name).toHaveAttribute("aria-describedby", "name-hint name-error");
    expect(description).toHaveAttribute(
      "aria-describedby",
      "description-hint description-error",
    );
  });
});

describe("CourseCreateForm — mutation and success", () => {
  it("uses the server Course ID for same-origin detail navigation", async () => {
    const user = userEvent.setup();
    mocks.apiRequest.mockResolvedValueOnce(course);
    renderForm();

    await fillCourse(user, { description: "基礎微積分" });
    await user.click(screen.getByRole("button", { name: "建立課程" }));

    await waitFor(() =>
      expect(navigationMocks.replace).toHaveBeenCalledWith("/courses/course-1"),
    );
    expect(
      screen.queryByText("已建立課程「微積分一」。狀態：draft"),
    ).not.toBeInTheDocument();
    expect(mocks.apiRequest).toHaveBeenCalledTimes(1);
    expect(mocks.apiRequest).toHaveBeenCalledWith("/courses", {
      method: "POST",
      body: { name: "微積分一", description: "基礎微積分" },
      mutate: true,
    });
  });

  it("omits an empty optional description from the request body", async () => {
    const user = userEvent.setup();
    mocks.apiRequest.mockResolvedValueOnce(course);
    renderForm();

    await fillCourse(user);
    await user.click(screen.getByRole("button", { name: "建立課程" }));
    await waitFor(() =>
      expect(navigationMocks.replace).toHaveBeenCalledWith("/courses/course-1"),
    );

    expect(mocks.apiRequest).toHaveBeenCalledWith("/courses", {
      method: "POST",
      body: { name: "微積分一" },
      mutate: true,
    });
  });

  it("disables the submit control and ignores a duplicate click while pending", async () => {
    const user = userEvent.setup();
    let resolveCreate!: (value: CourseDto) => void;
    mocks.apiRequest.mockReturnValueOnce(
      new Promise<CourseDto>((resolve) => {
        resolveCreate = resolve;
      }),
    );
    renderForm();

    await fillCourse(user);
    const submit = screen.getByRole("button", { name: "建立課程" });
    await user.click(submit);
    await waitFor(() => expect(submit).toBeDisabled());

    submit.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(mocks.apiRequest).toHaveBeenCalledTimes(1);

    resolveCreate(course);
    await waitFor(() =>
      expect(navigationMocks.replace).toHaveBeenCalledWith("/courses/course-1"),
    );
  });
});

describe("CourseCreateForm — stable errors", () => {
  it("shows the curated forbidden message and never raw backend detail", async () => {
    const user = userEvent.setup();
    mocks.apiRequest.mockRejectedValueOnce(
      new ApiRequestError(
        {
          code: "FORBIDDEN",
          message: "internal authorization detail",
          blocking: true,
        },
        403,
      ),
    );
    renderForm();

    await fillCourse(user);
    await user.click(screen.getByRole("button", { name: "建立課程" }));

    expect(
      await screen.findByText("你沒有權限執行此操作。"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("internal authorization detail"),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(navigationMocks.replace).not.toHaveBeenCalled();
  });

  it("uses the generic message for an unknown typed error code", async () => {
    const user = userEvent.setup();
    mocks.apiRequest.mockRejectedValueOnce(
      new ApiRequestError(
        {
          code: "COURSE_UNKNOWN_ERROR",
          message: "secret backend detail",
          blocking: true,
        },
        500,
      ),
    );
    renderForm();

    await fillCourse(user);
    await user.click(screen.getByRole("button", { name: "建立課程" }));

    expect(
      await screen.findByText("發生未預期的錯誤，請稍後再試。"),
    ).toBeInTheDocument();
    expect(screen.queryByText("secret backend detail")).not.toBeInTheDocument();
  });

  it("uses a safe fallback for an unexpected untyped error", async () => {
    const user = userEvent.setup();
    mocks.apiRequest.mockRejectedValueOnce(
      new Error("secret exception detail"),
    );
    renderForm();

    await fillCourse(user);
    await user.click(screen.getByRole("button", { name: "建立課程" }));

    expect(
      await screen.findByText("伺服器發生問題，請稍後再試。"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("secret exception detail"),
    ).not.toBeInTheDocument();
  });

  it("does not navigate after a failed retry", async () => {
    const user = userEvent.setup();
    mocks.apiRequest.mockResolvedValueOnce(course).mockRejectedValueOnce(
      new ApiRequestError(
        {
          code: "FORBIDDEN",
          message: "internal detail",
          blocking: true,
        },
        403,
      ),
    );
    renderForm();

    await fillCourse(user);
    await user.click(screen.getByRole("button", { name: "建立課程" }));
    await waitFor(() =>
      expect(navigationMocks.replace).toHaveBeenCalledWith("/courses/course-1"),
    );

    await user.clear(screen.getByLabelText("課程名稱"));
    await user.type(screen.getByLabelText("課程名稱"), "第二門課");
    await user.click(screen.getByRole("button", { name: "建立課程" }));

    expect(
      await screen.findByText("你沒有權限執行此操作。"),
    ).toBeInTheDocument();
    expect(navigationMocks.replace).toHaveBeenCalledTimes(1);
  });
});
