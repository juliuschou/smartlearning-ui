import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import CourseCreateError from "@/app/(teacher)/courses/new/error";
import Loading from "@/app/(teacher)/courses/new/loading";
import NotFound from "@/app/(teacher)/courses/new/not-found";
import NewCoursePage, {
  metadata,
} from "@/app/(teacher)/courses/new/page";

vi.mock("@/features/courses/CourseCreateForm", () => ({
  CourseCreateForm: () => (
    <div data-testid="course-create-form">課程表單</div>
  ),
}));

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

describe("/courses/new route shell", () => {
  it("renders metadata, one heading, explanatory copy, and the course form", () => {
    expect(metadata.title).toBe("建立課程 | 智學互動平台");

    render(<NewCoursePage />);

    expect(
      screen.getAllByRole("heading", { level: 1 }),
    ).toHaveLength(1);
    expect(
      screen.getByRole("heading", { level: 1, name: "建立課程" }),
    ).toBeInTheDocument();
    expect(screen.getByText("建立一門課程，設定課程名稱與說明。")).toBeInTheDocument();
    expect(screen.getByTestId("course-create-form")).toBeInTheDocument();
  });
});

describe("/courses/new route boundaries", () => {
  it("renders a readable loading status", () => {
    render(<Loading />);

    expect(screen.getByRole("status")).toHaveTextContent(
      "載入建立課程頁面中…",
    );
  });

  it("shows a generic error and retries without exposing the raw message", async () => {
    const user = userEvent.setup();
    const reset = vi.fn();
    const secret = "secret server detail";

    render(
      <CourseCreateError
        error={new Error(secret) as Error & { digest?: string }}
        reset={reset}
      />,
    );

    expect(
      screen.getByText("建立課程頁面暫時無法載入"),
    ).toBeInTheDocument();
    expect(screen.getByText("發生未預期的問題，請再試一次。")).toBeInTheDocument();
    expect(screen.queryByText(secret)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "再試一次" }));

    expect(reset).toHaveBeenCalledOnce();
  });

  it("renders a link back to the teacher home from not-found", () => {
    render(<NotFound />);

    expect(screen.getByRole("link", { name: "返回老師首頁" })).toHaveAttribute(
      "href",
      "/teacher",
    );
  });
});
