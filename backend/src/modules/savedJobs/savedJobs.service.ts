import { and, eq } from "drizzle-orm";
import { db } from "../../db/client";
import {
  ApplicationEvent,
  applicationEvents,
  NewSavedJob,
  SavedJob,
  savedJobs,
} from "../../db/schema";
import { DB } from "../../db/types/types";
import { ownedBy } from "../../lib/authorization/ownership";
import { AppError } from "../../lib/errors";
import { NotificationsService } from "../notifications/notifications.service";

export class SavedJobsService {
  constructor(private readonly tx: DB = db) {}

  async getAll(userId: string): Promise<SavedJob[]> {
    return this.tx.query.savedJobs.findMany({
      where: (j) => ownedBy(userId, j.userId),
      orderBy: (j, { desc }) => desc(j.createdAt),
    });
  }

  async getById(userId: string, jobId: string): Promise<SavedJob | undefined> {
    return this.tx.query.savedJobs.findFirst({
      where: (j, { and, eq }) => and(ownedBy(userId, j.userId), eq(j.id, jobId)),
    });
  }

  async create(
    userId: string,
    data: Omit<NewSavedJob, "userId">,
  ): Promise<SavedJob> {
    const existing = data.jobLink
      ? await this.tx.query.savedJobs.findFirst({
          where: (j, { and, eq }) =>
            and(ownedBy(userId, j.userId), eq(j.jobLink, data.jobLink)),
        })
      : undefined;

    if (existing) {
      throw AppError.conflict("Vaga já salva.");
    }

    // As três escritas precisam ser atômicas, como já acontece no `update()`:
    // sem transação, uma falha no evento ou na notificação deixaria a vaga
    // criada sem histórico, e um retry do usuário duplicaria o registro.
    return this.tx.transaction(async (tx) => {
      const result = await tx
        .insert(savedJobs)
        .values({ ...data, userId })
        .returning();
      await tx.insert(applicationEvents).values({
        userId,
        savedJobId: result[0].id,
        type: "status_changed",
        fromStatus: "saved",
        toStatus: result[0].status,
        metadata: { event: "application_created", source: data.source ?? "Manual" },
      });
      await new NotificationsService(tx).createForSavedJob(userId, result[0]);
      return result[0];
    });
  }

  async update(
    userId: string,
    jobId: string,
    data: Partial<NewSavedJob>,
  ): Promise<SavedJob> {
    return this.tx.transaction(async (tx) => {
      const [currentJob] = await tx
        .select()
        .from(savedJobs)
        .where(
          and(eq(savedJobs.id, jobId), eq(savedJobs.userId, userId)),
        )
        .limit(1)
        .for("update");

      if (!currentJob) {
        throw AppError.notFound("Vaga não encontrada");
      }

      const statusChanged =
        data.status !== undefined && data.status !== currentJob.status;

      const [updatedJob] = await tx
        .update(savedJobs)
        .set({
          ...data,
          updatedAt: new Date(),
        })
        .where(
          and(eq(savedJobs.id, jobId), eq(savedJobs.userId, userId)),
        )
        .returning();

      if (!updatedJob) {
        throw AppError.notFound("Vaga não encontrada");
      }

      if (statusChanged && data.status) {
        await tx.insert(applicationEvents).values({
          userId,
          savedJobId: jobId,
          type: "status_changed",
          fromStatus: currentJob.status,
          toStatus: data.status,
        });

        await new NotificationsService(tx).createForJobStatusChange(
          userId,
          currentJob,
          updatedJob,
        );
      }

      return updatedJob;
    });
  }

  async getEvents(
    userId: string,
    jobId: string,
  ): Promise<ApplicationEvent[]> {
    const job = await this.getById(userId, jobId);

    if (!job) {
      throw AppError.notFound("Vaga não encontrada");
    }

    return this.tx.query.applicationEvents.findMany({
      where: (event, { and, eq }) =>
        and(eq(event.userId, userId), eq(event.savedJobId, jobId)),
      orderBy: (event, { asc }) => [
        asc(event.createdAt),
        asc(event.id),
      ],
    });
  }

  async delete(userId: string, jobId: string): Promise<void> {
    const result = await this.tx
      .delete(savedJobs)
      .where(and(eq(savedJobs.id, jobId), ownedBy(userId, savedJobs.userId)))
      .returning({ id: savedJobs.id });

    if (!result[0]) {
      throw AppError.notFound("Vaga não encontrada");
    }
  }
}
