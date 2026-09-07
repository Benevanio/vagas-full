import { z } from "zod";
import { api } from "@/shared/lib/apiClient";
import type { JobType, SearchPreferences, UserProfile } from "../types";
import { initialPreferences, initialUser } from "../constants";

const ApiUserProfileSchema = z.object({
  id: z.string().optional(),
  firstName: z.string().nullable().optional(),
  lastName: z.string().nullable().optional(),
  displayName: z.string().nullable().optional(),
  username: z.string().nullable().optional(),
  email: z.string().email().nullable().optional(),
  avatarUrl: z.string().url().nullable().optional(),
  phone: z.string().nullable().optional(),
  technologies: z.array(z.string()).nullable().optional(),
  technologyExperiences: z
    .array(z.object({ name: z.string(), years: z.number() }))
    .nullable()
    .optional(),
  level: z.string().nullable().optional(),
});

const ApiSearchPreferencesSchema = z.object({
  id: z.string().optional(),
  userId: z.string().optional(),
  keywords: z.array(z.string()).nullable().optional(),
  searchLocation: z.string().nullable().optional(),
  searchLanguage: z.string().nullable().optional(),
  remoteOnly: z.boolean().nullable().optional(),
  jobTypes: z
    .array(z.enum(["Remoto", "Híbrido", "Presencial"]))
    .nullable()
    .optional(),
  emailNotifications: z.boolean().nullable().optional(),
  careerChecklist: z
    .array(
      z.object({
        id: z.string(),
        title: z.string(),
        month: z.string(),
        items: z.array(
          z.object({
            id: z.string(),
            label: z.string(),
            checked: z.boolean(),
          }),
        ),
      }),
    )
    .nullable()
    .optional(),
});

type ApiUserProfile = z.infer<typeof ApiUserProfileSchema>;
type ApiSearchPreferences = z.infer<typeof ApiSearchPreferencesSchema>;

function normalizePreferenceJobTypes(
  jobTypes: JobType[] | null | undefined,
  remoteOnly: boolean | null | undefined,
) {
  if (jobTypes && jobTypes.length > 0) {
    return [...new Set(jobTypes)];
  }

  if (remoteOnly === true) return ["Remoto"];
  if (remoteOnly === false) return [];

  return initialPreferences.jobTypes;
}

function fallbackNameParts(displayName: string) {
  const [firstName = initialUser.firstName, ...rest] = displayName.split(" ");

  return {
    firstName,
    lastName: rest.join(" ") || initialUser.lastName,
  };
}

function fallbackTechnologyExperiences(
  technologies: string[],
  experiences: ApiUserProfile["technologyExperiences"],
) {
  const experienceMap = new Map(
    (experiences ?? [])
      .filter((item) => item.name.trim())
      .map((item) => [item.name.trim().toLowerCase(), item]),
  );

  return technologies.map((technology) => {
    const existing = experienceMap.get(technology.trim().toLowerCase());
    return {
      name: technology,
      years: existing?.years ?? 1,
    };
  });
}

export function toUserProfile(data: unknown): UserProfile {
  const profile = ApiUserProfileSchema.parse(data);
  const displayName =
    profile.displayName?.trim() ||
    [profile.firstName, profile.lastName].filter(Boolean).join(" ").trim() ||
    profile.email?.split("@")[0] ||
    initialUser.displayName;
  const nameParts = fallbackNameParts(displayName);

  const technologies =
    profile.technologies && profile.technologies.length > 0
      ? profile.technologies
      : initialUser.technologies;

  return {
    firstName: profile.firstName?.trim() || nameParts.firstName,
    lastName: profile.lastName?.trim() || nameParts.lastName,
    displayName,
    username:
      profile.username?.trim() ||
      displayName.trim().replace(/\s+/g, "").toLowerCase() ||
      initialUser.username,
    email: profile.email?.trim() || initialUser.email,
    avatarUrl: profile.avatarUrl?.trim() || initialUser.avatarUrl,
    phone: profile.phone?.trim() || initialUser.phone,
    level: profile.level?.trim() || initialUser.level,
    technologies,
    technologyExperiences: fallbackTechnologyExperiences(
      technologies,
      profile.technologyExperiences,
    ),
  };
}

export function toSearchPreferences(data: unknown): SearchPreferences {
  const preferences = ApiSearchPreferencesSchema.parse(data);
  const jobTypes = normalizePreferenceJobTypes(
    preferences.jobTypes,
    preferences.remoteOnly,
  );

  return {
    keywords:
      preferences.keywords && preferences.keywords.length > 0
        ? preferences.keywords
        : initialPreferences.keywords,
    searchLocation:
      preferences.searchLocation?.trim() || initialPreferences.searchLocation,
    remoteOnly:
      preferences.remoteOnly ??
      (jobTypes.length === 1 && jobTypes[0] === "Remoto"),
    jobTypes,
    emailNotifications:
      preferences.emailNotifications ?? initialPreferences.emailNotifications,
    careerChecklist:
      preferences.careerChecklist ?? initialPreferences.careerChecklist,
  };
}

function toProfilePayload(profile: UserProfile) {
  return {
    displayName: profile.displayName,
    firstName: profile.firstName,
    lastName: profile.lastName,
    avatarUrl: profile.avatarUrl || null,
    username: profile.username,
    phone: profile.phone || null,
    technologies: profile.technologies,
    technologyExperiences: profile.technologyExperiences,
    level: profile.level || null,
  };
}

function toPreferencesPayload(preferences: SearchPreferences) {
  return {
    keywords: preferences.keywords,
    searchLocation: preferences.searchLocation || null,
    remoteOnly: preferences.remoteOnly,
    jobTypes: preferences.jobTypes,
    emailNotifications: preferences.emailNotifications,
    careerChecklist: preferences.careerChecklist,
  };
}

export async function getUserProfile() {
  const { data } = await api.get<ApiUserProfile>("/users/profile");
  return toUserProfile(data);
}

export async function updateUserProfile(profile: UserProfile) {
  const { data } = await api.patch<ApiUserProfile>(
    "/users/profile",
    toProfilePayload(profile),
  );
  return toUserProfile(data);
}

export async function getUserPreferences() {
  const { data } = await api.get<ApiSearchPreferences>("/users/preferences");
  return toSearchPreferences(data);
}

export async function createUserPreferences(preferences: SearchPreferences) {
  const { data } = await api.post<ApiSearchPreferences>(
    "/users/preferences",
    toPreferencesPayload(preferences),
  );
  return toSearchPreferences(data);
}

export async function updateUserPreferences(preferences: SearchPreferences) {
  const { data } = await api.patch<ApiSearchPreferences>(
    "/users/preferences",
    toPreferencesPayload(preferences),
  );
  return toSearchPreferences(data);
}

export async function exportUserData() {
  const { data } = await api.get("/users/export", { responseType: "blob" });
  const url = URL.createObjectURL(data);
  const link = document.createElement("a");
  link.href = url;
  link.download = "meus-dados.json";
  link.click();
  URL.revokeObjectURL(url);
}

export async function deleteUserAccount() {
  await api.delete("/users/account", { data: { confirmation: "EXCLUIR" } });
}
