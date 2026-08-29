import { z } from "zod";

export const JobStatusSchema = z.enum([
  "saved",
  "applied",
  "interviewing",
  "rejected",
  "accepted",
]);

export const JobTypeSchema = z.enum(["Remoto", "Híbrido", "Presencial"]);
export const JobLevelSchema = z.enum([
  "Estágio/Trainee",
  "Júnior",
  "Pleno",
  "Sênior",
]);

export const JobSchema = z.object({
  id: z.string(),
  jobTitle: z.string().min(1),
  company: z.string().min(1),
  location: z.string().min(1),
  salary: z.string().min(1),
  type: JobTypeSchema,
  level: JobLevelSchema,
  matchScore: z.number().int().min(0).max(100),
  tags: z.array(z.string()),
  posted: z.string().min(1),
  status: JobStatusSchema,
  jobLink: z.string().min(1),
  source: z.string().min(1),
  notes: z.string(),
  rawPayload: z.record(z.string(), z.unknown()).optional(),
});

export const NewJobSchema = z.object({
  jobTitle: z.string().min(1),
  company: z.string().min(1),
  location: z.string(),
  salary: z.string(),
  type: JobTypeSchema,
  level: JobLevelSchema,
  tags: z.string(),
  source: z.string(),
  jobLink: z.string(),
  notes: z.string(),
});

export type JobStatus = z.infer<typeof JobStatusSchema>;
export type JobType = z.infer<typeof JobTypeSchema>;
export type JobLevel = z.infer<typeof JobLevelSchema>;
export type Job = z.infer<typeof JobSchema>;
export type NewJob = z.infer<typeof NewJobSchema>;
export type JobTimelineEvent = {
  id: string;
  type: "status_changed";
  fromStatus: JobStatus;
  toStatus: JobStatus;
  metadata: Record<string, unknown> | null;
  createdAt: string;
};
export type MatchSort = "default" | "desc" | "asc";
export type JobModelFilter =
  | "Todos"
  | JobType
  | "RemotoHibrido"
  | "RemotoPresencial"
  | "HibridoPresencial";
