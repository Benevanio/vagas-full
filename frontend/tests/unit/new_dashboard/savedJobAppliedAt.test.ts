import { describe, expect, it, vi } from "vitest";

const apiMock = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn() }));
vi.mock("@/shared/lib/apiClient", () => ({ api: apiMock }));

import {
  createDashboardSavedJob,
  toDashboardSavedJob,
} from "@/domains/new_dashboard/infrastructure/dashboardJobsApi";

describe("toDashboardSavedJob — appliedAt (PAV-22)", () => {
  const base = {
    id: "job-1",
    jobLink: "https://example.com/vaga",
    jobTitle: "Dev",
    company: "ACME",
    location: "Remoto",
    source: "Manual",
    keyword: null,
    status: "applied" as const,
    notes: null,
  };

  it("leva o appliedAt da API para o modelo da UI", () => {
    const job = toDashboardSavedJob({ ...base, appliedAt: "2026-01-15" });

    expect(job.appliedAt).toBe("2026-01-15");
  });

  it("sem appliedAt, o campo fica indefinido em vez de quebrar", () => {
    const job = toDashboardSavedJob({ ...base, appliedAt: null });

    expect(job.appliedAt).toBeUndefined();
  });
});

describe("savedJobPayload — appliedAt como data civil (PAV-22)", () => {
  it("ancora a data em UTC, sem deixar o fuso local mudar o dia", async () => {
    apiMock.post.mockResolvedValue({
      data: {
        id: "job-1",
        jobLink: "https://example.com/vaga",
        jobTitle: "Dev",
        company: "ACME",
        location: "Remoto",
        source: "Manual",
        keyword: null,
        status: "applied",
        notes: null,
      },
    });

    await createDashboardSavedJob(
      {
        jobTitle: "Dev",
        company: "ACME",
        location: "Remoto",
        salary: "A combinar",
        type: "Remoto",
        level: "Pleno",
        tags: "React",
        source: "Manual",
        jobLink: "https://example.com/vaga",
        notes: "",
        appliedAt: "2026-01-15",
      } as never,
      "applied",
    );

    const payload = apiMock.post.mock.calls[0][1];
    // Interpretar "2026-01-15" no fuso local produz um instante diferente da
    // meia-noite UTC em qualquer fuso != 0 — e em fusos positivos o dia civil
    // chega a mudar ao serializar. Aqui exigimos exatamente meia-noite UTC.
    expect(payload.appliedAt.getTime()).toBe(Date.UTC(2026, 0, 15));
    expect(payload.appliedAt.toISOString().slice(0, 10)).toBe("2026-01-15");
  });
});
