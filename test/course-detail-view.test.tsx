import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CourseDetailView } from "@/features/courses/CourseDetailView";
import { ApiRequestError } from "@/lib/api/client";
import type { CourseDto } from "@/lib/api/types";

const mocks = vi.hoisted(() => ({
  useCourse: vi.fn(),
}));

vi.mock("@/lib/api/courses", () => ({
  useCourse: mocks.useCourse,
}));

const course: CourseDto = {
  id: "course-1",
  name: "微積分一",
  description: "基礎微積分",
  status: "draft",
  ownerAccountId: "teacher-1",
  createdAt: "2026-08-22T00:00:00.000Z",
  updatedAt: "2026-08-22T00:00:00.000Z",
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("CourseDetailView", () => {
  it("renders an accessible loading state", () => {
    mocks.useCourse.mockReturnValue({
      data: undefined,
      error: null,
      isLoading: true,
    });

    render(<CourseDetailView courseId="course-1" />);

    expect(screen.getByRole("status")).toHaveTextContent("載入課程詳情中…");
  });

  it("renders the server draft, owner, and single-teacher projection", () => {
    mocks.useCourse.mockReturnValue({
      data: course,
      error: null,
      isLoading: false,
    });

    render(<CourseDetailView courseId={course.id} />);

    expect(
      screen.getByRole("heading", { level: 2, name: "微積分一" }),
    ).toBeInTheDocument();
    expect(screen.getByText("draft")).toBeInTheDocument();
    expect(screen.getByText("課程擁有者（唯一老師）")).toBeInTheDocument();
    expect(screen.getByText("teacher-1")).toBeInTheDocument();
    expect(
      screen.getByText("課程由伺服器建立，擁有者是唯一老師。"),
    ).toBeInTheDocument();
    expect(screen.getByText("題目功能目前尚未開放。")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("renders the exact archived lifecycle value", () => {
    mocks.useCourse.mockReturnValue({
      data: { ...course, status: "archived" },
      error: null,
      isLoading: false,
    });

    render(<CourseDetailView courseId={course.id} />);

    expect(screen.getByText("archived")).toBeInTheDocument();
  });

  it("uses a generic no-enumeration state for a typed 404", () => {
    const courseId = "secret-course-id";
    const rawMessage = "internal course lookup detail";
    mocks.useCourse.mockReturnValue({
      data: undefined,
      error: new ApiRequestError(
        {
          code: "NOT_FOUND",
          message: rawMessage,
          blocking: true,
        },
        404,
      ),
      isLoading: false,
    });

    render(<CourseDetailView courseId={courseId} />);

    expect(
      screen.getByRole("heading", { name: "找不到這門課程" }),
    ).toBeInTheDocument();
    expect(screen.getByText("請確認連結仍然有效。")).toBeInTheDocument();
    expect(screen.queryByText(courseId)).not.toBeInTheDocument();
    expect(screen.queryByText(rawMessage)).not.toBeInTheDocument();
  });

  it("uses the stable error message for a non-404 API failure", () => {
    const rawMessage = "internal forbidden course detail";
    mocks.useCourse.mockReturnValue({
      data: undefined,
      error: new ApiRequestError(
        {
          code: "FORBIDDEN",
          message: rawMessage,
          blocking: true,
        },
        403,
      ),
      isLoading: false,
    });

    render(<CourseDetailView courseId="course-1" />);

    expect(screen.getByText("你沒有權限執行此操作。")).toBeInTheDocument();
    expect(screen.queryByText(rawMessage)).not.toBeInTheDocument();
  });

  it("uses a safe fallback when the query has neither data nor error", () => {
    mocks.useCourse.mockReturnValue({
      data: undefined,
      error: null,
      isLoading: false,
    });

    render(<CourseDetailView courseId="course-1" />);

    expect(
      screen.getByText("伺服器發生問題，請稍後再試。"),
    ).toBeInTheDocument();
  });
});
