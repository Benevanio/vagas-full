import { z } from "zod";

// ── Profile ───────────────────────────────────────────────────────────────────

export const updateProfileSchema = z
  .object({
    displayName: z.string().min(1).max(100).nullable(),
    firstName: z.string().min(1).max(50).nullable(),
    lastName: z.string().min(1).max(50).nullable(),
    avatarUrl: z.string().url().nullable(),
    username: z
      .string()
      .min(3)
      .max(30)
      .regex(/^[a-z0-9_]+$/),
    phone: z
      .string()
      .max(20)
      .regex(/^\+?[0-9() -]+$/, "Telefone inválido")
      .nullable(),
    cpf: z
      .string()
      .max(14)
      .regex(/^\d{3}\.?\d{3}\.?\d{3}-?\d{2}$/, "CPF inválido")
      .nullable(),
    technologies: z.array(z.string().min(1)).max(30),
    technologyExperiences: z
      .array(
        z.object({
          name: z.string().min(1).max(60),
          years: z.number().min(0).max(50),
        }),
      )
      .max(30),
    level: z.string().max(50).nullable(),
  })
  .partial();

export const requestEmailChangeSchema = z.object({
  email: z.string().trim().email().max(254),
});

export const confirmEmailChangeSchema = z.object({
  token: z.string().min(1).max(512),
});

// ── Preferences ───────────────────────────────────────────────────────────────

const jobTypePreferenceSchema = z.enum(["Remoto", "Híbrido", "Presencial"]);

export const updatePreferencesSchema = z
  .object({
    keywords: z.array(z.string().min(1)).max(20),
    searchLocation: z.string().min(1).max(100).nullable(),
    searchLanguage: z.string().length(2).nullable(),
    remoteOnly: z.boolean(),
    jobTypes: z.array(jobTypePreferenceSchema).max(3),
    emailNotifications: z.boolean(),
    careerChecklist: z
      .array(
        z.object({
          id: z.string().min(1),
          title: z.string().min(1).max(120),
          month: z.string().regex(/^\d{4}-\d{2}$/),
          items: z
            .array(
              z.object({
                id: z.string().min(1),
                label: z.string().min(1).max(200),
                checked: z.boolean(),
              }),
            )
            .max(100),
        }),
      )
      .max(36),
  })
  .partial();

export const createPreferencesSchema = updatePreferencesSchema;

// ── Tipos inferidos ───────────────────────────────────────────────────────────

export type UpdateProfileData = z.infer<typeof updateProfileSchema>;
export type UpdatePreferencesData = z.infer<typeof updatePreferencesSchema>;
export type CreatePreferencesData = z.infer<typeof createPreferencesSchema>;
