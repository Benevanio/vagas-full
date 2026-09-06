import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/domains/new_dashboard/infrastructure/dashboardJobsApi", () => ({
  getDashboardSavedJobEvents: vi.fn().mockResolvedValue([]),
}));

import { JobDetailModal } from "@/domains/new_dashboard/components/jobs/JobDetailModal";
import type { Job } from "@/domains/new_dashboard/types";

function job(overrides: Partial<Job> = {}): Job {
  return {
    id: "job-1",
    jobTitle: "Frontend Developer",
    company: "ACME",
    location: "São Paulo, SP",
    salary: "A combinar",
    type: "Remoto",
    level: "Pleno",
    matchScore: 88,
    tags: ["React"],
    posted: "Hoje",
    status: "saved",
    jobLink: "https://example.com/job-1",
    source: "LinkedIn",
    notes: "",
    ...overrides,
  };
}

const noop = () => {};

describe("JobDetailModal — informações principais (JDM-01, JDM-02)", () => {
  it("mostra local, modalidade, nível, fonte e salário em tiles rotulados", () => {
    render(
      <JobDetailModal
        job={job()}
        onClose={noop}
        onStatusChange={noop}
        onNotesChange={noop}
      />,
    );

    expect(screen.getByText("Local")).toBeInTheDocument();
    expect(screen.getByText("São Paulo, SP")).toBeInTheDocument();
    expect(screen.getByText("Modalidade")).toBeInTheDocument();
    expect(screen.getByText("Remoto")).toBeInTheDocument(); // valor de modalidade
    expect(screen.getByText("Nível")).toBeInTheDocument();
    expect(screen.getByText("Pleno")).toBeInTheDocument();
    expect(screen.getByText("Fonte")).toBeInTheDocument();
    expect(screen.getByText("LinkedIn")).toBeInTheDocument();
    expect(screen.getByText("Salário")).toBeInTheDocument();
    expect(screen.getByText("A combinar")).toBeInTheDocument();
    expect(screen.getByText("Match")).toBeInTheDocument();
    expect(screen.getByText("88%")).toBeInTheDocument();
  });

  it("empresa continua no subtítulo do modal e status continua com indicador + controle (sem tile novo)", () => {
    render(
      <JobDetailModal
        job={job({ company: "Globex", status: "interviewing" })}
        onClose={noop}
        onStatusChange={noop}
        onNotesChange={noop}
      />,
    );

    expect(screen.getByText("Globex")).toBeInTheDocument();
    // "Em entrevista" aparece no pill de status E como option selecionada do <select>.
    expect(screen.getAllByText("Em entrevista").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByLabelText(/^status$/i)).toHaveValue("interviewing");
  });

  it("mostra 'Não informado' quando um campo principal está ausente do payload bruto, sem quebrar o tile", () => {
    render(
      <JobDetailModal
        job={job({ salary: "Não informado" })}
        onClose={noop}
        onStatusChange={noop}
        onNotesChange={noop}
      />,
    );

    expect(screen.getByText("Salário")).toBeInTheDocument();
    expect(screen.getByText("Não informado")).toBeInTheDocument();
  });
});

describe("JobDetailModal — feedback de salvamento das notas (JDM-07)", () => {
  it("mostra um texto indicando que as notas são salvas ao fechar o modal", () => {
    render(
      <JobDetailModal
        job={job()}
        onClose={noop}
        onStatusChange={noop}
        onNotesChange={noop}
      />,
    );

    expect(
      screen.getByText(/salvas automaticamente ao fechar/i),
    ).toBeInTheDocument();
  });
});

describe("JobDetailModal — detalhes adicionais sem duplicar dado (JDM-04, JDM-05, JDM-06)", () => {
  it("omite do bloco de detalhes adicionais campos já representados nos tiles principais", () => {
    render(
      <JobDetailModal
        job={job({
          rawPayload: {
            location: "São Paulo, SP",
            salary: "A combinar",
            company: "ACME",
            modality: "Remoto",
            postedAt: "2026-01-10",
          },
        })}
        onClose={noop}
        onStatusChange={noop}
        onNotesChange={noop}
      />,
    );

    expect(screen.getByText("Detalhes adicionais")).toBeInTheDocument();
    expect(screen.getByText("Publicado em")).toBeInTheDocument();
    expect(screen.getByText("2026-01-10")).toBeInTheDocument();
    // "Local"/"Modalidade" continuam existindo (como tiles), mas sem um 2º
    // bloco "Local"/"Modalidade" vindo do payload bruto.
    expect(screen.getAllByText("Local")).toHaveLength(1);
    expect(screen.getAllByText("Modalidade")).toHaveLength(1);
  });

  it("quando não sobra nenhum campo após o filtro, o bloco de detalhes adicionais não renderiza", () => {
    render(
      <JobDetailModal
        job={job({
          rawPayload: {
            location: "São Paulo, SP",
            salary: "A combinar",
            company: "ACME",
            modality: "Remoto",
          },
        })}
        onClose={noop}
        onStatusChange={noop}
        onNotesChange={noop}
      />,
    );

    expect(screen.queryByText("Detalhes adicionais")).not.toBeInTheDocument();
  });

  it("sem rawPayload, o bloco de detalhes adicionais não renderiza", () => {
    render(
      <JobDetailModal
        job={job()}
        onClose={noop}
        onStatusChange={noop}
        onNotesChange={noop}
      />,
    );

    expect(screen.queryByText("Detalhes adicionais")).not.toBeInTheDocument();
  });
});

describe("JobDetailModal — link principal (JDM-03, regressão)", () => {
  it("o botão 'Abrir vaga' aponta para job.jobLink e abre em nova aba", () => {
    render(
      <JobDetailModal
        job={job({ jobLink: "https://example.com/vaga-especifica" })}
        onClose={noop}
        onStatusChange={noop}
        onNotesChange={noop}
      />,
    );

    const link = screen.getByRole("link", { name: /abrir vaga/i });
    expect(link).toHaveAttribute("href", "https://example.com/vaga-especifica");
    expect(link).toHaveAttribute("target", "_blank");
  });
});
