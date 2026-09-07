import { and, asc, eq } from "drizzle-orm";
import { db } from "../../db/client";
import { applicationNotes, ApplicationNote, savedJobs } from "../../db/schema";
import { DB } from "../../db/types/types";
import { AppError } from "../../lib/errors";

export class ApplicationNotesService {
  constructor(private readonly tx: DB = db) {}

  private async ensureJobOwner(userId: string, savedJobId: string): Promise<void> {
    const [job] = await this.tx
      .select({ id: savedJobs.id })
      .from(savedJobs)
      .where(and(eq(savedJobs.id, savedJobId), eq(savedJobs.userId, userId)))
      .limit(1);
    if (!job) throw AppError.notFound("Vaga não encontrada");
  }

  async list(userId: string, savedJobId: string): Promise<ApplicationNote[]> {
    await this.ensureJobOwner(userId, savedJobId);
    return this.tx.query.applicationNotes.findMany({
      where: (note, { and, eq }) =>
        and(eq(note.userId, userId), eq(note.savedJobId, savedJobId)),
      orderBy: (note, { asc }) => [asc(note.createdAt), asc(note.id)],
    });
  }

  async create(userId: string, savedJobId: string, content: string): Promise<ApplicationNote> {
    await this.ensureJobOwner(userId, savedJobId);
    const [note] = await this.tx
      .insert(applicationNotes)
      .values({ userId, savedJobId, content })
      .returning();
    return note;
  }

  async update(userId: string, savedJobId: string, noteId: string, content: string): Promise<ApplicationNote> {
    const [note] = await this.tx
      .update(applicationNotes)
      .set({ content, updatedAt: new Date() })
      .where(and(eq(applicationNotes.id, noteId), eq(applicationNotes.savedJobId, savedJobId), eq(applicationNotes.userId, userId)))
      .returning();
    if (!note) throw AppError.notFound("Nota não encontrada");
    return note;
  }

  async delete(userId: string, savedJobId: string, noteId: string): Promise<void> {
    const [note] = await this.tx
      .delete(applicationNotes)
      .where(and(eq(applicationNotes.id, noteId), eq(applicationNotes.savedJobId, savedJobId), eq(applicationNotes.userId, userId)))
      .returning({ id: applicationNotes.id });
    if (!note) throw AppError.notFound("Nota não encontrada");
  }
}
