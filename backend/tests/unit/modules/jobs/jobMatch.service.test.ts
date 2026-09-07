import { describe, expect, it } from "vitest";
import type { PublicUser } from "../../../../src/modules/users/users.mapper";
import {
  getUserMatchTechnologies,
  jobNotificationIdentity,
  scoreJobWithTechnologies,
} from "../../../../src/modules/jobs/jobMatch.service";

function basePublicUser(overrides: Partial<PublicUser> = {}): PublicUser {
  return {
    id: "user-1",
    firstName: null,
    lastName: null,
    displayName: null,
    username: "user",
    email: "user@example.com",
    emailVerified: false,
    avatarUrl: null,
    phone: null,
    cpf: null,
    technologies: null,
    technologyExperiences: null,
    level: null,
    role: "user",
    isBlocked: false,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    lastLoginAt: null,
    ...overrides,
  };
}

describe("jobMatch.service", () => {
  it("retorna lista vazia quando usuário não existe", () => {
    expect(getUserMatchTechnologies(null)).toEqual([]);
    expect(getUserMatchTechnologies(undefined)).toEqual([]);
  });

  it("extrai experiências de tecnologia do usuário (já decifradas)", () => {
    const user = basePublicUser({
      technologyExperiences: [
        { name: "TypeScript", years: 4 },
        { name: "Node.js", years: -1 },
        { name: "", years: 10 },
        null,
      ],
    });

    expect(getUserMatchTechnologies(user)).toEqual([
      { name: "TypeScript", years: 4 },
      { name: "Node.js", years: 0 },
    ]);
  });

  it("usa technologies como fallback quando não há experiências", () => {
    const user = basePublicUser({
      technologies: ["React", " ", "Node.js"],
    });

    expect(getUserMatchTechnologies(user)).toEqual([
      { name: "React", years: 1 },
      { name: "Node.js", years: 1 },
    ]);
  });

  it("mantém a vaga sem score quando o perfil não tem tecnologias", () => {
    const job = { title: "Backend Engineer" };

    expect(scoreJobWithTechnologies(job, [])).toBe(job);
  });

  it("calcula match com alias Node.js, pesos por anos e arrays do job", () => {
    const result = scoreJobWithTechnologies(
      {
        title: "Backend Engineer",
        keywords: ["nodejs", "api"],
        description: "APIs com TypeScript",
      },
      [
        { name: "Node.js", years: 3 },
        { name: "TypeScript", years: 2 },
        { name: "React", years: 1 },
      ],
    );

    expect(result.matchSource).toBe("backend_profile");
    expect(result.matchedTechnologies).toEqual(["Node.js", "TypeScript"]);
    expect(result.matchScore).toBeGreaterThanOrEqual(85);
  });

  it("retorna score base quando nenhuma tecnologia bate", () => {
    const result = scoreJobWithTechnologies(
      { title: "Product Manager" },
      [{ name: "Go", years: 5 }],
    );

    expect(result.matchScore).toBe(45);
    expect(result.matchedTechnologies).toEqual([]);
  });

  it("resolve identidade da notificação por url, jobLink ou id", () => {
    expect(jobNotificationIdentity({ url: " https://job.test/1 " })).toBe(
      "https://job.test/1",
    );
    expect(jobNotificationIdentity({ jobLink: "https://job.test/2" } as any)).toBe(
      "https://job.test/2",
    );
    expect(jobNotificationIdentity({ id: "job-3" })).toBe("job-3");
  });
});
