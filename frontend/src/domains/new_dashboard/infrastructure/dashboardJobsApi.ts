import { api } from "@/shared/lib/apiClient";
import { z } from "zod";
import type {
  Job,
  JobLevel,
  JobStatus,
  JobTimelineEvent,
  JobType,
  MatchSort,
  NewJob,
} from "../types";

const ApiSearchJobSchema = z
  .object({
    keyword: z.string().nullable().optional(),
    keywords: z.array(z.string()).nullable().optional(),
    title: z.string().nullable().optional(),
    company: z.string().nullable().optional(),
    source: z.string().nullable().optional(),
    sources: z.array(z.string()).nullable().optional(),
    location: z.string().nullable().optional(),
    modality: z.string().nullable().optional(),
    description: z.string().nullable().optional(),
    postedAt: z.string().nullable().optional(),
    url: z.string().nullable().optional(),
    matchScore: z.number().int().min(0).max(100).nullable().optional(),
    matchSource: z.string().nullable().optional(),
    matchedTechnologies: z.array(z.string()).nullable().optional(),
  })
  .passthrough();

const SearchJobsResponseSchema = z.object({
  total: z.number().nullable().optional(),
  page: z.number().nullable().optional(),
  limit: z.number().nullable().optional(),
  totalPages: z.number().nullable().optional(),
  hasNext: z.boolean().nullable().optional(),
  hasPrev: z.boolean().nullable().optional(),
  source: z.string().nullable().optional(),
  jobs: z.array(ApiSearchJobSchema).default([]),
});

const ApiSavedJobSchema = z.object({
  id: z.string(),
  jobLink: z.string(),
  jobTitle: z.string().nullable().optional(),
  company: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  source: z.string().nullable().optional(),
  keyword: z.string().nullable().optional(),
  status: z.enum(["saved", "applied", "interviewing", "rejected", "accepted"]),
  appliedAt: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

const ApiSavedJobEventSchema = z.object({
  id: z.string(),
  type: z.literal("status_changed"),
  fromStatus: z.enum(["saved", "applied", "interviewing", "rejected", "accepted"]),
  toStatus: z.enum(["saved", "applied", "interviewing", "rejected", "accepted"]),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
  createdAt: z.string(),
});
const ApiApplicationNoteSchema = z.object({
  id: z.string(),
  content: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

type ApiSearchJob = z.infer<typeof ApiSearchJobSchema>;
type ApiSavedJob = z.infer<typeof ApiSavedJobSchema>;
type ApiSavedJobEvent = z.infer<typeof ApiSavedJobEventSchema>;
type SearchJobsResponse = z.infer<typeof SearchJobsResponseSchema>;

export type SearchJobFilters = {
  level?: string;
  location?: string;
  continent?: string;
  country?: string;
  type?: string;
  model?: string;
  contract?: string;
  matchSort?: Exclude<MatchSort, "default">;
};

export type SearchJobsResult = {
  jobs: Job[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
};
export type ApplicationNote = z.infer<typeof ApiApplicationNoteSchema>;

function normalizeComparable(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function inferTypeFromText(value: string): JobType {
  const normalized = normalizeComparable(value);

  if (normalized.includes("hibrid") || normalized.includes("hybrid")) {
    return "Híbrido";
  }
  if (
    normalized.includes("remot") ||
    normalized.includes("home office") ||
    normalized.includes("teletrabalho") ||
    normalized.includes("anywhere") ||
    normalized.includes("worldwide")
  ) {
    return "Remoto";
  }
  if (
    normalized.includes("presencial") ||
    normalized.includes("onsite") ||
    normalized.includes("on site") ||
    normalized.includes("on-site") ||
    normalized.includes("in office") ||
    normalized.includes("escritorio")
  ) {
    return "Presencial";
  }

  return "Presencial";
}

function containsTokenOrPhrase(text: string, needle: string) {
  if (needle.includes(" ")) return text.includes(needle);
  return ` ${text} `.includes(` ${needle} `);
}

function containsAny(text: string, needles: string[]) {
  return needles.some((needle) => containsTokenOrPhrase(text, needle));
}

function inferLevel(title: string): JobLevel {
  const normalized = normalizeComparable(title).replace(/[^\p{L}\p{N}]+/gu, " ");

  if (
    containsAny(normalized, [
      "estagio",
      "estagiario",
      "intern",
      "internship",
      "trainee",
      "aprendiz",
    ])
  ) {
    return "Estágio/Trainee";
  }
  if (
    containsAny(normalized, [
      "senior",
      "sr",
      "especialista",
      "lead",
      "principal",
      "staff",
    ])
  ) {
    return "Sênior";
  }
  if (
    containsAny(normalized, [
      "junior",
      "jr",
      "entry level",
      "assistente",
    ])
  ) {
    return "Júnior";
  }
  return "Pleno";
}

function stableMatchScore(value: string) {
  const hash = [...value].reduce(
    (total, character) => total + character.charCodeAt(0),
    0,
  );
  return 70 + (hash % 26);
}

function formatPublicationDate(value: string | null | undefined) {
  const rawDate = value?.trim();
  if (!rawDate) return "Não informado";

  const isoDate = /^(\d{4})-(\d{2})-(\d{2})/.exec(rawDate);
  if (isoDate) {
    const [, year, month, day] = isoDate;
    return `${day}/${month}/${year}`;
  }

  const parsedDate = new Date(rawDate);
  if (Number.isNaN(parsedDate.getTime())) return "Não informado";

  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  }).format(parsedDate);
}

function compactTags(values: Array<string | null | undefined>) {
  return [
    ...new Set(
      values.filter((value): value is string => Boolean(value?.trim())),
    ),
  ]
    .map((value) => value.trim())
    .slice(0, 6);
}

function normalizeKeywords(keywords: string[]) {
  return [
    ...new Set(keywords.map((keyword) => keyword.trim()).filter(Boolean)),
  ];
}

function fallbackJobLink(job: ApiSearchJob, index: number) {
  const rawUrl = job.url?.trim();
  if (rawUrl && URL.canParse(rawUrl)) return rawUrl;

  const source = job.source?.trim() || job.sources?.[0]?.trim() || "unknown";
  const identity = [job.title, job.company, job.location, source, String(index)]
    .map((value) => value?.trim())
    .filter(Boolean)
    .join("|");

  return `https://canddate.local/jobs/${encodeURIComponent(identity)}`;
}

export function toRecommendedJob(job: ApiSearchJob, index: number): Job {
  const title = job.title?.trim() || "Oportunidade sem título";
  const location = job.location?.trim() || "Local não informado";
  const tags = compactTags([job.keyword, ...(job.keywords ?? [])]);
  const jobLink = fallbackJobLink(job, index);

  return {
    id: `recommended:${jobLink}:${index}`,
    jobTitle: title,
    company: job.company?.trim() || "Empresa não informada",
    location,
    salary: "A combinar",
    type: inferTypeFromText(
      [title, location, job.modality, job.description]
        .filter(Boolean)
        .join(" "),
    ),
    level: inferLevel(title),
    matchScore:
      typeof job.matchScore === "number"
        ? job.matchScore
        : stableMatchScore(`${title}:${job.company ?? ""}`),
    tags: tags.length > 0 ? tags : ["Geral"],
    posted: formatPublicationDate(job.postedAt),
    status: "saved",
    jobLink,
    source:
      job.source?.trim() || job.sources?.[0]?.trim() || "Busca automática",
    notes: "",
    rawPayload: { ...job },
  };
}

export function toDashboardSavedJob(job: ApiSavedJob): Job {
  const title = job.jobTitle?.trim() || "Oportunidade salva";
  const location = job.location?.trim() || "Local não informado";

  return {
    id: job.id,
    jobTitle: title,
    company: job.company?.trim() || "Empresa não informada",
    location,
    salary: "A combinar",
    type: inferTypeFromText([title, location].join(" ")),
    level: inferLevel(title),
    matchScore: stableMatchScore(`${title}:${job.company ?? ""}`),
    tags: job.keyword?.trim() ? [job.keyword.trim()] : ["Geral"],
    posted: "Não informado",
    status: job.status,
    jobLink: job.jobLink,
    source: job.source?.trim() || "Manual",
    notes: job.notes?.trim() || "",
  };
}

function toDashboardSavedJobEvent(event: ApiSavedJobEvent): JobTimelineEvent {
  return {
    ...event,
    metadata: event.metadata ?? null,
  };
}

function toSearchJobsResult(
  response: SearchJobsResponse,
  page: number,
  limit: number,
): SearchJobsResult {
  return {
    jobs: response.jobs.map((job, index) => toRecommendedJob(job, index)),
    pagination: {
      total: response.total ?? response.jobs.length,
      page: response.page ?? page,
      limit: response.limit ?? limit,
      totalPages: response.totalPages ?? 1,
      hasNext: response.hasNext ?? false,
      hasPrev: response.hasPrev ?? false,
    },
  };
}

export async function searchDashboardJobs(
  keywords: string[] = [],
  filters: SearchJobFilters = {},
  page = 1,
  limit = 50,
): Promise<SearchJobsResult> {
  const normalizedKeywords = normalizeKeywords(keywords);

  const { data } = await api.get("/jobs/search", {
    params: {
      ...(normalizedKeywords.length > 0
        ? { keywords: normalizedKeywords.join(",") }
        : {}),
      ...(filters.level ? { level: filters.level } : {}),
      ...(filters.location ? { location: filters.location } : {}),
      ...(filters.continent ? { continent: filters.continent } : {}),
      ...(filters.country ? { country: filters.country } : {}),
      ...(filters.type ? { type: filters.type } : {}),
      ...(filters.model ? { model: filters.model } : {}),
      ...(filters.contract ? { contract: filters.contract } : {}),
      ...(filters.matchSort ? { matchSort: filters.matchSort } : {}),
      page,
      limit,
    },
  });

  const parsed = SearchJobsResponseSchema.parse(data);
  return toSearchJobsResult(parsed, page, limit);
}

function savedJobPayload(job: Job | NewJob, status: JobStatus = "saved") {
  const jobLink = job.jobLink.trim();
  if (!URL.canParse(jobLink)) {
    throw new Error("Informe um link válido para salvar a vaga.");
  }

  return {
    jobLink,
    jobTitle: job.jobTitle.trim(),
    company: job.company.trim(),
    location: job.location.trim() || undefined,
    source: job.source.trim() || undefined,
    keyword:
      "tags" in job
        ? Array.isArray(job.tags)
          ? job.tags[0]
          : job.tags.split(",")[0]?.trim() || undefined
        : undefined,
    status,
    notes: job.notes.trim() || undefined,
  };
}

export async function getDashboardSavedJobs() {
  const { data } = await api.get("/saved-jobs");
  return z.array(ApiSavedJobSchema).parse(data).map(toDashboardSavedJob);
}

export async function getDashboardSavedJobEvents(id: string) {
  const { data } = await api.get(`/saved-jobs/${id}/events`);
  return z.array(ApiSavedJobEventSchema).parse(data).map(toDashboardSavedJobEvent);
}

export async function getDashboardApplicationNotes(id: string) {
  const { data } = await api.get(`/saved-jobs/${id}/notes`);
  return z.array(ApiApplicationNoteSchema).parse(data);
}

export async function createDashboardApplicationNote(id: string, content: string) {
  const { data } = await api.post(`/saved-jobs/${id}/notes`, { content });
  return ApiApplicationNoteSchema.parse(data);
}

export async function updateDashboardApplicationNote(id: string, noteId: string, content: string) {
  const { data } = await api.patch(`/saved-jobs/${id}/notes/${noteId}`, { content });
  return ApiApplicationNoteSchema.parse(data);
}

export async function deleteDashboardApplicationNote(id: string, noteId: string) {
  await api.delete(`/saved-jobs/${id}/notes/${noteId}`);
}

export async function createDashboardSavedJob(
  job: Job | NewJob,
  status: JobStatus = "saved",
) {
  const { data } = await api.post("/saved-jobs", savedJobPayload(job, status));
  return toDashboardSavedJob(ApiSavedJobSchema.parse(data));
}

export async function updateDashboardSavedJob(
  id: string,
  changes: { status?: JobStatus; notes?: string },
) {
  const { data } = await api.patch(`/saved-jobs/${id}`, {
    ...changes,
    ...(changes.status === "applied"
      ? { appliedAt: new Date().toISOString() }
      : {}),
  });
  return toDashboardSavedJob(ApiSavedJobSchema.parse(data));
}

export async function deleteDashboardSavedJob(id: string) {
  await api.delete(`/saved-jobs/${id}`);
}
