import { randomBytes } from "node:crypto";
import { and, eq, gt, isNull, ne } from "drizzle-orm";
import { db } from "../../db/client";
import { credentials, emailChangeRequests, users } from "../../db/schema";
import { decryptText, encryptText } from "../../lib/security/encryption";
import { normalizeEmail } from "../../lib/security/normalization";
import { generateSearchableHash } from "../../lib/security/searchableHash";
import { AppError } from "../../lib/errors";
import { emailService, EmailService } from "../email/email.service";

const TOKEN_TTL_MS = 30 * 60 * 1000;

export class EmailChangeService {
  constructor(
    private readonly mailer: EmailService = emailService,
    private readonly database: typeof db = db,
  ) {}

  async request(userId: string, email: string): Promise<void> {
    const normalizedEmail = normalizeEmail(email);
    const newEmailHash = generateSearchableHash(normalizedEmail);
    const now = new Date();

    const existingUser = await this.database.query.users.findFirst({
      where: eq(users.emailHash, newEmailHash),
      columns: { id: true },
    });
    const existingCredential = await this.database.query.credentials.findFirst({
      where: eq(credentials.emailHash, newEmailHash),
      columns: { userId: true },
    });
    const currentOwnerId = existingUser?.id ?? existingCredential?.userId;

    if (currentOwnerId && currentOwnerId !== userId) {
      throw AppError.conflict("Este e-mail já está em uso.");
    }

    if (currentOwnerId === userId) {
      throw AppError.validation("Informe um e-mail diferente do atual.");
    }

    const token = randomBytes(32).toString("base64url");
    const tokenHash = generateSearchableHash(token);

    await this.database.transaction(async (tx) => {
      const pendingForAnotherUser = await tx.query.emailChangeRequests.findFirst({
        where: and(
          eq(emailChangeRequests.newEmailHash, newEmailHash),
          ne(emailChangeRequests.userId, userId),
          isNull(emailChangeRequests.invalidatedAt),
          isNull(emailChangeRequests.confirmedAt),
          gt(emailChangeRequests.expiresAt, now),
        ),
        columns: { id: true },
      });

      if (pendingForAnotherUser) {
        throw AppError.conflict("Este e-mail já possui uma confirmação pendente.");
      }

      await tx
        .update(emailChangeRequests)
        .set({ invalidatedAt: now })
        .where(
          and(
            eq(emailChangeRequests.userId, userId),
            isNull(emailChangeRequests.invalidatedAt),
            isNull(emailChangeRequests.confirmedAt),
          ),
        );

      await tx.insert(emailChangeRequests).values({
        userId,
        newEmailEncrypted: encryptText(normalizedEmail),
        newEmailHash,
        tokenHash,
        expiresAt: new Date(now.getTime() + TOKEN_TTL_MS),
      });
    });

    await this.mailer.sendEmailChangeConfirmation({
      email: normalizedEmail,
      token,
    });
  }

  async confirm(token: string): Promise<void> {
    const tokenHash = generateSearchableHash(token);
    const now = new Date();

    await this.database.transaction(async (tx) => {
      const request = await tx.query.emailChangeRequests.findFirst({
        where: eq(emailChangeRequests.tokenHash, tokenHash),
      });

      if (
        !request ||
        request.invalidatedAt ||
        request.confirmedAt ||
        request.expiresAt <= now
      ) {
        throw AppError.validation("Token inválido ou expirado.");
      }

      const email = decryptText(request.newEmailEncrypted);
      const currentOwner = await tx.query.users.findFirst({
        where: eq(users.emailHash, request.newEmailHash),
        columns: { id: true },
      });
      const credentialOwner = await tx.query.credentials.findFirst({
        where: eq(credentials.emailHash, request.newEmailHash),
        columns: { userId: true },
      });

      if (
        (currentOwner && currentOwner.id !== request.userId) ||
        (credentialOwner && credentialOwner.userId !== request.userId)
      ) {
        throw AppError.conflict("Este e-mail já está em uso.");
      }

      const [updatedUser] = await tx
        .update(users)
        .set({
          email: null,
          emailEncrypted: encryptText(email),
          emailHash: request.newEmailHash,
          emailVerified: true,
          updatedAt: now,
        })
        .where(eq(users.id, request.userId))
        .returning({ id: users.id });

      if (!updatedUser) {
        throw AppError.notFound("Usuário não encontrado.");
      }

      await tx
        .update(credentials)
        .set({
          email: encryptText(email),
          emailHash: request.newEmailHash,
          updatedAt: now,
        })
        .where(eq(credentials.userId, request.userId));

      await tx
        .update(emailChangeRequests)
        .set({ confirmedAt: now })
        .where(eq(emailChangeRequests.id, request.id));
    });
  }
}
