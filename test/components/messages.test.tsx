import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { describe, expect, it, vi } from "vitest";
import { EmptyMessage } from "@/src/components/ui/EmptyMessage";
import { ErrorMessage } from "@/src/components/ui/ErrorMessage";
import { LoadingMessage } from "@/src/components/ui/LoadingMessage";

describe("shared message components", () => {
  it("announces the default loading message as a status", () => {
    render(<LoadingMessage />);

    expect(screen.getByRole("status", { name: "讀取中" })).toHaveTextContent(
      "正在載入…",
    );
  });

  it("shows a custom loading message", () => {
    render(<LoadingMessage message="正在讀取課程…" />);

    expect(screen.getByRole("status")).toHaveTextContent("正在讀取課程…");
  });

  it("shows the empty title and message", () => {
    render(<EmptyMessage title="沒有課程" message="新增課程後會顯示在這裡。" />);

    expect(screen.getByRole("heading", { name: "沒有課程" })).toBeInTheDocument();
    expect(screen.getByText("新增課程後會顯示在這裡。")).toBeInTheDocument();
  });

  it("shows an error as an alert without a retry button by default", () => {
    render(<ErrorMessage message="目前無法讀取資料，請稍後再試。" />);

    expect(screen.getByRole("alert")).toHaveTextContent("發生問題");
    expect(screen.getByRole("alert")).toHaveTextContent("目前無法讀取資料，請稍後再試。");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("calls the optional retry action", () => {
    const onRetry = vi.fn();
    render(
      <ErrorMessage
        title="讀取失敗"
        message="請檢查連線後重試。"
        onRetry={onRetry}
        retryLabel="重新載入"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "重新載入" }));

    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
