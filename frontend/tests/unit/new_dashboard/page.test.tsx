import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import NewDashboardPage from "@/domains/new_dashboard/NewDashboardPage";

const mockUseAuth = vi.fn();
const mockUseUserDashboardData = vi.fn();
const mockUseDashboardJobs = vi.fn();
let dashboardJobsState: {
  trackedJobs: Array<Record<string, unknown>>;
  recommendedJobs: Array<Record<string, unknown>>;
  recommendedPagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
  isLoadingJobs: boolean;
  isRefreshingJobs: boolean;
  refreshRecommendations: ReturnType<typeof vi.fn>;
  changeRecommendationsPage: ReturnType<typeof vi.fn>;
  addTrackedJob: ReturnType<typeof vi.fn>;
  changeJobStatus: ReturnType<typeof vi.fn>;
  changeJobNotesLocally: ReturnType<typeof vi.fn>;
  saveJobNotes: ReturnType<typeof vi.fn>;
};

vi.mock("@/domains/auth/application/AuthContext", () => ({
  useAuth: () => mockUseAuth(),
}));

vi.mock("@/domains/new_dashboard/hooks/useUserDashboardData", () => ({
  useUserDashboardData: () => mockUseUserDashboardData(),
}));

vi.mock("@/domains/new_dashboard/hooks/useDashboardJobs", () => ({
  useDashboardJobs: () => mockUseDashboardJobs(),
}));

vi.mock("@/domains/new_dashboard/infrastructure/dashboardJobsApi", () => ({
  getDashboardSavedJobEvents: vi.fn().mockResolvedValue([]),
  getDashboardApplicationNotes: vi.fn().mockResolvedValue([]),
  createDashboardApplicationNote: vi.fn(),
  updateDashboardApplicationNote: vi.fn(),
  deleteDashboardApplicationNote: vi.fn(),
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

function renderPage(pathname: string) {
  return render(
    <MemoryRouter initialEntries={[pathname]}>
      <NewDashboardPage />
    </MemoryRouter>,
  );
}

describe("NewDashboardPage", () => {
  beforeEach(() => {
    dashboardJobsState = {
      trackedJobs: [
        {
          id: "job-1",
          jobTitle: "Frontend Developer",
          company: "ACME",
          location: "Remoto",
          salary: "A combinar",
          type: "Remoto",
          level: "Pleno",
          matchScore: 88,
          tags: ["React"],
          posted: "Hoje",
          status: "saved",
          jobLink: "https://example.com",
          source: "LinkedIn",
          notes: "",
        },
      ],
      recommendedJobs: [
        {
          id: "job-2",
          jobTitle: "Backend Developer",
          company: "Globex",
          location: "Brasil",
          salary: "A combinar",
          type: "Híbrido",
          level: "Sênior",
          matchScore: 91,
          tags: ["Node.js"],
          posted: "Hoje",
          status: "saved",
          jobLink: "https://example.com/2",
          source: "Gupy",
          notes: "",
        },
      ],
      recommendedPagination: {
        total: 2,
        page: 1,
        limit: 50,
        totalPages: 3,
        hasNext: true,
        hasPrev: false,
      },
      isLoadingJobs: false,
      isRefreshingJobs: false,
      refreshRecommendations: vi.fn(),
      changeRecommendationsPage: vi.fn(),
      addTrackedJob: vi.fn(),
      changeJobStatus: vi.fn(),
      changeJobNotesLocally: vi.fn(),
      saveJobNotes: vi.fn(),
    };

    mockUseAuth.mockReturnValue({
      user: { id: "user-1", email: "maria@exemplo.com" },
      refreshUser: vi.fn(),
      logout: vi.fn(),
    });

    mockUseUserDashboardData.mockReturnValue({
      userProfile: {
        firstName: "Maria",
        lastName: "Clara",
        displayName: "Maria Clara",
        username: "mariaclara",
        email: "maria@exemplo.com",
        avatarUrl: "",
        phone: "(11) 99999-9999",
        level: "Pleno",
        technologies: ["React", "TypeScript"],
        technologyExperiences: [
          { name: "React", years: 5 },
          { name: "TypeScript", years: 4 },
        ],
      },
      setUserProfile: vi.fn(),
      searchPreferences: {
        keywords: ["React"],
        searchLocation: "Brasil",
        remoteOnly: false,
        jobTypes: [],
        emailNotifications: true,
        careerChecklist: [],
      },
      setSearchPreferences: vi.fn(),
      isLoadingUserData: false,
      isSavingProfile: false,
      isSavingPreferences: false,
      userDataError: "",
      saveUserProfile: vi.fn(),
      saveSearchPreferences: vi.fn(),
    });

    mockUseDashboardJobs.mockReturnValue(dashboardJobsState);
  });

  it("renderiza a home com saudação e vagas salvas", () => {
    renderPage("/home");

    expect(
      screen.getByRole("heading", { name: /que bom te ver de volta/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/frontend developer/i)).toBeInTheDocument();
    expect(screen.getByText(/vagas salvas recentes/i)).toBeInTheDocument();
  });

  it("renderiza o dashboard de vagas", () => {
    renderPage("/dashboard");

    expect(screen.getByRole("heading", { name: /gerenciar vagas/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /adicionar vaga/i })).toBeInTheDocument();
  });

  it("abre e salva uma nova vaga no dashboard", () => {
    renderPage("/dashboard");

    fireEvent.click(screen.getByRole("button", { name: /adicionar vaga/i }));
    expect(screen.getByRole("heading", { name: /adicionar vaga/i })).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText(/desenvolvedor frontend/i), {
      target: { value: "Nova vaga" },
    });
    fireEvent.change(screen.getByPlaceholderText(/nome da empresa/i), {
      target: { value: "ACME" },
    });
    fireEvent.change(screen.getByPlaceholderText(/https:\/\/\.\.\./i), {
      target: { value: "https://example.com/new-job" },
    });
    fireEvent.click(screen.getByRole("button", { name: /salvar vaga/i }));

    expect(dashboardJobsState.addTrackedJob).toHaveBeenCalled();
  });

  it("abre vaga salva e persiste notas ao concluir", () => {
    renderPage("/dashboard");

    fireEvent.click(screen.getByRole("button", { name: /frontend developer/i }));
    expect(screen.getByRole("heading", { name: /frontend developer/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /concluir/i }));

    expect(dashboardJobsState.saveJobNotes).toHaveBeenCalled();
  });

  it("renderiza a busca de vagas", () => {
    renderPage("/vagas");

    expect(
      screen.getByRole("heading", { name: /vagas abertas recomendadas/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /buscar vagas/i })).toBeInTheDocument();
  });

  it("usa apenas vagas remotas como padrão quando a preferência está ativa", async () => {
    mockUseUserDashboardData.mockReturnValue({
      ...mockUseUserDashboardData(),
      searchPreferences: {
        keywords: ["React"],
        searchLocation: "Brasil",
        remoteOnly: true,
        jobTypes: ["Remoto"],
        emailNotifications: true,
        careerChecklist: [],
      },
    });
    dashboardJobsState.recommendedJobs = [
      {
        id: "remote-job",
        jobTitle: "Remote Node",
        company: "Globex",
        location: "Global",
        salary: "A combinar",
        type: "Remoto",
        level: "Sênior",
        matchScore: 91,
        tags: ["Node.js"],
        posted: "Hoje",
        status: "saved",
        jobLink: "https://example.com/remote",
        source: "Gupy",
        notes: "",
      },
      {
        id: "onsite-job",
        jobTitle: "Onsite Node",
        company: "ACME",
        location: "São Paulo",
        salary: "A combinar",
        type: "Presencial",
        level: "Sênior",
        matchScore: 88,
        tags: ["Node.js"],
        posted: "Hoje",
        status: "saved",
        jobLink: "https://example.com/onsite",
        source: "LinkedIn",
        notes: "",
      },
    ];

    renderPage("/vagas");

    await waitFor(() => {
      expect(screen.getByDisplayValue("Somente remotas")).toBeInTheDocument();
    });

    expect(screen.getByText(/preferência ativa/i)).toBeInTheDocument();
    expect(screen.getByText("Remote Node")).toBeInTheDocument();
    expect(screen.queryByText("Onsite Node")).not.toBeInTheDocument();

    fireEvent.change(screen.getByDisplayValue("Match (padrão)"), {
      target: { value: "desc" },
    });

    expect(screen.queryByText(/preferência ativa/i)).not.toBeInTheDocument();
  });

  it("aciona a busca e paginação de vagas", () => {
    renderPage("/vagas");

    fireEvent.change(screen.getByPlaceholderText(/buscar por cargo, empresa ou keywords/i), {
      target: { value: "node.js" },
    });
    fireEvent.click(screen.getByRole("button", { name: /buscar vagas/i }));
    fireEvent.click(screen.getByRole("button", { name: /próxima página/i }));

    expect(dashboardJobsState.refreshRecommendations).toHaveBeenCalledWith(
      ["node.js"],
      {},
      2,
      50,
    );
    expect(dashboardJobsState.changeRecommendationsPage).not.toHaveBeenCalled();
  });

  it("mantém a ordenação por match ao trocar de página", () => {
    renderPage("/vagas");

    fireEvent.change(screen.getByDisplayValue("Match (padrão)"), {
      target: { value: "desc" },
    });
    fireEvent.click(screen.getByRole("button", { name: /próxima página/i }));

    expect(dashboardJobsState.refreshRecommendations).toHaveBeenCalledWith(
      [],
      { matchSort: "desc" },
      2,
      50,
    );
  });

  it("mantém a ordem recebida do backend ao selecionar match", () => {
    dashboardJobsState.recommendedJobs = [
      {
        id: "job-low",
        jobTitle: "Vaga menor match",
        company: "ACME",
        location: "Brasil",
        salary: "A combinar",
        type: "Remoto",
        level: "Pleno",
        matchScore: 45,
        tags: ["React"],
        posted: "Hoje",
        status: "saved",
        jobLink: "https://example.com/low",
        source: "LinkedIn",
        notes: "",
        rawPayload: { matchSource: "backend_profile" },
      },
      {
        id: "job-high",
        jobTitle: "Vaga maior match",
        company: "Globex",
        location: "Brasil",
        salary: "A combinar",
        type: "Remoto",
        level: "Pleno",
        matchScore: 98,
        tags: ["React"],
        posted: "Hoje",
        status: "saved",
        jobLink: "https://example.com/high",
        source: "Gupy",
        notes: "",
        rawPayload: { matchSource: "backend_profile" },
      },
    ];

    renderPage("/vagas");

    fireEvent.change(screen.getByDisplayValue("Match (padrão)"), {
      target: { value: "desc" },
    });

    const rows = screen.getAllByRole("row").slice(1);
    expect(rows[0]).toHaveTextContent("Vaga menor match");
    expect(rows[1]).toHaveTextContent("Vaga maior match");
  });

  it("calcula o match das vagas com base nas tecnologias do perfil", () => {
    dashboardJobsState.recommendedJobs = [
      {
        id: "job-match",
        jobTitle: "Frontend React Developer",
        company: "ACME",
        location: "Brasil",
        salary: "A combinar",
        type: "Remoto",
        level: "Pleno",
        matchScore: 70,
        tags: ["React"],
        posted: "Hoje",
        status: "saved",
        jobLink: "https://example.com/match",
        source: "LinkedIn",
        notes: "",
        rawPayload: {
          description: "Aplicação com React, TypeScript e design system.",
        },
      },
    ];

    renderPage("/vagas");

    expect(screen.getByText("98%")).toBeInTheDocument();
    expect(screen.getByText("98%")).toHaveAttribute(
      "title",
      "Tecnologias em comum: React, TypeScript",
    );
  });

  it("envia filtros estruturados de localização para recomendações", () => {
    renderPage("/vagas");

    const [
      typeSelect,
      levelSelect,
      continentSelect,
      countrySelect,
      matchSortSelect,
    ] =
      screen.getAllByRole("combobox");

    fireEvent.change(typeSelect, { target: { value: "Híbrido" } });
    fireEvent.change(levelSelect, { target: { value: "Sênior" } });
    fireEvent.change(continentSelect, { target: { value: "América do Sul" } });
    fireEvent.change(countrySelect, { target: { value: "Brasil" } });
    fireEvent.change(matchSortSelect, { target: { value: "desc" } });
    fireEvent.click(screen.getByRole("button", { name: /buscar vagas/i }));

    expect(dashboardJobsState.refreshRecommendations).toHaveBeenCalledWith(
      [],
      {
        type: "Híbrido",
        model: "Híbrido",
        level: "Sênior",
        continent: "América do Sul",
        country: "Brasil",
        location: "Brasil",
        matchSort: "desc",
      },
      1,
    );
  });

  it("busca sem keywords quando o campo de busca está vazio", () => {
    renderPage("/vagas");

    fireEvent.click(screen.getByRole("button", { name: /buscar vagas/i }));

    expect(dashboardJobsState.refreshRecommendations).toHaveBeenCalledWith(
      [],
      {},
      1,
    );
  });

  it("atualiza o status da vaga aberta no modal", () => {
    renderPage("/dashboard");

    fireEvent.click(screen.getByRole("button", { name: /frontend developer/i }));
    fireEvent.change(screen.getByLabelText(/^status$/i), {
      target: { value: "interviewing" },
    });

    expect(dashboardJobsState.changeJobStatus).toHaveBeenCalledWith(
      "job-1",
      "interviewing",
    );
  });

  it("renderiza a tela de perfil com formulário de avatar", () => {
    renderPage("/perfil");

    expect(
      screen.getByRole("heading", { name: /informações gerais/i }),
    ).toBeInTheDocument();
    expect(screen.getByPlaceholderText("https://...")).toBeInTheDocument();
  });

  it("renderiza a tela de mentoria", () => {
    renderPage("/mentoria");

    expect(
      screen.getByRole("heading", { name: /mentores disponíveis/i }),
    ).toBeInTheDocument();
  });

  it("renderiza a central de ajuda", () => {
    renderPage("/ajuda");

    expect(
      screen.getByRole("heading", { name: /perguntas frequentes & central de ajuda/i }),
    ).toBeInTheDocument();
  });
});
