import { ExternalLink } from "lucide-react";
import { useEffect, useState } from "react";
import { jobStatusClasses, jobStatuses } from "../../constants";
import type { Job, JobStatus, JobTimelineEvent } from "../../types";
import { getDashboardSavedJobEvents } from "../../infrastructure/dashboardJobsApi";
import { Modal } from "../shared/Modal";
import { FormattedJobDescription } from "./FormattedJobDescription";

interface JobDetailModalProps {
  job: Job;
  onClose: () => void;
  onStatusChange: (jobId: string, status: JobStatus) => void;
  onNotesChange: (jobId: string, notes: string) => void;
  isTracked?: boolean;
  timelineVersion?: number;
}

const payloadLabels: Record<string, string> = {
  id: "ID",
  title: "Título",
  company: "Empresa",
  location: "Local",
  url: "URL",
  salary: "Salário",
  modality: "Modalidade",
  description: "Descrição",
  postedAt: "Publicado em",
  source: "Fonte",
  sources: "Fontes",
  keyword: "Keyword",
  keywords: "Keywords",
};

function payloadValueToText(value: unknown): string {
  if (value === null || value === undefined || value === "") {
    return "Não informado";
  }
  if (Array.isArray(value)) {
    return value.length > 0 ? value.map(payloadValueToText).join(", ") : "[]";
  }
  if (typeof value === "object") {
    return JSON.stringify(value, null, 2);
  }
  return String(value);
}

function isExternalUrl(value: string) {
  return /^https?:\/\//i.test(value);
}

function formatTimelineDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Data não informada";

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

function orderTimeline(events: JobTimelineEvent[]) {
  return [...events].sort(
    (first, second) =>
      new Date(first.createdAt).getTime() - new Date(second.createdAt).getTime(),
  );
}

function timelineMetadataText(metadata: Record<string, unknown> | null) {
  if (!metadata) return "";

  return Object.entries(metadata)
    .map(([key, value]) => `${key}: ${payloadValueToText(value)}`)
    .join(" • ");
}

/** Tile rotulado para uma informação principal (local, modalidade, nível, fonte, salário, match). */
function InfoTile({
  label,
  value,
  valueClassName = "",
}: {
  label: string;
  value: string;
  valueClassName?: string;
}) {
  return (
    <div className="rounded-md border border-border bg-background p-3">
      <span className="text-xs font-bold uppercase text-muted-foreground">{label}</span>
      <p className={`mt-1 text-sm font-semibold ${valueClassName}`}>{value}</p>
    </div>
  );
}

export function JobDetailModal({
  job,
  onClose,
  onStatusChange,
  onNotesChange,
  isTracked = false,
  timelineVersion = 0,
}: JobDetailModalProps) {
  const [timeline, setTimeline] = useState<JobTimelineEvent[]>([]);
  const [isTimelineLoading, setIsTimelineLoading] = useState(false);
  const [timelineError, setTimelineError] = useState(false);

  useEffect(() => {
    if (!isTracked) return;

    let active = true;
    void Promise.resolve()
      .then(() => {
        if (!active) return null;
        setIsTimelineLoading(true);
        setTimelineError(false);
        return getDashboardSavedJobEvents(job.id);
      })
      .then((events) => {
        if (active && events) setTimeline(orderTimeline(events));
      })
      .catch(() => {
        if (active) setTimelineError(true);
      })
      .finally(() => {
        if (active) setIsTimelineLoading(false);
      });

    return () => {
      active = false;
    };
  }, [isTracked, job.id, timelineVersion]);

  const payloadEntries = Object.entries(job.rawPayload ?? {}).filter(
    ([key]) => key !== "description",
  );
  const description = payloadValueToText(job.rawPayload?.description);
  const hasDescription = description !== "Não informado";

  return (
    <Modal
      title={job.jobTitle}
      subtitle={job.company}
      onClose={onClose}
      footer={
        <>
          <a
            href={job.jobLink}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-10 items-center gap-2 rounded-md border border-border px-4 text-sm font-bold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <ExternalLink className="h-4 w-4" />
            Abrir vaga
          </a>
          <button
            type="button"
            onClick={onClose}
            className="h-10 rounded-md bg-primary px-4 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Concluir
          </button>
        </>
      }
    >
      <div className="space-y-5">
        <div>
          <span
            className={`rounded-full border px-3 py-1 text-xs font-bold ${jobStatusClasses[job.status]}`}
          >
            {jobStatuses[job.status]}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          <InfoTile label="Local" value={job.location} />
          <InfoTile label="Modalidade" value={job.type} />
          <InfoTile label="Nível" value={job.level} />
          <InfoTile label="Fonte" value={job.source} />
          <InfoTile label="Salário" value={job.salary} />
          <InfoTile
            label="Match"
            value={`${job.matchScore}%`}
            valueClassName="text-emerald-600 dark:text-emerald-400"
          />
        </div>

        <div className="space-y-2">
          <span className="text-xs font-bold uppercase text-muted-foreground">Tecnologias</span>
          <div className="flex flex-wrap gap-2">
            {job.tags.map((tag) => (
              <span
                key={tag}
                className="rounded border border-border bg-background px-2 py-1 text-xs font-semibold"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>

        {hasDescription ? (
          <div className="space-y-2">
            <span className="text-xs font-bold uppercase text-muted-foreground">
              Descrição
            </span>
            <FormattedJobDescription description={description} />
          </div>
        ) : null}

        {payloadEntries.length > 0 ? (
          <div className="space-y-2">
            <span className="text-xs font-bold uppercase text-muted-foreground">
              Payload da vaga
            </span>
            <div className="grid gap-2">
              {payloadEntries.map(([key, value]) => {
                const text = payloadValueToText(value);

                return (
                  <div
                    key={key}
                    className="rounded-md border border-border bg-background p-3"
                  >
                    <span className="block text-xs font-bold uppercase text-muted-foreground">
                      {payloadLabels[key] ?? key}
                    </span>
                    {isExternalUrl(text) ? (
                      <a
                        href={text}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-1 block break-all text-sm font-semibold text-primary hover:underline"
                      >
                        {text}
                      </a>
                    ) : (
                      <p className="mt-1 whitespace-pre-wrap break-words text-sm font-semibold">
                        {text}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}

        <label className="space-y-2 block">
          <span className="text-xs font-bold uppercase text-muted-foreground">Status</span>
          <select
            value={job.status}
            onChange={(event) => onStatusChange(job.id, event.target.value as JobStatus)}
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:border-ring"
          >
            {Object.entries(jobStatuses).map(([status, label]) => (
              <option key={status} value={status}>
                {label}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-2 block">
          <span className="text-xs font-bold uppercase text-muted-foreground">Notas</span>
          <textarea
            value={job.notes}
            onChange={(event) => onNotesChange(job.id, event.target.value)}
            className="min-h-28 w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring"
          />
        </label>

        {isTracked ? (
          <section className="space-y-2" aria-labelledby="timeline-title">
            <h3
              id="timeline-title"
              className="text-xs font-bold uppercase text-muted-foreground"
            >
              Histórico da candidatura
            </h3>
            {isTimelineLoading ? (
              <p className="text-sm text-muted-foreground">Carregando histórico...</p>
            ) : null}
            {timelineError ? (
              <p className="text-sm text-destructive">
                Não foi possível carregar o histórico.
              </p>
            ) : null}
            {!isTimelineLoading && !timelineError && timeline.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nenhuma mudança de status registrada.
              </p>
            ) : null}
            {!isTimelineLoading && !timelineError && timeline.length > 0 ? (
              <ol className="space-y-2 border-l border-border pl-4">
                {timeline.map((event) => (
                  <li key={event.id} className="relative text-sm">
                    <span className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full bg-primary" />
                    <p className="font-semibold">
                      Status alterado de {jobStatuses[event.fromStatus]} para{" "}
                      {jobStatuses[event.toStatus]}
                    </p>
                    <time className="text-xs text-muted-foreground" dateTime={event.createdAt}>
                      {formatTimelineDate(event.createdAt)}
                    </time>
                    {timelineMetadataText(event.metadata) ? (
                      <p className="text-xs text-muted-foreground">
                        {timelineMetadataText(event.metadata)}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ol>
            ) : null}
          </section>
        ) : null}
      </div>
    </Modal>
  );
}
