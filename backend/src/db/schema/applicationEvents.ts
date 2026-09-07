import { InferInsertModel, InferSelectModel } from "drizzle-orm";
import {
  index,
  jsonb,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { JobStatus, savedJobs } from "./savedJobs";
import { users } from "./users";

export const applicationEventTypeEnum = ["status_changed"] as const;

export type ApplicationEventType =
  (typeof applicationEventTypeEnum)[number];

export const applicationEvents = pgTable(
  "application_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    savedJobId: uuid("saved_job_id")
      .notNull()
      .references(() => savedJobs.id, { onDelete: "cascade" }),

    type: varchar("type", { length: 50 })
      .$type<ApplicationEventType>()
      .notNull(),

    fromStatus: varchar("from_status", { length: 50 })
      .$type<JobStatus>()
      .notNull(),

    toStatus: varchar("to_status", { length: 50 })
      .$type<JobStatus>()
      .notNull(),

    metadata: jsonb("metadata").$type<Record<string, unknown>>(),

    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    savedJobCreatedAtIdx: index(
      "application_events_saved_job_id_created_at_idx",
    ).on(table.savedJobId, table.createdAt),
    // Suporta a consulta de reports.repository.ts (filtra por user_id,
    // ordena por created_at, id) sem Seq Scan conforme o volume cresce.
    userCreatedAtIdIdx: index(
      "application_events_user_id_created_at_id_idx",
    ).on(table.userId, table.createdAt, table.id),
  }),
);

export type ApplicationEvent = InferSelectModel<
  typeof applicationEvents
>;
export type NewApplicationEvent = InferInsertModel<
  typeof applicationEvents
>;