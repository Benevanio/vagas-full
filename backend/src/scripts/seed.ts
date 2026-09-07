import "dotenv/config";
import * as argon2 from "argon2";
import { and, eq } from "drizzle-orm";
import { db, pool } from "../db/client";
import {
  applicationEvents,
  credentials,
  savedJobs,
  userPreferences,
  users,
} from "../db/schema";
import type { JobStatus } from "../db/schema/savedJobs";
import type { UserRole } from "../db/schema/users";
import { encryptText } from "../lib/security/encryption";
import { normalizeEmail } from "../lib/security/normalization";
import { generateSearchableHash } from "../lib/security/searchableHash";
const argonOptions = {
  type: argon2.argon2id,
  memoryCost: 65536,
  timeCost: 3,
  parallelism: 4,
};

type SeedUserSpec = {
  username: string;
  displayName: string;
  email: string;
  password: string;
  role: UserRole;
};

const SEED_USERS: SeedUserSpec[] = [
  {
    username: "local.developer",
    displayName: "Local Developer",
    email: "dev@localhost.test",
    password: "Dev@123456",
    role: "user",
  },
  {
    username: "local.admin",
    displayName: "Local Admin",
    email: "admin@localhost.test",
    password: "Admin@123456",
    role: "admin",
  },
];

type SeedSavedJobSpec = {
  jobLink: string;
  jobTitle: string;
  company: string;
  location: string;
  source: string;
  keyword: string;
  status: JobStatus;
  appliedAt?: Date;
  notes?: string;
};

const SEED_SAVED_JOBS: SeedSavedJobSpec[] = [
  {
    jobLink: "https://example.com/jobs/seed-frontend-pleno",
    jobTitle: "Desenvolvedor(a) Frontend Pleno",
    company: "Vagas Full Tech",
    location: "Remoto",
    source: "seed-local",
    keyword: "frontend",
    status: "saved",
  },
  {
    jobLink: "https://example.com/jobs/seed-backend-node",
    jobTitle: "Desenvolvedor(a) Backend Node.js",
    company: "Vagas Full Tech",
    location: "São Paulo, SP",
    source: "seed-local",
    keyword: "node",
    status: "applied",
    appliedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
    notes: "[Seed local] Recrutador respondeu por e-mail; retornar até sexta.",
  },
  {
    jobLink: "https://example.com/jobs/seed-fullstack-react",
    jobTitle: "Engenheiro(a) Fullstack React",
    company: "Vagas Full Tech",
    location: "Remoto",
    source: "seed-local",
    keyword: "react",
    status: "interviewing",
    appliedAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
    notes: "[Seed local] Entrevista técnica marcada; revisar system design.",
  },
];

async function upsertSeedUser(spec: SeedUserSpec): Promise<string> {
  const normalizedEmail = normalizeEmail(spec.email);
  const emailHash = generateSearchableHash(normalizedEmail);

  const existingCredential = await db.query.credentials.findFirst({
    where: eq(credentials.emailHash, emailHash),
  });

  if (existingCredential) {
    console.log(`- usuário já existe, mantendo: ${spec.email}`);
    return existingCredential.userId;
  }

  const passwordHash = await argon2.hash(spec.password, argonOptions);

  const userId = await db.transaction(async (tx) => {
    const [createdUser] = await tx
      .insert(users)
      .values({
        username: spec.username,
        displayNameEncrypted: encryptText(spec.displayName),
        emailEncrypted: encryptText(normalizedEmail),
        emailHash,
        emailVerified: true,
        role: spec.role,
      })
      .returning();

    await tx.insert(credentials).values({
      userId: createdUser.id,
      email: encryptText(normalizedEmail),
      emailHash,
      passwordHash,
    });

    await tx.insert(userPreferences).values({ userId: createdUser.id });

    return createdUser.id;
  });

  console.log(`+ usuário criado: ${spec.email} (role=${spec.role})`);
  return userId;
}

async function upsertSeedSavedJob(
  userId: string,
  spec: SeedSavedJobSpec,
): Promise<string> {
  const existing = await db.query.savedJobs.findFirst({
    where: and(
      eq(savedJobs.userId, userId),
      eq(savedJobs.jobLink, spec.jobLink),
    ),
  });

  if (existing) {
    console.log(`- vaga salva já existe, mantendo: ${spec.jobLink}`);
    return existing.id;
  }

  const [created] = await db
    .insert(savedJobs)
    .values({
      userId,
      jobLink: spec.jobLink,
      jobTitle: spec.jobTitle,
      company: spec.company,
      location: spec.location,
      source: spec.source,
      keyword: spec.keyword,
      status: spec.status,
      appliedAt: spec.appliedAt,
      notes: spec.notes,
    })
    .returning();

  console.log(`+ vaga salva criada: ${spec.jobTitle} (status=${spec.status})`);
  return created.id;
}

async function upsertApplicationEvent(
  userId: string,
  savedJobId: string,
  fromStatus: JobStatus,
  toStatus: JobStatus,
): Promise<void> {
  const existing = await db.query.applicationEvents.findFirst({
    where: and(
      eq(applicationEvents.savedJobId, savedJobId),
      eq(applicationEvents.fromStatus, fromStatus),
      eq(applicationEvents.toStatus, toStatus),
    ),
  });

  if (existing) {
    console.log(`- evento já existe, mantendo: ${fromStatus} -> ${toStatus}`);
    return;
  }

  await db.insert(applicationEvents).values({
    userId,
    savedJobId,
    type: "status_changed",
    fromStatus,
    toStatus,
  });

  console.log(`+ evento criado: ${fromStatus} -> ${toStatus}`);
}

async function main() {
  console.log("Iniciando seed de desenvolvimento local...");

  const devUserSpec = SEED_USERS.find((spec) => spec.role === "user")!;
  const otherUserSpecs = SEED_USERS.filter((spec) => spec !== devUserSpec);

  const devUserId = await upsertSeedUser(devUserSpec);
  for (const spec of otherUserSpecs) {
    await upsertSeedUser(spec);
  }

  const savedJobIds: string[] = [];
  for (const spec of SEED_SAVED_JOBS) {
    savedJobIds.push(await upsertSeedSavedJob(devUserId, spec));
  }

  // "saved" -> "applied" na segunda vaga, "applied" -> "interviewing" na terceira,
  // reproduzindo a trilha real que o front cria ao mover o status de uma vaga salva.
  await upsertApplicationEvent(devUserId, savedJobIds[1], "saved", "applied");
  await upsertApplicationEvent(
    devUserId,
    savedJobIds[2],
    "applied",
    "interviewing",
  );

  console.log("Seed concluído.");
}

main()
  .catch((error) => {
    console.error("Falha ao rodar o seed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
