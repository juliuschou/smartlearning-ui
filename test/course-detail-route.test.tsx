import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import CourseDetailError from "@/app/(teacher)/courses/[courseId]/error";
import Loading from "@/app/(teacher)/courses/[courseId]/loading";
import NotFound from "@/app/(teacher)/courses/[courseId]/not-found";
import CourseDetailPage, {
  metadata,
} from "@/app/(teacher)/courses/[courseId]/page";

vi.mock("@/features/courses/CourseDetailView", () => ({
  CourseDetailView: ({ courseId }: { courseId: string }) => (
    <div data-testid="course-detail-view">course detail for {courseId}</div>
  ),
}));

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

describe("/courses/[courseId] route shell", () => {
  it("awaits params and renders metadata, one heading, back link, and detail ID", async () => {
    const page = await CourseDetailPage({
      params: Promise.resolve({ courseId: "course-1" }),
    });

    expect(metadata.title).toBe("課程詳情 | 智學互動平台");
    render(page);

    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(
      screen.getByRole("heading", { level: 1, name: "課程詳情" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "← 返回老師首頁" }),
    ).toHaveAttribute("href", "/teacher");
    expect(screen.getByTestId("course-detail-view")).toHaveTextContent(
      "course detail for course-1",
    );
  });
});

describe("/courses/[courseId] route boundaries", () => {
  it("renders a readable loading status", () => {
    render(<Loading />);

    expect(screen.getByRole("status")).toHaveTextContent("載入課程詳情中…");
  });

  it("shows a generic error, retries, and suppresses the raw message", async () => {
    const user = userEvent.setup();
    const retry = vi.fn();
    const secret = "secret server detail";

    render(
      <CourseDetailError
        error={new Error(secret) as Error & { digest?: string }}
        retry={retry}
      />,
    );

    expect(screen.getByText("課程詳情頁面暫時無法載入")).toBeInTheDocument();
    expect(
      screen.getByText("發生未預期的問題，請再試一次。"),
    ).toBeInTheDocument();
    expect(screen.queryByText(secret)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "再試一次" }));

    expect(retry).toHaveBeenCalledOnce();
  });

  it("renders a generic route not-found state without an identifier", () => {
    render(<NotFound />);

    expect(
      screen.getByRole("heading", { name: "找不到課程" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "返回老師首頁" })).toHaveAttribute(
      "href",
      "/teacher",
    );
    expect(screen.queryByText("course-1")).not.toBeInTheDocument();
  });
});
