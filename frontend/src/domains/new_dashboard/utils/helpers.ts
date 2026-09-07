import type { Job, NewJob } from "../types";

export function splitTags(tags: string): string[] {
  return tags
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

export function createJobFromForm(newJobData: NewJob): Job {
  const tags = splitTags(newJobData.tags);

  return {
    id: crypto.randomUUID(),
    jobTitle: newJobData.jobTitle.trim(),
    company: newJobData.company.trim(),
    location: newJobData.location.trim() || newJobData.type,
    salary: newJobData.salary.trim() || "A combinar",
    type: newJobData.type,
    level: newJobData.level,
    matchScore: Math.floor(Math.random() * 26) + 70,
    tags: tags.length > 0 ? tags : ["Geral"],
    posted: "Agora mesmo",
    status: "saved",
    // Sem link, string vazia — mesma convenção de `toDashboardSavedJob`. O "#"
    // anterior era truthy e fazia o detalhe oferecer "Abrir vaga" sem link.
    jobLink: newJobData.jobLink.trim(),
    source: newJobData.source.trim() || "Manual",
    notes: newJobData.notes.trim(),
  };
}

export function getInitials(name: string): string {
  return name
    .split(" ")
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

