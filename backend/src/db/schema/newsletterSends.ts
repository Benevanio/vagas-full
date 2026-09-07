import { InferInsertModel, InferSelectModel } from "drizzle-orm";
import {
  index,
  jsonb,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { users } from "./users";

/**
 * `pending` é a reserva do envio: gravada antes de enfileirar o e-mail, para
 * que dois workers não processem o mesmo (userId, isoWeek). Vira `sent` só
 * depois que o enqueue é confirmado, ou some se o enqueue falhar.
 */
export const newsletterSendStatusEnum = [
  "pending",
  "sent",
  "skipped_no_match",
] as const;

export type NewsletterSendStatus = (typeof newsletterSendStatusEnum)[number];

export const newsletterSends = pgTable(
  "newsletter_sends",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    isoWeek: varchar("iso_week", { length: 8 }).notNull(),

    status: varchar("status", { length: 20 })
      .$type<NewsletterSendStatus>()
      .notNull(),

    sentJobIds: jsonb("sent_job_ids").$type<string[]>().default([]).notNull(),

    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    userIdIsoWeekUnique: uniqueIndex(
      "newsletter_sends_user_id_iso_week_unique",
    ).on(table.userId, table.isoWeek),
    userIdCreatedAtIdx: index(
      "newsletter_sends_user_id_created_at_idx",
    ).on(table.userId, table.createdAt),
  }),
);

export type NewsletterSend = InferSelectModel<typeof newsletterSends>;
export type NewNewsletterSend = InferInsertModel<typeof newsletterSends>;
