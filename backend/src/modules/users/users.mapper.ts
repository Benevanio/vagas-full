import type { NewUser, User } from "../../db/schema/users";
import { decryptText } from "../../lib/security/encryption";
import {
  protectCpf,
  protectEmail,
  protectNullableText,
} from "../../lib/security/piiPayload";
import type { CreateUserParams } from "./functions/createUser";
import type { UpdateProfileData } from "../types/user.types";

function protectTechnologies(value: string[] | null | undefined) {
  return value ? protectNullableText(JSON.stringify(value)) : null;
}

function protectJson(value: unknown[] | null | undefined) {
  return value ? protectNullableText(JSON.stringify(value)) : null;
}

function parseEncryptedArray(value: string | null | undefined) {
  if (!value) return null;

  try {
    const parsed = JSON.parse(decryptText(value));
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function toUserCreateValues(profile: CreateUserParams): Partial<NewUser> {
  return {
    email: null,
    ...protectEmail(profile.email),
    firstName: null,
    firstNameEncrypted: protectNullableText(profile.firstName),
    lastName: null,
    lastNameEncrypted: protectNullableText(profile.lastName),
    displayName: null,
    displayNameEncrypted: protectNullableText(profile.displayName),
    avatarUrl: null,
    avatarUrlEncrypted: protectNullableText(profile.avatarUrl),
    phone: null,
    phoneEncrypted: protectNullableText(profile.phone),
    cpf: null,
    ...protectCpf(profile.cpf),
    technologies: null,
    technologiesEncrypted: protectTechnologies(profile.technologies ?? []),
    technologyExperiencesEncrypted: protectJson(
      profile.technologyExperiences ?? [],
    ),
    level: null,
    levelEncrypted: protectNullableText(profile.level),
  };
}

export function toUserUpdateValues(data: UpdateProfileData): Partial<User> {
  const values: Partial<User> = { ...data };

  if ("firstName" in data) {
    values.firstName = null;
    values.firstNameEncrypted = protectNullableText(data.firstName);
  }

  if ("lastName" in data) {
    values.lastName = null;
    values.lastNameEncrypted = protectNullableText(data.lastName);
  }

  if ("displayName" in data) {
    values.displayName = null;
    values.displayNameEncrypted = protectNullableText(data.displayName);
  }

  if ("phone" in data) {
    values.phone = null;
    values.phoneEncrypted = protectNullableText(data.phone);
  }

  if ("cpf" in data) {
    values.cpf = null;
    Object.assign(values, protectCpf(data.cpf));
  }

  if ("avatarUrl" in data) {
    values.avatarUrl = null;
    values.avatarUrlEncrypted = protectNullableText(data.avatarUrl);
  }

  if ("technologies" in data) {
    values.technologies = null;
    values.technologiesEncrypted = protectTechnologies(data.technologies);
  }

  if ("technologyExperiences" in data) {
    values.technologyExperiencesEncrypted = protectJson(
      data.technologyExperiences,
    );
    delete (values as Record<string, unknown>).technologyExperiences;
  }

  if ("level" in data) {
    values.level = null;
    values.levelEncrypted = protectNullableText(data.level);
  }

  return values;
}

type PublicUser = Omit<
  User,
  | "emailEncrypted"
  | "emailHash"
  | "firstNameEncrypted"
  | "lastNameEncrypted"
  | "displayNameEncrypted"
  | "avatarUrlEncrypted"
  | "phoneEncrypted"
  | "cpfEncrypted"
  | "cpfHash"
  | "technologiesEncrypted"
  | "technologyExperiencesEncrypted"
  | "levelEncrypted"
> & { technologyExperiences?: unknown[] | null };

export function toPublicUser(user: User): PublicUser {
  const {
    emailEncrypted,
    emailHash,
    firstNameEncrypted,
    lastNameEncrypted,
    displayNameEncrypted,
    avatarUrlEncrypted,
    phoneEncrypted,
    cpfEncrypted,
    cpfHash,
    technologiesEncrypted,
    technologyExperiencesEncrypted,
    levelEncrypted,
    ...safeUser
  } = user;

  return {
    ...safeUser,
    email: emailEncrypted ? decryptText(emailEncrypted) : user.email,
    firstName: firstNameEncrypted
      ? decryptText(firstNameEncrypted)
      : user.firstName,
    lastName: lastNameEncrypted
      ? decryptText(lastNameEncrypted)
      : user.lastName,
    displayName: displayNameEncrypted
      ? decryptText(displayNameEncrypted)
      : user.displayName,
    avatarUrl: avatarUrlEncrypted
      ? decryptText(avatarUrlEncrypted)
      : user.avatarUrl,
    phone: phoneEncrypted ? decryptText(phoneEncrypted) : user.phone,
    cpf: cpfEncrypted ? decryptText(cpfEncrypted) : user.cpf,
    technologies:
      parseEncryptedArray(technologiesEncrypted) ?? user.technologies,
    technologyExperiences: parseEncryptedArray(technologyExperiencesEncrypted),
    level: levelEncrypted ? decryptText(levelEncrypted) : user.level,
  };
}
