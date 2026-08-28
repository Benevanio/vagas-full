import { InferInsertModel, InferSelectModel } from "drizzle-orm";
import { index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { users } from "./users";

export const emailChangeRequests = pgTable(
  "email_change_requests",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    newEmailEncrypted: text("new_email_encrypted").notNull(),
    newEmailHash: text("new_email_hash").notNull(),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    invalidatedAt: timestamp("invalidated_at"),
    confirmedAt: timestamp("confirmed_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    tokenHashUnique: uniqueIndex("email_change_requests_token_hash_unique").on(
      table.tokenHash,
    ),
    userCreatedAtIdx: index("email_change_requests_user_id_created_at_idx").on(
      table.userId,
      table.createdAt,
    ),
  }),
);

export type EmailChangeRequest = InferSelectModel<typeof emailChangeRequests>;
export type NewEmailChangeRequest = InferInsertModel<
  typeof emailChangeRequests
>;
