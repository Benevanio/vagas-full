import { eq } from "drizzle-orm";
import { db } from "../../db/client";
import {
  accounts,
  applicationEvents,
  keywords,
  savedJobs,
  userNotifications,
  userPreferences,
  users,
} from "../../db/schema";
import type { DB } from "../../db/types/types";
import { AppError } from "../../lib/errors";
import { toPublicUser } from "./users.mapper";

function exportProfile(user: typeof users.$inferSelect) {
  const publicUser = toPublicUser(user);
  const {
    emailEncrypted: _emailEncrypted,
    emailHash: _emailHash,
    firstNameEncrypted: _firstNameEncrypted,
    lastNameEncrypted: _lastNameEncrypted,
    displayNameEncrypted: _displayNameEncrypted,
    avatarUrlEncrypted: _avatarUrlEncrypted,
    phoneEncrypted: _phoneEncrypted,
    cpfEncrypted: _cpfEncrypted,
    cpfHash: _cpfHash,
    technologiesEncrypted: _technologiesEncrypted,
    technologyExperiencesEncrypted: _technologyExperiencesEncrypted,
    levelEncrypted: _levelEncrypted,
    ...profile
  } = publicUser;
  return profile;
}

export class PrivacyService {
  constructor(private readonly database: DB = db) {}

  async exportUserData(userId: string) {
    const user = await this.database.query.users.findFirst({
      where: eq(users.id, userId),
    });
    if (!user) throw AppError.notFound("Usuário não encontrado");

    const [preferences, jobs, notifications, events, userKeywords, providers] =
      await Promise.all([
        this.database.query.userPreferences.findFirst({
          where: eq(userPreferences.userId, userId),
        }),
        this.database.select().from(savedJobs).where(eq(savedJobs.userId, userId)),
        this.database
          .select()
          .from(userNotifications)
          .where(eq(userNotifications.userId, userId)),
        this.database
          .select()
          .from(applicationEvents)
          .where(eq(applicationEvents.userId, userId)),
        this.database.select().from(keywords).where(eq(keywords.userId, userId)),
        this.database
          .select({ provider: accounts.provider, createdAt: accounts.createdAt })
          .from(accounts)
          .where(eq(accounts.userId, userId)),
      ]);

    return {
      exportedAt: new Date().toISOString(),
      profile: exportProfile(user),
      preferences: preferences ?? null,
      savedJobs: jobs,
      applicationEvents: events,
      notifications,
      keywords: userKeywords,
      connectedAccounts: providers,
    };
  }

  async deleteAccount(userId: string): Promise<void> {
    const [deleted] = await this.database
      .delete(users)
      .where(eq(users.id, userId))
      .returning({ id: users.id });
    if (!deleted) throw AppError.notFound("Usuário não encontrado");
  }
}
