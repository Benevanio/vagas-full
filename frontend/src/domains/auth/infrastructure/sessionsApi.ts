import { api } from "@/shared/lib/apiClient";

export type ActiveSession = {
  id: string;
  device: string;
  userAgent: string | null;
  ipAddress: string | null;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
  isCurrent: boolean;
};

export async function getActiveSessions() {
  const { data } = await api.get<{ sessions: ActiveSession[] }>("/auth/sessions");
  return data.sessions;
}

export async function revokeSession(sessionId: string) {
  const { data } = await api.delete<{ currentSessionRevoked: boolean }>(
    `/auth/sessions/${sessionId}`,
  );
  return data;
}

export async function revokeOtherSessions() {
  const { data } = await api.post<{ revokedCount: number }>(
    "/auth/sessions/revoke-others",
  );
  return data;
}
