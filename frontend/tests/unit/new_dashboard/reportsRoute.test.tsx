import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import NewDashboardPage from "@/domains/new_dashboard/NewDashboardPage";

vi.mock("recharts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("recharts")>();
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: React.ReactElement }) =>
      children,
  };
});

vi.mock("@/domains/auth/application/AuthContext", () => ({
  useAuth: () => ({
    user: { id: "user-1", email: "maria@exemplo.com" },
    refreshUser: vi.fn(),
    logout: vi.fn(),
  }),
}));

vi.mock("@/domains/new_dashboard/hooks/useUserDashboardData", () => ({
  useUserDashboardData: () => ({
    userProfile: {
      firstName: "Maria",
      lastName: "Clara",
      displayName: "Maria Clara",
      username: "mariaclara",
      email: "maria@exemplo.com",
      avatarUrl: "",
      phone: "",
      level: "Pleno",
      technologies: [],
      technologyExperiences: [],
    },
    setUserProfile: vi.fn(),
    searchPreferences: {
      keywords: [],
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
  }),
}));

vi.mock("@/domains/new_dashboard/hooks/useDashboardJobs", () => ({
  useDashboardJobs: () => ({
    trackedJobs: [],
    recommendedJobs: [],
    recommendedPagination: {
      total: 0,
      page: 1,
      limit: 50,
      totalPages: 1,
      hasNext: false,
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
  }),
}));

vi.mock("@/domains/new_dashboard/infrastructure/dashboardJobsApi", () => ({
  getDashboardSavedJobEvents: vi.fn().mockResolvedValue([]),
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

const reportsApiMock = vi.hoisted(() => ({
  getReportsKpis: vi.fn(),
}));

vi.mock("@/domains/new_dashboard/infrastructure/reportsApi", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/domains/new_dashboard/infrastructure/reportsApi")>();
  return { ...actual, getReportsKpis: reportsApiMock.getReportsKpis };
});

function renderPage(pathname: string) {
  return render(
    <MemoryRouter initialEntries={[pathname]}>
      <NewDashboardPage />
    </MemoryRouter>,
  );
}

describe("NewDashboardPage — rota /relatorios (KPI-10)", () => {
  beforeEach(() => {
    reportsApiMock.getReportsKpis.mockReset();
    reportsApiMock.getReportsKpis.mockResolvedValue({
      range: { from: "2025-12-15", to: "2026-03-15" },
      weeklyApplications: [],
      interviewRate: { value: 0, insufficientData: true },
      stageDurations: {
        savedToApplied: null,
        appliedToInterviewing: null,
        interviewingToOutcome: null,
      },
    });
  });

  it(
    "renderiza a tela de relatórios (lazy) para /relatorios",
    async () => {
      renderPage("/relatorios");

      expect(
        await screen.findByRole(
          "heading",
          { name: "Relatórios" },
          { timeout: 9000 },
        ),
      ).toBeInTheDocument();
      await waitFor(
        () => expect(reportsApiMock.getReportsKpis).toHaveBeenCalled(),
        { timeout: 9000 },
      );
    },
    10000,
  );
});
