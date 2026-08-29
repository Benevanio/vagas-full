import { and, desc, eq, gt, isNull, ne } from "drizzle-orm";
import { db } from "../../db/client";
import { userSessions } from "../../db/schema";
import { sessionTtlSeconds } from "../../lib/session";

export type SessionMetadata = {
  userAgent?: string;
  ipAddress?: string;
};

function expirationDate() {
  return new Date(Date.now() + sessionTtlSeconds * 1000);
}

export function describeDevice(userAgent: string | null) {
  if (!userAgent) return "Dispositivo desconhecido";
  const browser = /edg\//i.test(userAgent)
    ? "Microsoft Edge"
    : /firefox\//i.test(userAgent)
      ? "Firefox"
      : /chrome\//i.test(userAgent)
        ? "Google Chrome"
        : /safari\//i.test(userAgent)
          ? "Safari"
          : "Navegador desconhecido";
  const platform = /android/i.test(userAgent)
    ? "Android"
    : /iphone|ipad|ipod/i.test(userAgent)
      ? "iOS"
      : /windows/i.test(userAgent)
        ? "Windows"
        : /mac os/i.test(userAgent)
          ? "macOS"
          : /linux/i.test(userAgent)
            ? "Linux"
            : null;
  return platform ? `${browser} em ${platform}` : browser;
}

export class SessionService {
  async create(userId: string, metadata: SessionMetadata = {}) {
    const [session] = await db
      .insert(userSessions)
      .values({
        userId,
        userAgent: metadata.userAgent?.slice(0, 1024) || null,
        ipAddress: metadata.ipAddress?.slice(0, 64) || null,
        expiresAt: expirationDate(),
      })
      .returning();
    return session;
  }

  async isActive(userId: string, sessionId?: string) {
    if (!sessionId) return false;
    const session = await db.query.userSessions.findFirst({
      where: and(
        eq(userSessions.id, sessionId),
        eq(userSessions.userId, userId),
        isNull(userSessions.revokedAt),
        gt(userSessions.expiresAt, new Date()),
      ),
    });
    if (!session) return false;

    await db
      .update(userSessions)
      .set({ lastSeenAt: new Date() })
      .where(eq(userSessions.id, session.id));
    return true;
  }

  async list(userId: string, currentSessionId?: string) {
    const sessions = await db
      .select()
      .from(userSessions)
      .where(
        and(
          eq(userSessions.userId, userId),
          isNull(userSessions.revokedAt),
          gt(userSessions.expiresAt, new Date()),
        ),
      )
      .orderBy(desc(userSessions.lastSeenAt));

    return sessions.map((session) => ({
      id: session.id,
      device: describeDevice(session.userAgent),
      userAgent: session.userAgent,
      ipAddress: session.ipAddress,
      createdAt: session.createdAt,
      lastSeenAt: session.lastSeenAt,
      expiresAt: session.expiresAt,
      isCurrent: session.id === currentSessionId,
    }));
  }

  async revoke(userId: string, sessionId: string) {
    const result = await db
      .update(userSessions)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(userSessions.id, sessionId),
          eq(userSessions.userId, userId),
          isNull(userSessions.revokedAt),
        ),
      )
      .returning({ id: userSessions.id });
    return result.length > 0;
  }

  async revokeOthers(userId: string, currentSessionId?: string) {
    if (!currentSessionId) return 0;
    const revokedSessions = await db
      .update(userSessions)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(userSessions.userId, userId),
          ne(userSessions.id, currentSessionId),
          isNull(userSessions.revokedAt),
          gt(userSessions.expiresAt, new Date()),
        ),
      )
      .returning({ id: userSessions.id });
    return revokedSessions.length;
  }
}
