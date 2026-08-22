import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TeacherHomeView } from "@/features/teacher/TeacherHomeView";
import TeacherHomePage from "@/app/(teacher)/teacher/page";
import type { SessionDto } from "@/lib/api/types";

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
  }: {
    children: React.ReactNode;
    href: string;
  }) => <a href={href}>{children}</a>,
}));

const sessionState: { session: SessionDto | null } = {
  session: null,
};

vi.mock("@/lib/auth/session", () => ({
  useSession: () => ({
    session: sessionState.session,
    isLoading: false,
    isAuthenticated: sessionState.session !== null,
    refetch: vi.fn(),
  }),
}));

vi.mock("@/lib/api/client", () => ({
  apiRequest: vi.fn(),
}));

import { apiRequest } from "@/lib/api/client";

function makeSession(overrides: Partial<SessionDto> = {}): SessionDto {
  return {
    accountId: "acct-teacher",
    username: "teacher.alice",
    displayName: "老師 Alice",
    role: "teacher",
    canCreateCourse: true,
    mustChangePassword: false,
    sessionId: "sess-teacher",
    expiresAt: "2026-08-21T12:00:00.000Z",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  sessionState.session = makeSession();
});

describe("TeacherHomeView", () => {
  it("renders the page heading and session identity", () => {
    render(<TeacherHomePage />);

    expect(
      screen.getByRole("heading", { level: 1, name: "老師首頁" }),
    ).toBeInTheDocument();
    expect(screen.getByText("老師 Alice")).toBeInTheDocument();
    expect(screen.getByText("teacher.alice")).toBeInTheDocument();
    expect(screen.getByText("teacher")).toBeInTheDocument();
    expect(screen.getByText("可以開課")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "建立課程" })).toHaveAttribute(
      "href",
      "/courses/new",
    );
    expect(apiRequest).not.toHaveBeenCalled();
  });

  it("clearly shows when the account cannot create courses", () => {
    sessionState.session = makeSession({ canCreateCourse: false });

    render(<TeacherHomeView />);

    expect(screen.getByText("目前無法開課")).toBeInTheDocument();
    expect(
      screen.getByText("目前無法開課：目前帳號沒有開課權限。"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "建立課程" }),
    ).not.toBeInTheDocument();
  });

  it("renders no session content when there is no session", () => {
    sessionState.session = null;

    render(<TeacherHomeView />);

    expect(
      screen.queryByRole("heading", { name: "帳號資訊" }),
    ).not.toBeInTheDocument();
    expect(apiRequest).not.toHaveBeenCalled();
  });
});
