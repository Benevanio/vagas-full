import { InferInsertModel, InferSelectModel } from "drizzle-orm";
import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { savedJobs } from "./savedJobs";
import { users } from "./users";

export const applicationNotes = pgTable(
  "application_notes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    savedJobId: uuid("saved_job_id")
      .notNull()
      .references(() => savedJobs.id, { onDelete: "cascade" }),
    content: text("content").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [index("application_notes_user_job_idx").on(table.userId, table.savedJobId)],
);

export type ApplicationNote = InferSelectModel<typeof applicationNotes>;
export type NewApplicationNote = InferInsertModel<typeof applicationNotes>;
