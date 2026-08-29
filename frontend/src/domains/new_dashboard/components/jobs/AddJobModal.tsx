import { useState } from "react";
import { jobLevels, jobTypes } from "../../constants";
import type { NewJob } from "../../types";
import { Modal } from "../shared/Modal";

const initialForm: NewJob = {
  jobTitle: "",
  company: "",
  location: "",
  salary: "",
  type: "Remoto",
  level: "Pleno",
  tags: "",
  source: "Manual",
  jobLink: "",
  notes: "",
  appliedAt: "",
};

interface AddJobModalProps {
  onClose: () => void;
  onAddJob: (job: NewJob) => void;
}

export function AddJobModal({ onClose, onAddJob }: AddJobModalProps) {
  const [form, setForm] = useState<NewJob>(initialForm);
  const [error, setError] = useState("");

  const updateField = <T extends keyof NewJob>(field: T, value: NewJob[T]) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!form.jobTitle.trim() || !form.company.trim()) {
      setError("Informe pelo menos o cargo e a empresa.");
      return;
    }

    onAddJob(form);
    onClose();
  };

  return (
    <Modal
      title="Adicionar vaga"
      subtitle="Cadastre uma oportunidade que você encontrou fora da busca automática."
      onClose={onClose}
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="h-10 rounded-md border border-border px-4 text-sm font-bold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            Cancelar
          </button>
          <button
            type="submit"
            form="add-job-form"
            className="h-10 rounded-md bg-primary px-4 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Salvar vaga
          </button>
        </>
      }
    >
      <form id="add-job-form" onSubmit={handleSubmit} className="space-y-4">
        {error ? (
          <p className="rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm font-semibold text-rose-600 dark:text-rose-300">
            {error}
          </p>
        ) : null}

        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-1.5">
            <span className="text-xs font-bold uppercase text-muted-foreground">Cargo</span>
            <input
              value={form.jobTitle}
              onChange={(event) => updateField("jobTitle", event.target.value)}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:border-ring"
              placeholder="Desenvolvedor Frontend"
            />
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-bold uppercase text-muted-foreground">Data da candidatura</span>
            <input type="date" value={form.appliedAt ?? ""} onChange={(event) => updateField("appliedAt", event.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:border-ring" />
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-bold uppercase text-muted-foreground">Empresa</span>
            <input
              value={form.company}
              onChange={(event) => updateField("company", event.target.value)}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:border-ring"
              placeholder="Nome da empresa"
            />
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-bold uppercase text-muted-foreground">Local</span>
            <input
              value={form.location}
              onChange={(event) => updateField("location", event.target.value)}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:border-ring"
              placeholder="Remoto, São Paulo..."
            />
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-bold uppercase text-muted-foreground">Salário</span>
            <input
              value={form.salary}
              onChange={(event) => updateField("salary", event.target.value)}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:border-ring"
              placeholder="R$ 8.000 - R$ 10.000"
            />
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-bold uppercase text-muted-foreground">Modelo</span>
            <select
              value={form.type}
              onChange={(event) => updateField("type", event.target.value as NewJob["type"])}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:border-ring"
            >
              {jobTypes.map((type) => (
                <option key={type}>{type}</option>
              ))}
            </select>
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-bold uppercase text-muted-foreground">Nível</span>
            <select
              value={form.level}
              onChange={(event) => updateField("level", event.target.value as NewJob["level"])}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:border-ring"
            >
              {jobLevels.map((level) => (
                <option key={level}>{level}</option>
              ))}
            </select>
          </label>
        </div>

        <label className="space-y-1.5">
          <span className="text-xs font-bold uppercase text-muted-foreground">Tecnologias</span>
          <input
            value={form.tags}
            onChange={(event) => updateField("tags", event.target.value)}
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:border-ring"
            placeholder="React, TypeScript, Node.js"
          />
        </label>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-1.5">
            <span className="text-xs font-bold uppercase text-muted-foreground">Fonte</span>
            <input
              value={form.source}
              onChange={(event) => updateField("source", event.target.value)}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:border-ring"
              placeholder="LinkedIn, Gupy..."
            />
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-bold uppercase text-muted-foreground">Link (opcional)</span>
            <input
              value={form.jobLink}
              onChange={(event) => updateField("jobLink", event.target.value)}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:border-ring"
              placeholder="https://..."
            />
          </label>
        </div>

        <label className="space-y-1.5">
          <span className="text-xs font-bold uppercase text-muted-foreground">Notas</span>
          <textarea
            value={form.notes}
            onChange={(event) => updateField("notes", event.target.value)}
            className="min-h-24 w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring"
            placeholder="Próximos passos, contato, observações..."
          />
        </label>
      </form>
    </Modal>
  );
}
