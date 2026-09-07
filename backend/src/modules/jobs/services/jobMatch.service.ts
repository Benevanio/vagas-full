import { SavedJob } from "../../../db/schema";
import type { PublicUser } from "../../users/users.mapper";

export type TechnologyExperience = {
  name: string;
  years: number;
};

export type MatchableJob = {
  id?: string | null;
  title?: string | null;
  jobTitle?: string | null;
  company?: string | null;
  location?: string | null;
  modality?: string | null;
  type?: string | null;
  level?: string | null;
  keyword?: string | null;
  keywords?: string[] | null;
  description?: string | null;
  url?: string | null;
  [key: string]: unknown;
};

export type MatchedJob = MatchableJob & {
  matchScore?: number;
  matchSource?: "backend_profile";
  matchedTechnologies?: string[];
};

function normalizeMatchText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function matchAliases(technology: string) {
  const normalized = normalizeMatchText(technology);
  const aliases = new Set([normalized]);

  if (normalized.endsWith(" js")) {
    aliases.add(normalized.replace(/\s+js$/, "js"));
  }
  if (normalized.endsWith("js") && normalized.length > 2) {
    aliases.add(normalized.replace(/js$/, " js"));
  }

  return [...aliases].filter(Boolean);
}

function textMatchesAlias(text: string, alias: string) {
  if (!alias) return false;
  if (alias.includes(" ")) return text.includes(alias);
  return ` ${text} `.includes(` ${alias} `);
}

function jobMatchText(job: MatchableJob) {
  const rawValues = Object.values(job).flatMap((value) =>
    Array.isArray(value) ? value : [value],
  );

  return normalizeMatchText(
    rawValues
      .map((value) => (typeof value === "string" ? value : ""))
      .join(" "),
  );
}

function parseTechnologiesFromUser(user: PublicUser): TechnologyExperience[] {
  const experiences = user.technologyExperiences;

  if (Array.isArray(experiences)) {
    return experiences
      .map((item) => {
        if (!item || typeof item !== "object") return null;
        const data = item as Record<string, unknown>;
        const name = typeof data.name === "string" ? data.name.trim() : "";
        const years = typeof data.years === "number" ? data.years : 1;
        return name ? { name, years: Math.max(0, years) } : null;
      })
      .filter((item): item is TechnologyExperience => Boolean(item));
  }

  return (user.technologies ?? [])
    .map((name) => name.trim())
    .filter(Boolean)
    .map((name) => ({ name, years: 1 }));
}

export function getUserMatchTechnologies(user: PublicUser | undefined | null) {
  if (!user) return [];
  return parseTechnologiesFromUser(user);
}

export function scoreJobWithTechnologies(
  job: MatchableJob,
  technologies: TechnologyExperience[],
): MatchedJob {
  const normalizedTechnologies = [
    ...new Map(
      technologies
        .filter((technology) => technology.name.trim())
        .map((technology) => [
          normalizeMatchText(technology.name),
          {
            name: technology.name.trim(),
            years: Math.max(0, technology.years),
          },
        ]),
    ).values(),
  ];

  if (normalizedTechnologies.length === 0) return job;

  const text = jobMatchText(job);
  const matchedTechnologies = normalizedTechnologies.filter((technology) =>
    matchAliases(technology.name).some((alias) =>
      textMatchesAlias(text, alias),
    ),
  );

  const totalWeight = normalizedTechnologies.reduce(
    (total, technology) => total + Math.max(1, technology.years),
    0,
  );
  const matchedWeight = matchedTechnologies.reduce(
    (total, technology) => total + Math.max(1, technology.years),
    0,
  );
  const coverage = matchedWeight / totalWeight;
  const score =
    matchedTechnologies.length === 0
      ? 45
      : Math.min(
          99,
          55 +
            Math.round(coverage * 35) +
            Math.min(matchedTechnologies.length * 4, 9),
        );

  return {
    ...job,
    matchScore: score,
    matchSource: "backend_profile",
    matchedTechnologies: matchedTechnologies.map((item) => item.name),
  };
}

export function jobNotificationIdentity(job: MatchableJob | SavedJob) {
  const url =
    "url" in job && typeof job.url === "string"
      ? job.url
      : "jobLink" in job && typeof job.jobLink === "string"
        ? job.jobLink
        : "";
  return url.trim() || String(job.id ?? "");
}
