import { useEffect, useState } from "react";
import { useAuth } from "@/domains/auth/application/AuthContext";
import {
  getActiveSessions,
  revokeOtherSessions,
  revokeSession,
  type ActiveSession,
} from "@/domains/auth/infrastructure/sessionsApi";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function SessionsForm() {
  const { logout } = useAuth();
  const [sessions, setSessions] = useState<ActiveSession[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [isRevokingOthers, setIsRevokingOthers] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");

  const refresh = async () => {
    try {
      setError("");
      setSessions(await getActiveSessions());
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Falha ao carregar sessões.",
      );
    }
  };

  useEffect(() => {
    let cancelled = false;
    getActiveSessions()
      .then((result) => {
        if (!cancelled) setSessions(result);
      })
      .catch((cause) => {
        if (!cancelled) {
          setError(
            cause instanceof Error
              ? cause.message
              : "Falha ao carregar sessões.",
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleRevoke(session: ActiveSession) {
    setBusyId(session.id);
    setError("");
    setFeedback("");
    try {
      const result = await revokeSession(session.id);
      if (result.currentSessionRevoked) {
        await logout();
        return;
      }
      setFeedback("Sessão revogada com sucesso.");
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao revogar sessão.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleRevokeOthers() {
    setIsRevokingOthers(true);
    setError("");
    setFeedback("");
    try {
      const { revokedCount } = await revokeOtherSessions();
      setFeedback(
        revokedCount === 0
          ? "Não há outras sessões ativas."
          : `${revokedCount} sessão(ões) revogada(s).`,
      );
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao revogar sessões.");
    } finally {
      setIsRevokingOthers(false);
    }
  }

  const hasOtherSessions = sessions?.some((session) => !session.isCurrent) ?? false;

  return (
    <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div>
          <h2 className="text-[18px] font-bold">Sessões ativas</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Gerencie os dispositivos que têm acesso à sua conta.
          </p>
        </div>
        <button
          type="button"
          onClick={handleRevokeOthers}
          disabled={!hasOtherSessions || isRevokingOthers}
          className="h-9 shrink-0 rounded-md border border-border px-4 text-sm font-bold text-rose-600 transition-colors hover:bg-rose-500/10 disabled:cursor-not-allowed disabled:opacity-60 dark:text-rose-400"
        >
          {isRevokingOthers ? "Encerrando..." : "Encerrar outras sessões"}
        </button>
      </div>

      {feedback ? <p role="status" className="mt-4 text-sm text-emerald-600 dark:text-emerald-400">{feedback}</p> : null}
      {error ? <p role="alert" className="mt-4 text-sm text-rose-600 dark:text-rose-400">{error}</p> : null}

      <div className="mt-5 rounded-xl border border-border bg-muted/35 p-2">
        {sessions === null ? (
          <p className="px-3 py-4 text-sm text-muted-foreground">Carregando…</p>
        ) : sessions.length === 0 ? (
          <p className="px-3 py-4 text-sm text-muted-foreground">
            Nenhuma sessão ativa encontrada.
          </p>
        ) : (
          <ul className="flex flex-col">
            {sessions.map((session) => (
              <li key={session.id} className="flex flex-col gap-3 border-b border-border px-3 py-4 last:border-b-0 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-bold text-foreground">
                    {session.device} {session.isCurrent ? "(esta sessão)" : ""}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Último acesso: {formatDate(session.lastSeenAt)}
                    {session.ipAddress ? ` · IP: ${session.ipAddress}` : ""}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Expira em: {formatDate(session.expiresAt)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleRevoke(session)}
                  disabled={busyId === session.id}
                  className="h-9 shrink-0 self-start rounded-md border border-border px-4 text-sm font-bold text-rose-600 transition-colors hover:bg-rose-500/10 disabled:cursor-not-allowed disabled:opacity-60 dark:text-rose-400 sm:self-auto"
                >
                  {busyId === session.id
                    ? "Encerrando..."
                    : session.isCurrent
                      ? "Encerrar esta sessão"
                      : "Encerrar sessão"}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
