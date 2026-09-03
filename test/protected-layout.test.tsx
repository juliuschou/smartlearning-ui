import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ProtectedLayout from "@/app/(protected)/layout";
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
    value: "/settings/password",
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
      <ProtectedLayout>
        <div data-testid="protected-child">帳號設定內容</div>
      </ProtectedLayout>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.sessionState.session = null;
  mocks.sessionState.isLoading = false;
  mocks.pathnameState.value = "/settings/password";
});

describe("ProtectedLayout — access gates", () => {
  it("does not render children while the session is loading", () => {
    mocks.sessionState.isLoading = true;

    renderLayout();

    expect(screen.getByText("載入中…")).toBeInTheDocument();
    expect(screen.queryByTestId("protected-child")).not.toBeInTheDocument();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("redirects a missing session to the encoded current pathname", () => {
    mocks.pathnameState.value = "/settings/password?from=%2Fstudent";

    expect(() => renderLayout()).toThrow(
      "REDIRECT:/login?next=%2Fsettings%2Fpassword%3Ffrom%3D%252Fstudent",
    );
    expect(mocks.redirect).toHaveBeenCalledWith(
      "/login?next=%2Fsettings%2Fpassword%3Ffrom%3D%252Fstudent",
    );
    expect(screen.queryByTestId("protected-child")).not.toBeInTheDocument();
  });

  it("uses /settings/password when pathname is null", () => {
    mocks.pathnameState.value = null;

    expect(() => renderLayout()).toThrow(
      "REDIRECT:/login?next=%2Fsettings%2Fpassword",
    );
    expect(mocks.redirect).toHaveBeenCalledWith(
      "/login?next=%2Fsettings%2Fpassword",
    );
  });

  it.each(["admin", "teacher", "student"] as const)(
    "renders the settings shell for an authenticated %s",
    (role) => {
      mocks.sessionState.session = makeSession({ role });

      renderLayout();

      expect(screen.getByText("帳號設定")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "登出" })).toBeInTheDocument();
      expect(screen.getByTestId("protected-child")).toBeInTheDocument();
      expect(mocks.redirect).not.toHaveBeenCalled();
    },
  );

  it("allows a forced-password user to remain on the password route", () => {
    mocks.sessionState.session = makeSession({ mustChangePassword: true });

    renderLayout();

    expect(screen.getByText("帳號設定")).toBeInTheDocument();
    expect(screen.getByTestId("protected-child")).toBeInTheDocument();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
});
