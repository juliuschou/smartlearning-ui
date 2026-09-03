import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import StudentLayout from "@/app/(student)/layout";
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
    value: "/student",
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
    accountId: "acct-student",
    username: "student.alice",
    displayName: "學生 Alice",
    role: "student",
    canCreateCourse: false,
    mustChangePassword: false,
    sessionId: "sess-student",
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
      <StudentLayout>
        <div data-testid="protected-child">學生受保護內容</div>
      </StudentLayout>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.sessionState.session = null;
  mocks.sessionState.isLoading = false;
  mocks.pathnameState.value = "/student";
});

describe("StudentLayout — access gates", () => {
  it("does not render children while the session is loading", () => {
    mocks.sessionState.isLoading = true;

    renderLayout();

    expect(screen.getByText("載入中…")).toBeInTheDocument();
    expect(screen.queryByTestId("protected-child")).not.toBeInTheDocument();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("redirects forced password changes before checking the student role", () => {
    mocks.sessionState.session = makeSession({
      role: "teacher",
      mustChangePassword: true,
    });

    expect(() => renderLayout()).toThrow("REDIRECT:/settings/password");
    expect(mocks.redirect).toHaveBeenCalledWith("/settings/password");
    expect(screen.queryByTestId("protected-child")).not.toBeInTheDocument();
  });

  it("redirects a missing session to the encoded current pathname", () => {
    mocks.pathnameState.value = "/student/courses?tab=active";

    expect(() => renderLayout()).toThrow(
      "REDIRECT:/login?next=%2Fstudent%2Fcourses%3Ftab%3Dactive",
    );
    expect(mocks.redirect).toHaveBeenCalledWith(
      "/login?next=%2Fstudent%2Fcourses%3Ftab%3Dactive",
    );
    expect(screen.queryByTestId("protected-child")).not.toBeInTheDocument();
  });

  it.each(["admin", "teacher"] as const)(
    "redirects a %s session without rendering student children",
    (role) => {
      mocks.sessionState.session = makeSession({ role });

      expect(() => renderLayout()).toThrow("REDIRECT:/login?next=%2Fstudent");
      expect(mocks.redirect).toHaveBeenCalledWith("/login?next=%2Fstudent");
      expect(screen.queryByTestId("protected-child")).not.toBeInTheDocument();
    },
  );

  it("uses /student when pathname is null", () => {
    mocks.pathnameState.value = null;

    expect(() => renderLayout()).toThrow("REDIRECT:/login?next=%2Fstudent");
    expect(mocks.redirect).toHaveBeenCalledWith("/login?next=%2Fstudent");
  });

  it("renders the student shell and children for a valid student", () => {
    mocks.sessionState.session = makeSession();

    renderLayout();

    expect(screen.getByText("學員專區")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "變更密碼" })).toHaveAttribute(
      "href",
      "/settings/password",
    );
    expect(screen.getByRole("button", { name: "登出" })).toBeInTheDocument();
    expect(screen.getByTestId("protected-child")).toBeInTheDocument();
  });
});
