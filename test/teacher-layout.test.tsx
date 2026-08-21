import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import TeacherLayout from "@/app/(teacher)/layout";
import type { SessionDto } from "@/lib/api/types";

const mocks = vi.hoisted(() => {
  const sessionState: {
    session: SessionDto | null;
    isLoading: boolean;
  } = {
    session: null,
    isLoading: false,
  };
  const pathnameState: { value: string | null } = {
    value: "/teacher",
  };
  const redirect = vi.fn((destination: string): never => {
    throw new Error(`REDIRECT:${destination}`);
  });

  return {
    sessionState,
    pathnameState,
    redirect,
    replace: vi.fn(),
  };
});

vi.mock("next/navigation", () => ({
  redirect: mocks.redirect,
  usePathname: () => mocks.pathnameState.value,
  useRouter: () => ({ replace: mocks.replace }),
}));

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
  }: {
    children: React.ReactNode;
    href: string;
  }) => <a href={href}>{children}</a>,
}));

vi.mock("@/lib/auth/session", () => ({
  useSession: () => ({
    session: mocks.sessionState.session,
    isLoading: mocks.sessionState.isLoading,
    isAuthenticated: mocks.sessionState.session !== null,
    refetch: vi.fn(),
  }),
}));

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

function renderLayout() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <TeacherLayout>
        <div data-testid="protected-child">受保護內容</div>
      </TeacherLayout>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.sessionState.session = null;
  mocks.sessionState.isLoading = false;
  mocks.pathnameState.value = "/teacher";
});

describe("TeacherLayout — access gates", () => {
  it("does not render children while the session is loading", () => {
    mocks.sessionState.isLoading = true;

    renderLayout();

    expect(screen.getByText("載入中…")).toBeInTheDocument();
    expect(screen.queryByTestId("protected-child")).not.toBeInTheDocument();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("redirects forced password changes before checking the role", () => {
    mocks.sessionState.session = makeSession({
      role: "student",
      mustChangePassword: true,
    });

    expect(() => renderLayout()).toThrow("REDIRECT:/settings/password");
    expect(mocks.redirect).toHaveBeenCalledWith("/settings/password");
    expect(screen.queryByTestId("protected-child")).not.toBeInTheDocument();
  });

  it("redirects a missing session to the encoded current pathname", () => {
    mocks.pathnameState.value = "/teacher/lessons/one";

    expect(() => renderLayout()).toThrow(
      "REDIRECT:/login?next=%2Fteacher%2Flessons%2Fone",
    );
    expect(mocks.redirect).toHaveBeenCalledWith(
      "/login?next=%2Fteacher%2Flessons%2Fone",
    );
    expect(screen.queryByTestId("protected-child")).not.toBeInTheDocument();
  });

  it("redirects a wrong role to the encoded current pathname", () => {
    mocks.sessionState.session = makeSession({ role: "admin" });
    mocks.pathnameState.value = "/teacher";

    expect(() => renderLayout()).toThrow("REDIRECT:/login?next=%2Fteacher");
    expect(mocks.redirect).toHaveBeenCalledWith("/login?next=%2Fteacher");
    expect(screen.queryByTestId("protected-child")).not.toBeInTheDocument();
  });

  it("uses /teacher when pathname is null", () => {
    mocks.pathnameState.value = null;

    expect(() => renderLayout()).toThrow("REDIRECT:/login?next=%2Fteacher");
    expect(mocks.redirect).toHaveBeenCalledWith("/login?next=%2Fteacher");
  });

  it("renders the teacher shell and children for a valid teacher", () => {
    mocks.sessionState.session = makeSession();

    renderLayout();

    expect(screen.getByText("老師專區")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "變更密碼" })).toHaveAttribute(
      "href",
      "/settings/password",
    );
    expect(screen.getByRole("button", { name: "登出" })).toBeInTheDocument();
    expect(screen.getByTestId("protected-child")).toBeInTheDocument();
  });
});
