import { z } from "zod";

export const createSavedJobSchema = z.object({
  jobLink: z.string().url().optional(),
  jobTitle: z.string().optional(),
  company: z.string().optional(),
  location: z.string().optional(),
  source: z.string().optional(),
  keyword: z.string().optional(),
  status: z
    .enum(["saved", "applied", "interviewing", "rejected", "accepted"])
    .optional(),
  appliedAt: z.coerce.date().optional(),
  notes: z.string().optional(),
});

export const updateSavedJobSchema = createSavedJobSchema.partial();

export const savedJobParamsSchema = z.object({
  id: z.string().uuid("ID da vaga salva inválido."),
});

export const applicationNoteSchema = z.object({
  content: z.string().trim().min(1, "A nota não pode ficar vazia.").max(5000),
});

export const applicationNoteParamsSchema = savedJobParamsSchema.extend({
  noteId: z.string().uuid("ID da nota inválido."),
});

export type CreateSavedJobInput = z.infer<typeof createSavedJobSchema>;
export type UpdateSavedJobInput = z.infer<typeof updateSavedJobSchema>;
