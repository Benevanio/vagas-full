import {
  createJobFromForm,
  getInitials,
  splitTags,
} from "@/domains/new_dashboard/utils/helpers";
import {
  getContinentFromLocation,
  matchesContinent,
  matchesCountry,
  matchesLocationFilters,
} from "@/domains/new_dashboard/utils/locationFilters";
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("new_dashboard utils", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("splits tags and trims empty values", () => {
    expect(splitTags("React, TypeScript, , Node.js")).toEqual([
      "React",
      "TypeScript",
      "Node.js",
    ]);
  });

  it("creates a normalized job from form data", () => {
    vi.stubGlobal("crypto", { randomUUID: () => "job-123" });
    vi.spyOn(Math, "random").mockReturnValue(0);

    const job = createJobFromForm({
      jobTitle: "  Frontend Developer  ",
      company: "  ACME  ",
      location: "  ",
      salary: "  ",
      type: "Remoto",
      level: "Pleno",
      tags: "React, TypeScript",
      source: "  ",
      jobLink: "  ",
      notes: "  nota  ",
    });

    expect(job).toMatchObject({
      id: "job-123",
      jobTitle: "Frontend Developer",
      company: "ACME",
      location: "Remoto",
      salary: "A combinar",
      type: "Remoto",
      level: "Pleno",
      matchScore: 70,
      tags: ["React", "TypeScript"],
      posted: "Agora mesmo",
      status: "saved",
      // Sem link informado: string vazia (falsy), não "#" — senão o detalhe
      // oferece "Abrir vaga" apontando pra lugar nenhum.
      jobLink: "",
      source: "Manual",
      notes: "nota",
    });
  });

  it("derives initials from a display name", () => {
    expect(getInitials("Maria Clara")).toBe("MC");
    expect(getInitials("Ana")).toBe("A");
  });

  it("detects filters by continent and country", () => {
    expect(getContinentFromLocation("São Paulo, Brasil")).toBe(
      "América do Sul",
    );
    expect(getContinentFromLocation("Remote / Worldwide")).toBe(
      "Global / Remoto",
    );
    expect(matchesCountry("São Paulo, Brasil", "Brasil")).toBe(true);
    expect(matchesCountry("Lisboa, Portugal", "Brasil")).toBe(false);
    expect(matchesContinent("Lisboa, Portugal", "Europa")).toBe(true);
    expect(matchesContinent("Lisboa, Portugal", "América do Sul")).toBe(
      false,
    );
    expect(
      matchesLocationFilters(
        { location: "Berlin, Alemania" },
        "Europa",
        "Todos",
      ),
    ).toBe(true);
  });
});
