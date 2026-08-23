import { z } from "zod";

// --- ScraperJob ---
export const ScraperJobSchema = z.object({
  id: z.string(),
  title: z.string(),
  company: z.string(),
  location: z.string(),
  url: z.string().url("URL de origem inválida"),
  salary: z.string().optional(),
  modality: z.string().optional(),
  description: z.string().optional(),
  postedAt: z.string().optional(),
  source: z.string(),
  sources: z.array(z.string()),
  keyword: z.string(),
  keywords: z.array(z.string()),
});
export type ScraperJob = z.infer<typeof ScraperJobSchema>;

// --- TriggerScrapeResult ---
export const TriggerScrapeResultSchema = z.object({
  ok: z.boolean(),
  message: z.string(),
});
export type TriggerScrapeResult = z.infer<typeof TriggerScrapeResultSchema>;

export const TriggerScrapeErrorSchema = z.object({
  ok: z.literal(false),
  code: z.enum([
    "SCRAPER_ALREADY_RUNNING",
    "SCRAPER_RUN_LOCK_UNAVAILABLE",
    "SCRAPER_RUN_LOCK_LOST",
  ]),
  message: z.string(),
});
export type TriggerScrapeError = z.infer<typeof TriggerScrapeErrorSchema>;

// --- ScraperStatus ---
export const ScraperStatusSchema = z.object({
  name: z.string().optional(),
  running: z.boolean(),
  lastRunAt: z.string().optional(),
  jobsCollected: z.number().int().min(0).optional(),
});
export type ScraperStatus = z.infer<typeof ScraperStatusSchema>;

export const AdminScraperSchema = z.object({
  name: z.string(),
  status: z.enum(["running", "idle", "down"]),
  running: z.boolean(),
  lastRunAt: z.string().nullable(),
  jobsCollected: z.number().int().min(0).nullable(),
});
export type AdminScraper = z.infer<typeof AdminScraperSchema>;

export const ReprocessScrapeResultSchema = z.object({
  ok: z.boolean(),
  message: z.string(),
});
export type ReprocessScrapeResult = z.infer<typeof ReprocessScrapeResultSchema>;

// --- GetJobsResult ---
export const GetJobsResultSchema = z.object({
  jobs: z.array(ScraperJobSchema), // Agora valida o schema completo do Job acima
  total: z.number().int().min(0),
});
export type GetJobsResult = z.infer<typeof GetJobsResultSchema>;

// --- JobsCountResult ---
export const JobsCountResultSchema = z.object({
  total: z.number().int().min(0),
});
export type JobsCountResult = z.infer<typeof JobsCountResultSchema>;
