import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

describe("ConfirmDialog", () => {
  it("does not render when closed", () => {
    render(
      <ConfirmDialog
        open={false}
        onClose={vi.fn()}
        headingId="h"
        heading="確認操作"
        body="確定？"
        confirmLabel="確認"
        pendingLabel="處理中…"
        isPending={false}
        errorCode={null}
        errorId="e"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("renders heading, body, and buttons when open", () => {
    render(
      <ConfirmDialog
        open
        onClose={vi.fn()}
        headingId="h"
        heading="確認移除"
        body="確定移除這名學生？"
        confirmLabel="確認移除"
        pendingLabel="移除中…"
        isPending={false}
        errorCode={null}
        errorId="e"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(
      screen.getByRole("heading", { name: "確認移除" }),
    ).toBeInTheDocument();
    expect(screen.getByText("確定移除這名學生？")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "取消" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "確認移除" }),
    ).toBeInTheDocument();
  });

  it("calls onConfirm via the confirm button", () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmDialog
        open
        onClose={vi.fn()}
        headingId="h"
        heading="確認"
        body="確定？"
        confirmLabel="確認"
        pendingLabel="處理中…"
        isPending={false}
        errorCode={null}
        errorId="e"
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "確認" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("closes on Escape and restores focus to the previously focused element", () => {
    function Harness() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            open
          </button>
          <ConfirmDialog
            open={open}
            onClose={() => setOpen(false)}
            headingId="h"
            heading="確認"
            body="確定？"
            confirmLabel="確認"
            pendingLabel="處理中…"
            isPending={false}
            errorCode={null}
            errorId="e"
            onConfirm={vi.fn()}
            onCancel={() => setOpen(false)}
          />
        </>
      );
    }
    render(<Harness />);
    // Focus the trigger BEFORE the dialog opens so restore targets it.
    const openButton = screen.getByRole("button", { name: "open" });
    openButton.focus();
    fireEvent.click(openButton);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(openButton);
  });

  it("renders the stable-code error alert inside the dialog", () => {
    render(
      <ConfirmDialog
        open
        onClose={vi.fn()}
        headingId="h"
        heading="確認"
        body="確定？"
        confirmLabel="確認"
        pendingLabel="處理中…"
        isPending={false}
        errorCode="FORBIDDEN"
        errorId="e"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText(/沒有權限/)).toBeInTheDocument();
  });

  it("shows the pending label and disables buttons while pending", () => {
    render(
      <ConfirmDialog
        open
        onClose={vi.fn()}
        headingId="h"
        heading="確認"
        body="確定？"
        confirmLabel="確認"
        pendingLabel="處理中…"
        isPending
        errorCode={null}
        errorId="e"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: "處理中…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "取消" })).toBeDisabled();
  });
});
