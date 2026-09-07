import { SessionsForm } from "@/domains/new_dashboard/components/profile/SessionsForm";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getActiveSessions: vi.fn(),
  revokeSession: vi.fn(),
  revokeOtherSessions: vi.fn(),
  logout: vi.fn(),
}));

vi.mock("@/domains/auth/application/AuthContext", () => ({
  useAuth: () => ({ logout: mocks.logout }),
}));

vi.mock("@/domains/auth/infrastructure/sessionsApi", () => ({
  getActiveSessions: mocks.getActiveSessions,
  revokeSession: mocks.revokeSession,
  revokeOtherSessions: mocks.revokeOtherSessions,
}));

const sessions = [
  {
    id: "current", device: "Google Chrome em Windows", userAgent: null,
    ipAddress: "127.0.0.1", createdAt: "2026-08-29T12:00:00.000Z",
    lastSeenAt: "2026-08-29T12:00:00.000Z", expiresAt: "2026-09-28T12:00:00.000Z",
    isCurrent: true,
  },
  {
    id: "other", device: "Firefox em Linux", userAgent: null,
    ipAddress: null, createdAt: "2026-08-28T12:00:00.000Z",
    lastSeenAt: "2026-08-28T12:00:00.000Z", expiresAt: "2026-09-27T12:00:00.000Z",
    isCurrent: false,
  },
];

describe("SessionsForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getActiveSessions.mockResolvedValue(sessions);
    mocks.revokeSession.mockResolvedValue({ currentSessionRevoked: false });
    mocks.revokeOtherSessions.mockResolvedValue({ revokedCount: 1 });
  });

  it("lista sessões e identifica a sessão atual", async () => {
    render(<SessionsForm />);
    expect(screen.getByText(/carregando/i)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText(/google chrome/i)).toBeInTheDocument());
    expect(screen.getByText(/google chrome em windows.*esta sessão/i)).toBeInTheDocument();
    expect(screen.getByText(/firefox em linux/i)).toBeInTheDocument();
  });

  it("revoga as outras sessões e atualiza a lista", async () => {
    render(<SessionsForm />);
    await waitFor(() => expect(screen.getByText(/firefox em linux/i)).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /encerrar outras sessões/i }));
    await waitFor(() => expect(mocks.revokeOtherSessions).toHaveBeenCalled());
    expect(screen.getByText("1 sessão(ões) revogada(s).")).toBeInTheDocument();
  });

  it("encerra o contexto autenticado quando a sessão atual é revogada", async () => {
    mocks.revokeSession.mockResolvedValue({ currentSessionRevoked: true });
    render(<SessionsForm />);
    await waitFor(() => expect(screen.getByText(/google chrome/i)).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /encerrar esta sessão/i }));
    await waitFor(() => expect(mocks.logout).toHaveBeenCalled());
  });
});
