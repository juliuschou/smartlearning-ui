import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import AdminHomePage from "@/app/(admin)/admin/page";

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
  }: {
    children: React.ReactNode;
    href: string;
  }) => <a href={href}>{children}</a>,
}));

describe("AdminHomePage", () => {
  it("renders the admin landing content and account creation CTA", () => {
    render(<AdminHomePage />);

    expect(
      screen.getByRole("heading", { level: 1, name: "管理員首頁" }),
    ).toBeInTheDocument();
    expect(screen.getByText("管理平台帳號與使用者權限。")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "管理帳號" })).toHaveAttribute(
      "href",
      "/admin/accounts",
    );
    expect(screen.getByRole("link", { name: "建立帳號" })).toHaveAttribute(
      "href",
      "/admin/accounts/new",
    );
  });
});
