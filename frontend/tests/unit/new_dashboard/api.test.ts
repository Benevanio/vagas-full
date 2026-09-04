import { beforeEach, describe, expect, it, vi } from "vitest";

const apiMock = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  delete: vi.fn(),
}));

vi.mock("@/shared/lib/apiClient", () => ({
  api: apiMock,
}));

import {
  createDashboardSavedJob,
  deleteDashboardSavedJob,
  getDashboardSavedJobEvents,
  getDashboardSavedJobs,
  searchDashboardJobs,
  toRecommendedJob,
  updateDashboardSavedJob,
} from "@/domains/new_dashboard/infrastructure/dashboardJobsApi";
import {
  clearDashboardNotifications,
  getDashboardNotificationFeed as getNotificationFeed,
  markDashboardNotificationsRead as markNotificationsRead,
  markSingleNotificationRead,
} from "@/domains/new_dashboard/infrastructure/notificationsApi";
import {
  getUserPreferences,
  getUserProfile,
  toSearchPreferences,
  toUserProfile,
  updateUserPreferences,
  updateUserProfile,
} from "@/domains/new_dashboard/infrastructure/userDashboardApi";

describe("new_dashboard api adapters", () => {
  beforeEach(() => {
    apiMock.get.mockReset();
    apiMock.post.mockReset();
    apiMock.patch.mockReset();
    apiMock.delete.mockReset();
  });

  it("mapeia vagas recomendadas com payload bruto e paginação", async () => {
    apiMock.get.mockResolvedValue({
      data: {
        total: 2,
        page: 3,
        limit: 25,
        totalPages: 4,
        hasNext: true,
        hasPrev: true,
        jobs: [
          {
            title: "Frontend Developer",
            company: "ACME",
            location: "Brasil",
            source: "LinkedIn",
            keyword: "React",
            keywords: ["React", "TypeScript"],
            url: "",
            description: "Detalhe",
            postedAt: "2026-07-25T18:54:24Z",
            matchScore: 91,
            matchSource: "backend_profile",
            matchedTechnologies: ["React", "TypeScript"],
          },
        ],
      },
    });

    const result = await searchDashboardJobs(
      ["React"],
      {
        type: "Remoto",
        level: "Pleno",
        continent: "América do Sul",
        country: "Brasil",
        matchSort: "desc",
      },
      3,
      25,
    );

    expect(apiMock.get).toHaveBeenCalledWith("/jobs/search", {
      params: {
        keywords: "React",
        type: "Remoto",
        level: "Pleno",
        continent: "América do Sul",
        country: "Brasil",
        matchSort: "desc",
        page: 3,
        limit: 25,
      },
    });
    expect(result.pagination).toEqual({
      total: 2,
      page: 3,
      limit: 25,
      totalPages: 4,
      hasNext: true,
      hasPrev: true,
    });
    expect(result.jobs[0]).toMatchObject({
      jobTitle: "Frontend Developer",
      company: "ACME",
      source: "LinkedIn",
      tags: ["React", "TypeScript"],
      posted: "25/07/2026",
      rawPayload: expect.objectContaining({
        description: "Detalhe",
        matchSource: "backend_profile",
      }),
      matchScore: 91,
    });
  });

  it("mapeia notificações e mensagens reais do backend", async () => {
    apiMock.get.mockResolvedValueOnce({
      data: {
        unreadCount: 2,
        notifications: [
          {
            id: "notification-1",
            channel: "notification",
            type: "high_match",
            title: "Vaga com alto match encontrada",
            message: "React Developer tem 91% de compatibilidade.",
            readAt: null,
            createdAt: new Date().toISOString(),
          },
        ],
      },
    });
    apiMock.get.mockResolvedValueOnce({
      data: {
        unreadCount: 1,
        notifications: [
          {
            id: "message-1",
            channel: "message",
            type: "mentor",
            title: "Mentoria",
            message: "Sua sessão foi confirmada.",
            readAt: null,
            createdAt: new Date().toISOString(),
          },
        ],
      },
    });

    const notifications = await getNotificationFeed("notification");
    const messages = await getNotificationFeed("message");
    await markNotificationsRead("notification");
    await clearDashboardNotifications("notification");

    expect(notifications).toMatchObject({
      unreadCount: 2,
      notifications: [
        {
          id: "notification-1",
          type: "match",
          text: "React Developer tem 91% de compatibilidade.",
        },
      ],
    });
    expect(messages).toMatchObject({
      unreadCount: 1,
      messages: [
        {
          id: "message-1",
          sender: "Mentoria",
        },
      ],
    });
    expect(apiMock.patch).toHaveBeenCalledWith(
      "/notifications/read-all",
      null,
      { params: { channel: "notification" } },
    );
    expect(apiMock.delete).toHaveBeenCalledWith("/notifications", {
      params: { channel: "notification" },
    });
  });

it("marca uma única notificação como lida pela rota correta", async () => {
  apiMock.patch.mockResolvedValue({ data: {} });

  await markSingleNotificationRead("notification-42");

  expect(apiMock.patch).toHaveBeenCalledWith(
    "/notifications/notification-42/read",
  );
});

it("mapeia entityId para jobId apenas quando entityType é job, e readAt para isRead", async () => {
  apiMock.get.mockResolvedValueOnce({
    data: {
      unreadCount: 2,
      notifications: [
        {
          id: "job-linked",
          channel: "notification",
          type: "job_applied",
          title: "Candidatura enviada",
          message: "Sua candidatura foi registrada.",
          readAt: null,
          createdAt: new Date().toISOString(),
          entityType: "job",
          entityId: "job-99",
        },
        {
          id: "mentor-linked",
          channel: "notification",
          type: "mentor_message",
          title: "Mentoria",
          message: "Nova mensagem do mentor.",
          readAt: "2026-08-01T10:00:00.000Z",
          createdAt: new Date().toISOString(),
          entityType: "mentor",
          entityId: "mentor-5",
        },
      ],
    },
  });

  const result = await getNotificationFeed("notification");

  expect(result.notifications).toMatchObject([
    { id: "job-linked", jobId: "job-99", isRead: false },
    { id: "mentor-linked", jobId: undefined, isRead: true },
  ]);
});

  it("normaliza tipos, origens e datas do feed de notificações", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-21T12:00:00.000Z"));
    apiMock.get.mockResolvedValueOnce({
      data: {
        unreadCount: 3,
        notifications: [
          {
            id: "status-1",
            channel: "notification",
            type: "job_status_changed",
            title: "Status atualizado",
            message: "A vaga mudou de etapa.",
            readAt: null,
            createdAt: "2026-07-21T11:30:00.000Z",
          },
          {
            id: "info-1",
            channel: "notification",
            type: "unknown",
            title: "Sistema",
            message: "Resumo disponível.",
            readAt: null,
            createdAt: "2026-07-20T12:00:00.000Z",
          },
          {
            id: "hours-1",
            channel: "notification",
            type: "unknown",
            title: "Sistema",
            message: "Atualizado há poucas horas.",
            readAt: null,
            createdAt: "2026-07-21T09:00:00.000Z",
          },
          {
            id: "days-1",
            channel: "notification",
            type: "unknown",
            title: "Sistema",
            message: "Atualizado há alguns dias.",
            readAt: null,
            createdAt: "2026-07-18T12:00:00.000Z",
          },
          {
            id: "old-1",
            channel: "notification",
            type: "unknown",
            title: "Sistema",
            message: "Atualização antiga.",
            readAt: null,
            createdAt: "2026-07-10T12:00:00.000Z",
          },
          {
            id: "invalid-date",
            channel: "notification",
            type: "unknown",
            title: "Sistema",
            message: "Data inválida.",
            readAt: null,
            createdAt: "data-invalida",
          },
        ],
      },
    });

    const result = await getNotificationFeed("notification");

    expect(result.notifications).toMatchObject([
      { id: "status-1", type: "success", date: "Há 30 min" },
      { id: "info-1", type: "info", date: "Há 1 dia" },
      { id: "hours-1", type: "info", date: "Há 3 h" },
      { id: "days-1", type: "info", date: "Há 3 dias" },
      { id: "old-1", type: "info", date: "10/07/2026" },
      { id: "invalid-date", type: "info", date: "Agora" },
    ]);

    vi.useRealTimers();
  });

  it("classifica mensagens de recrutador e sistema", async () => {
    apiMock.get.mockResolvedValueOnce({
      data: {
        unreadCount: 2,
        notifications: [
          {
            id: "recruiter-1",
            channel: "message",
            type: "recruiter_reply",
            title: "RH TechCorp",
            message: "Podemos conversar hoje?",
            readAt: null,
            createdAt: new Date().toISOString(),
          },
          {
            id: "system-1",
            channel: "message",
            type: "system",
            title: "Candidate",
            message: "Seu resumo semanal está pronto.",
            readAt: null,
            createdAt: new Date().toISOString(),
          },
        ],
      },
    });

    const result = await getNotificationFeed("message");

    expect(result.messages).toMatchObject([
      { id: "recruiter-1", origin: "recruiter" },
      { id: "system-1", origin: "system" },
    ]);
  });

  it("mapeia vagas salvas e preserva dados auxiliares", async () => {
    apiMock.get.mockResolvedValue({
      data: [
        {
          id: "saved-1",
          jobLink: "https://example.com/job",
          jobTitle: "Backend Developer",
          company: "Globex",
          location: "Portugal",
          source: "Gupy",
          keyword: "Node.js",
          status: "applied",
          notes: "nota",
          createdAt: "2026-07-10T12:00:00.000Z",
        },
      ],
    });

    const jobs = await getDashboardSavedJobs();

    expect(jobs[0]).toMatchObject({
      id: "saved-1",
      jobTitle: "Backend Developer",
      company: "Globex",
      location: "Portugal",
      source: "Gupy",
      status: "applied",
      notes: "nota",
    });
  });

  it("busca e tipa os eventos da vaga salva", async () => {
    apiMock.get.mockResolvedValue({
      data: [
        {
          id: "event-1",
          type: "status_changed",
          fromStatus: "saved",
          toStatus: "applied",
          metadata: { source: "dashboard" },
          createdAt: "2026-07-10T12:00:00.000Z",
        },
      ],
    });

    const events = await getDashboardSavedJobEvents("saved-1");

    expect(apiMock.get).toHaveBeenCalledWith("/saved-jobs/saved-1/events");
    expect(events).toEqual([
      expect.objectContaining({
        fromStatus: "saved",
        toStatus: "applied",
        metadata: { source: "dashboard" },
      }),
    ]);
  });

  it("cria, atualiza e remove vagas salvas", async () => {
    apiMock.post.mockResolvedValue({
      data: {
        id: "saved-1",
        jobLink: "https://example.com/job",
        jobTitle: "Frontend Developer",
        company: "ACME",
        location: "Remoto",
        source: "LinkedIn",
        keyword: "React",
        status: "saved",
        notes: "",
      },
    });
    apiMock.patch.mockResolvedValue({
      data: {
        id: "saved-1",
        jobLink: "https://example.com/job",
        jobTitle: "Frontend Developer",
        company: "ACME",
        location: "Remoto",
        source: "LinkedIn",
        keyword: "React",
        status: "applied",
        notes: "Atualizada",
      },
    });

    const created = await createDashboardSavedJob({
      id: "job-1",
      jobTitle: "Frontend Developer",
      company: "ACME",
      location: "Remoto",
      salary: "A combinar",
      type: "Remoto",
      level: "Pleno",
      matchScore: 90,
      tags: ["React"],
      posted: "Hoje",
      status: "saved",
      jobLink: "https://example.com/job",
      source: "LinkedIn",
      notes: "",
    });
    const updated = await updateDashboardSavedJob("saved-1", {
      status: "applied",
      notes: "Atualizada",
    });

    expect(apiMock.post).toHaveBeenCalledWith(
      "/saved-jobs",
      expect.objectContaining({
        jobTitle: "Frontend Developer",
        company: "ACME",
        keyword: "React",
      }),
    );
    expect(apiMock.patch).toHaveBeenCalledWith(
      "/saved-jobs/saved-1",
      expect.objectContaining({
        status: "applied",
        appliedAt: expect.any(String),
        notes: "Atualizada",
      }),
    );
    expect(created.jobTitle).toBe("Frontend Developer");
    expect(updated.status).toBe("applied");

    await deleteDashboardSavedJob("saved-1");
    expect(apiMock.delete).toHaveBeenCalledWith("/saved-jobs/saved-1");
  });

  it("normaliza perfis e preferencias do usuário", async () => {
    apiMock.get
      .mockResolvedValueOnce({
        data: {
          firstName: "Maria",
          lastName: "Clara",
          displayName: "Maria Clara",
          username: "mariaclara",
          email: "maria@exemplo.com",
          avatarUrl: "https://cdn.example.com/avatar.png",
          phone: "(11) 99999-9999",
          technologies: ["React"],
          technologyExperiences: [{ name: "React", years: 3 }],
          level: "Pleno",
        },
      })
      .mockResolvedValueOnce({
        data: {
          keywords: ["React"],
          searchLocation: "Lisboa",
          remoteOnly: true,
          jobTypes: ["Remoto"],
          emailNotifications: false,
          careerChecklist: [],
        },
      });

    const profile = await getUserProfile();
    const preferences = await getUserPreferences();

    expect(profile.avatarUrl).toBe("https://cdn.example.com/avatar.png");
    expect(preferences.searchLocation).toBe("Lisboa");
    expect(
      toUserProfile({
        displayName: "",
        email: "joana@exemplo.com",
        avatarUrl: null,
        technologies: [],
      }),
    ).toMatchObject({
      displayName: "joana",
      avatarUrl: "",
    });
    expect(
      toSearchPreferences({
        keywords: [],
        searchLocation: "",
        remoteOnly: null,
      }),
    ).toMatchObject({
      keywords: expect.arrayContaining(["React", "Frontend", "Fullstack"]),
    });
  });

  it("atualiza perfil e preferencias no backend", async () => {
    apiMock.patch
      .mockResolvedValueOnce({
        data: {
          displayName: "Maria Clara",
          firstName: "Maria",
          lastName: "Clara",
          username: "mariaclara",
          email: "maria@exemplo.com",
          avatarUrl: "https://cdn.example.com/avatar.png",
          phone: "(11) 99999-9999",
          technologies: ["React"],
          technologyExperiences: [{ name: "React", years: 3 }],
          level: "Pleno",
        },
      })
      .mockResolvedValueOnce({
        data: {
          keywords: ["React"],
          searchLocation: "Brasil",
          remoteOnly: true,
          jobTypes: ["Remoto"],
          emailNotifications: true,
          careerChecklist: [],
        },
      });

    const updatedProfile = await updateUserProfile({
      firstName: "Maria",
      lastName: "Clara",
      displayName: "Maria Clara",
      username: "mariaclara",
      email: "maria@exemplo.com",
      avatarUrl: "https://cdn.example.com/avatar.png",
      phone: "(11) 99999-9999",
      level: "Pleno",
      technologies: ["React"],
      technologyExperiences: [{ name: "React", years: 3 }],
    });
    const updatedPreferences = await updateUserPreferences({
      keywords: ["React"],
      searchLocation: "Brasil",
      remoteOnly: true,
      jobTypes: ["Remoto"],
      emailNotifications: true,
      careerChecklist: [],
    });

    expect(apiMock.patch).toHaveBeenCalledWith(
      "/users/profile",
      expect.objectContaining({
        avatarUrl: "https://cdn.example.com/avatar.png",
        technologyExperiences: [{ name: "React", years: 3 }],
      }),
    );
    expect(apiMock.patch).toHaveBeenCalledWith(
      "/users/preferences",
      expect.objectContaining({
        searchLocation: "Brasil",
        jobTypes: ["Remoto"],
        careerChecklist: [],
      }),
    );
    expect(updatedProfile.displayName).toBe("Maria Clara");
    expect(updatedPreferences.remoteOnly).toBe(true);
  });

  it("faz fallback de url inválida ao mapear vaga recomendada", () => {
    const recommended = toRecommendedJob(
      {
        title: "Dev",
        company: "ACME",
        location: "Brasil",
        source: "LinkedIn",
        url: "not-a-url",
      },
      0,
    );

    expect(recommended.jobLink).toContain("canddate.local/jobs/");
    expect(recommended.posted).toBe("Não informado");
    expect(recommended.rawPayload).toMatchObject({
      title: "Dev",
      company: "ACME",
    });
  });

  it("reconhece abreviações de senioridade ao mapear vaga recomendada", () => {
    expect(
      toRecommendedJob(
        {
          title: "Software Engineering Intern",
          company: "ACME",
          location: "Brasil",
          source: "LinkedIn",
          url: "https://example.com/intern",
        },
        0,
      ).level,
    ).toBe("Estágio/Trainee");

    expect(
      toRecommendedJob(
        {
          title: "Jr Software Engineer",
          company: "ACME",
          location: "Brasil",
          source: "Adzuna",
          url: "https://example.com/jr",
        },
        0,
      ).level,
    ).toBe("Júnior");

    expect(
      toRecommendedJob(
        {
          title: "Sr Backend Engineer",
          company: "ACME",
          location: "Brasil",
          source: "LinkedIn",
          url: "https://example.com/sr",
        },
        1,
      ).level,
    ).toBe("Sênior");
  });

  it("cobre inferência de modelo e link inválido em vagas salvas", async () => {
    expect(
      toRecommendedJob(
        {
          title: "Dev Remoto",
          company: "ACME",
          location: "Anywhere",
          modality: "home office",
          source: "LinkedIn",
          url: "https://example.com/a",
        },
        1,
      ).type,
    ).toBe("Remoto");
    expect(
      toRecommendedJob(
        {
          title: "Dev Híbrido",
          company: "ACME",
          location: "São Paulo",
          modality: "hybrid",
          source: "LinkedIn",
          url: "https://example.com/b",
        },
        2,
      ).type,
    ).toBe("Híbrido");
    expect(
      toRecommendedJob(
        {
          title: "Dev Presencial",
          company: "ACME",
          location: "São Paulo",
          source: "LinkedIn",
          url: "https://example.com/c",
        },
        3,
      ).type,
    ).toBe("Presencial");

    await expect(
      createDashboardSavedJob({
        jobTitle: "Frontend",
        company: "ACME",
        location: "Remoto",
        salary: "A combinar",
        type: "Remoto",
        level: "Pleno",
        tags: "React",
        source: "LinkedIn",
        jobLink: "link-invalido",
        notes: "",
      }),
    ).rejects.toThrow(/link válido/i);
  });

  it("não injeta appliedAt quando status não é aplicado", async () => {
    apiMock.patch.mockResolvedValue({
      data: {
        id: "saved-1",
        jobLink: "https://example.com/job",
        jobTitle: "Frontend Developer",
        company: "ACME",
        location: "Remoto",
        source: "LinkedIn",
        keyword: "React",
        status: "rejected",
        notes: "",
      },
    });

    await updateDashboardSavedJob("saved-1", {
      status: "rejected",
    });

    expect(apiMock.patch).toHaveBeenCalledWith(
      "/saved-jobs/saved-1",
      expect.not.objectContaining({
        appliedAt: expect.any(String),
      }),
    );
  });
});
