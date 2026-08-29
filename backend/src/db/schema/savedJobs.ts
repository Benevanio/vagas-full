import { InferInsertModel, InferSelectModel } from "drizzle-orm";
import { pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { users } from "./users";

export const jobStatusEnum = [
  "saved",
  "applied",
  "interviewing",
  "rejected",
  "accepted",
] as const;

export type JobStatus = (typeof jobStatusEnum)[number];

export const savedJobs = pgTable("saved_jobs", {
  id: uuid("id").defaultRandom().primaryKey(),

  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),

  jobLink: text("job_link"),
  jobTitle: text("job_title"),
  company: text("company"),
  location: text("location"),
  source: text("source"),
  keyword: text("keyword"),

  status: varchar("status", { length: 50 })
    .$type<JobStatus>()
    .default("saved")
    .notNull(),

  appliedAt: timestamp("applied_at"),
  notes: text("notes"),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type SavedJob = InferSelectModel<typeof savedJobs>;
export type NewSavedJob = InferInsertModel<typeof savedJobs>;
