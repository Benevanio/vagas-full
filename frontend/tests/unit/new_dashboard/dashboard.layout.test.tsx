import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DashboardTab } from "@/domains/new_dashboard/components/dashboard/DashboardTab";
import { KanbanBoard } from "@/domains/new_dashboard/components/dashboard/KanbanBoard";
import { CandidateLogo } from "@/domains/new_dashboard/components/shared/CandidateLogo";
import { Header } from "@/domains/new_dashboard/components/layout/Header";
import { MobileTabBar } from "@/domains/new_dashboard/components/layout/MobileTabBar";
import { Sidebar } from "@/domains/new_dashboard/components/layout/Sidebar";
import { ThemeToggle } from "@/domains/new_dashboard/components/layout/ThemeToggle";
import type { Job } from "@/domains/new_dashboard/types";

const mockUseAuth = vi.fn();
const mockUseTheme = vi.fn();

vi.mock("@/domains/auth/application/AuthContext", () => ({
  useAuth: () => mockUseAuth(),
}));

vi.mock("@/shared/hooks/useTheme", () => ({
  useTheme: () => mockUseTheme(),
}));

vi.mock("@/domains/new_dashboard/infrastructure/notificationsApi", () => ({
  getDashboardNotificationFeed: vi.fn().mockResolvedValue({
    messages: [],
    notifications: [],
    unreadCount: 0,
  }),
  markDashboardNotificationsRead: vi.fn().mockResolvedValue(undefined),
  clearDashboardNotifications: vi.fn().mockResolvedValue(undefined),
}));

function renderWithRouter(ui: React.ReactElement, pathname = "/dashboard") {
  return render(
    <MemoryRouter initialEntries={[pathname]}>{ui}</MemoryRouter>,
  );
}

const baseJob: Job = {
  id: "job-1",
  jobTitle: "Frontend Developer",
  company: "ACME",
  location: "São Paulo, Brasil",
  salary: "R$ 10.000",
  type: "Híbrido",
  level: "Pleno",
  matchScore: 88,
  tags: ["React"],
  posted: "Hoje",
  status: "saved",
  jobLink: "https://example.com/job-1",
  source: "LinkedIn",
  notes: "",
};

describe("new_dashboard dashboard and layout components", () => {
  beforeEach(() => {
    mockUseAuth.mockReturnValue({
      user: {
        id: "user-1",
        email: "maria@exemplo.com",
        displayName: "Maria Clara",
        avatarUrl: "https://cdn.example.com/avatar.png",
      },
      logout: vi.fn(),
    });
    mockUseTheme.mockReturnValue({
      resolvedTheme: "dark",
      toggleTheme: vi.fn(),
    });
  });

  it("renderiza o tab de dashboard com métricas e botão de adicionar vaga", () => {
    render(
      <DashboardTab
        jobs={[
          baseJob,
          { ...baseJob, id: "job-2", status: "interviewing", jobTitle: "Backend" },
        ]}
        technologies={[
          { name: "React", years: 5 },
          { name: "TypeScript", years: 4 },
          { name: "Node.js", years: 2 },
          { name: "Express", years: 3.5 },
          { name: "Docker", years: 3.5 },
          { name: "Postgres", years: 4 },
          { name: "Drizzle", years: 1 },
          { name: "PHP", years: 3 },
          { name: "Laravel", years: 3 },
          { name: "Linux", years: 15 },
        ]}
        onOpenJob={vi.fn()}
        onStatusChange={vi.fn()}
        onAddJob={vi.fn()}
      />,
    );

    expect(screen.getByRole("heading", { name: /gerenciar vagas/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /adicionar vaga/i })).toBeInTheDocument();
    expect(screen.getByText(/sincronizado/i)).toBeInTheDocument();
    expect(screen.getByText(/vagas monitoradas \(2\)/i)).toBeInTheDocument();
    expect(screen.getByText("React")).toBeInTheDocument();
    expect(screen.getByText("TypeScript")).toBeInTheDocument();
    expect(screen.getByText("Laravel")).toBeInTheDocument();
    expect(screen.getByText("Linux")).toBeInTheDocument();
  });

  it("permite arrastar uma vaga entre colunas no kanban", () => {
    const onOpenJob = vi.fn();
    const onStatusChange = vi.fn();
    const dataTransfer = {
      effectAllowed: "",
      setData: vi.fn(),
      getData: vi.fn(() => "job-1"),
    };

    render(
      <KanbanBoard
        jobs={[
          baseJob,
          { ...baseJob, id: "job-2", status: "applied", jobTitle: "Backend" },
        ]}
        onOpenJob={onOpenJob}
        onStatusChange={onStatusChange}
      />,
    );

    const savedCard = screen.getByText("Frontend Developer").closest("[draggable='true']");
    const appliedColumn = screen.getByText("CANDIDATADAS").closest("section");

    expect(savedCard).toBeTruthy();
    expect(appliedColumn).toBeTruthy();

    fireEvent.dragStart(savedCard as Element, { dataTransfer });
    fireEvent.drop(appliedColumn as Element);
    fireEvent.dragEnd(savedCard as Element);
    fireEvent.click(screen.getByText("Frontend Developer"));

    expect(dataTransfer.setData).toHaveBeenCalledWith("text/plain", "job-1");
    expect(onStatusChange).toHaveBeenCalledWith("job-1", "applied");
    expect(onOpenJob).toHaveBeenCalledWith(baseJob);
  });

  it("renderiza o tema, logo e navegação lateral", () => {
    renderWithRouter(
      <>
        <Header />
        <Sidebar />
        <ThemeToggle />
        <CandidateLogo />
      </>,
      "/dashboard",
    );

    expect(
      screen.getByRole("heading", { name: /métricas & vagas/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/maria clara/i)).toBeInTheDocument();
    expect(screen.getByAltText(/avatar de maria clara/i)).toBeInTheDocument();
    expect(screen.getAllByLabelText(/alternar tema/i)).toHaveLength(2);
    expect(screen.getAllByLabelText("Cand!Date!")).toHaveLength(2);

    fireEvent.click(screen.getByLabelText("Menu do usuário"));
    fireEvent.click(screen.getByRole("button", { name: /meu perfil/i }));
    expect(screen.getByRole("link", { name: /dashboard/i })).toBeInTheDocument();
  });

  it("executa logout a partir da sidebar", () => {
    const logout = vi.fn();
    mockUseAuth.mockReturnValue({
      user: { id: "user-1", email: "maria@exemplo.com" },
      logout,
    });

    renderWithRouter(<Sidebar />, "/home");

    fireEvent.click(screen.getByRole("button", { name: /sair/i }));
    expect(logout).toHaveBeenCalledTimes(1);
  });

  it("renderiza a navegação mobile e destaca a aba ativa", () => {
    renderWithRouter(<MobileTabBar />, "/vagas");

    const navigation = screen.getByRole("navigation", {
      name: /navegação principal mobile/i,
    });
    const activeLink = within(navigation).getByRole("link", { name: /vagas/i });

    // 5 abas desde a adição de "Relatórios" (PAV-30).
    expect(within(navigation).getAllByRole("link")).toHaveLength(5);
    expect(activeLink).toHaveAttribute("aria-current", "page");
    expect(within(navigation).getByRole("link", { name: /início/i })).toHaveAttribute(
      "href",
      "/home",
    );
  });
});
