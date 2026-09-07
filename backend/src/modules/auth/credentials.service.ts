import * as argon2 from "argon2";
import { db } from "../../db/client";
import { userPreferences } from "../../db/schema";
import { credentials } from "../../db/schema/credentials";
import { AppError } from "../../lib/errors";
import { logError } from "../../logger";
import { emailService } from "../email/email.service";
import { encryptText } from "../../lib/security/encryption";
import { normalizeEmail } from "../../lib/security/normalization";
import { generateSearchableHash } from "../../lib/security/searchableHash";
import { generateUsername } from "../../utils/generateUsername";
import type { Session } from "../types/auth.types";
import {
  LoginInput,
  LoginSchema,
  RegisterInput,
  RegisterSchema,
} from "../types/credentials.types";
import type { PublicUser } from "../users/users.mapper";
import { UsersRepository } from "../users/users.repository";

const argonOptions = {
  type: argon2.argon2id,
  memoryCost: 65536,
  timeCost: 3,
  parallelism: 4,
};

export class CredentialsService {
  async findById(id: string): Promise<PublicUser | null> {
    const user = await new UsersRepository().findById(id);
    return user ?? null;
  }

  async register(
    input: RegisterInput,
  ): Promise<{ user: PublicUser; session: Session }> {
    const { email, password, name, phone, cpf, technologies, level } =
      RegisterSchema.parse(input);
    const normalizedEmail = normalizeEmail(email);
    const emailHash = generateSearchableHash(normalizedEmail);

    const existingCredential = await db.query.credentials.findFirst({
      where: (credential, { eq }) => eq(credential.emailHash, emailHash),
    });
    if (existingCredential) {
      throw AppError.conflict("Email já cadastrado");
    }

    const existingUser = await new UsersRepository().findByEmail(email);
    if (existingUser) {
      throw AppError.conflict("Email já cadastrado");
    }

    const passwordHash = await argon2.hash(password, argonOptions);

    const user = await db.transaction(async (tx) => {
      const baseName = name?.trim() || email.split("@")[0];
      const username = await generateUsername(baseName, tx);

      const createdUser = await new UsersRepository(tx).create(
        {
          email,
          displayName: name,
          phone,
          cpf,
          technologies,
          level,
        },
        username,
      );

      await tx
        .insert(credentials)
        .values({
          userId: createdUser.id,
          email: encryptText(normalizedEmail),
          emailHash,
          passwordHash,
        });
      await tx.insert(userPreferences).values({ userId: createdUser.id });

      return createdUser;
    });

    // E-mail de boas-vindas: falha nunca derruba o registro (EMAIL-08).
    try {
      await emailService.sendWelcome({
        email: user.email,
        name: user.displayName ?? user.username,
      });
    } catch (error) {
      logError("Falha ao disparar e-mail de boas-vindas.", {
        userId: user.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    return { user, session: { userId: user.id, role: user.role } };
  }

  async login(
    input: LoginInput,
  ): Promise<{ user: PublicUser; session: Session }> {
    const { email, password } = LoginSchema.parse(input);
    const normalizedEmail = normalizeEmail(email);
    const emailHash = generateSearchableHash(normalizedEmail);

    const credential = await db.query.credentials.findFirst({
      where: (credential, { eq }) => eq(credential.emailHash, emailHash),
    });
    if (!credential) {
      throw AppError.unauthorized("Credenciais inválidas");
    }

    const valid = await argon2.verify(credential.passwordHash, password);
    if (!valid) {
      throw AppError.unauthorized("Credenciais inválidas");
    }

    const user = await new UsersRepository().findById(credential.userId);
    if (!user) {
      throw AppError.notFound("Usuário não encontrado");
    }

    return { user, session: { userId: user.id, role: user.role } };
  }
}
