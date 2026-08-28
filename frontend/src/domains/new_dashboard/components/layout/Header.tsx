import { useAuth } from "@/domains/auth/application/AuthContext";
import { Bell, ChevronDown, Mail } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  clearDashboardNotifications,
  getDashboardNotificationFeed,
  markDashboardNotificationsRead,
  markSingleNotificationRead,
} from "../../infrastructure/notificationsApi";
import type { Message, Notification, UserProfile } from "../../types";
import {
  DASHBOARD_NOTIFICATIONS_REFRESH_EVENT,
  type DashboardNotificationsRefreshDetail,
} from "../../utils/notificationEvents";
import { MessageDetailModal } from "./MessageDetailModal";
import { ThemeToggle } from "./ThemeToggle";

interface HeaderProps {
  title?: string;
  userProfile?: UserProfile;
  userInitials?: string;
  unreadNotifications?: number;
  messages?: Message[];
  notifications?: Notification[];
}

export function Header({
  title,
  userProfile,
  userInitials,
  unreadNotifications = 0,
  messages = [],
  notifications = [],
}: HeaderProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [showMessagesMenu, setShowMessagesMenu] = useState(false);
  const [showNotificationsMenu, setShowNotificationsMenu] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [menuMessages, setMenuMessages] = useState<Message[]>(messages);
  const [menuNotifications, setMenuNotifications] =
    useState<Notification[]>(notifications);
  const [selectedMessage, setSelectedMessage] = useState<Message | null>(null);
  const [unreadMessagesCount, setUnreadMessagesCount] = useState(
    messages.length,
  );
  const [unreadCount, setUnreadCount] = useState(unreadNotifications);
  const actionsRef = useRef<HTMLDivElement>(null);

  const routeTitles: Array<{ path: string; title: string }> = [
    { path: "/home", title: "Início" },
    { path: "/dashboard", title: "Métricas & Vagas" },
    { path: "/vagas", title: "Vagas" },
    { path: "/mentoria", title: "Mentoria" },
    { path: "/perfil", title: "Meu Perfil Profissional" },
    { path: "/ajuda", title: "Ajuda & Suporte" },
  ];

  const activeTitle =
    title ??
    routeTitles.find((route) => location.pathname === route.path)?.title ??
    "Início";

  const displayName =
    userProfile?.displayName ??
    user?.displayName ??
    user?.name ??
    user?.email ??
    "Usuário";
  const accountLabel =
    userProfile?.email ??
    (userProfile?.username ? `@${userProfile.username}` : undefined) ??
    user?.email ??
    displayName.trim().replace(/\s+/g, "").toLowerCase();
  const avatarUrl = userProfile?.avatarUrl || user?.avatarUrl || "";
  const initials =
    userInitials ??
    displayName
      .trim()
      .split(/\s|[._-]/)
      .filter(Boolean)
      .map((part) => part[0])
      .slice(0, 2)
      .join("")
      .toUpperCase();

  const loadFeeds = useCallback(async () => {
    if (!user) return;

    try {
      const [messagesResult, notificationsResult] = await Promise.all([
        getDashboardNotificationFeed("message"),
        getDashboardNotificationFeed("notification"),
      ]);

      setMenuMessages((current) => {
        const optimistic = current.filter(
          (message) =>
            String(message.id).startsWith("local:") &&
            !messagesResult.messages.some((item) => item.text === message.text),
        );
        return [...optimistic, ...messagesResult.messages];
      });
      setUnreadMessagesCount(messagesResult.unreadCount);
      setMenuNotifications((current) => {
        const optimistic = current.filter(
          (notification) =>
            String(notification.id).startsWith("local:") &&
            !notificationsResult.notifications.some(
              (item) => item.text === notification.text,
            ),
        );
        return [...optimistic, ...notificationsResult.notifications];
      });
      setUnreadCount(notificationsResult.unreadCount);
    } catch {
      // Mantém os dados de fallback até a API estar disponível.
    }
  }, [user]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount: setState só ocorre após o await resolver a Promise, não é síncrono no corpo do efeito; falso positivo conhecido da regra para esse padrão.
    void loadFeeds();

    const handleRefresh = (event: Event) => {
      const detail = (event as CustomEvent<DashboardNotificationsRefreshDetail>)
        .detail;
      if (detail?.incrementUnread) {
        if (!detail.channel || detail.channel === "notification") {
          setUnreadCount((current) => current + 1);
        }
        if (detail.channel === "message") {
          setUnreadMessagesCount((current) => current + 1);
        }
      }
      if (detail?.item) {
        if (detail.channel === "message") {
          setMenuMessages((current) => [
            {
              id: detail.item!.id,
              sender: detail.item!.sender ?? "Candidate",
              text: detail.item!.text,
              date: detail.item!.date,
              origin: detail.item!.origin,
            },
            ...current.filter((item) => item.text !== detail.item!.text),
          ]);
        } else {
          setMenuNotifications((current) => [
            {
              id: detail.item!.id,
              text: detail.item!.text,
              type: detail.item!.type,
              date: detail.item!.date,
              jobId: detail.item!.jobId,
              isRead: detail.item!.isRead ?? false,
            },
            ...current.filter((item) => item.text !== detail.item!.text),
          ]);
        }
        return;
      }
      void loadFeeds();
    };
    window.addEventListener(
      DASHBOARD_NOTIFICATIONS_REFRESH_EVENT,
      handleRefresh,
    );

    return () => {
      window.removeEventListener(
        DASHBOARD_NOTIFICATIONS_REFRESH_EVENT,
        handleRefresh,
      );
    };
  }, [loadFeeds]);

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (!actionsRef.current?.contains(event.target as Node)) {
        setShowMessagesMenu(false);
        setShowNotificationsMenu(false);
        setShowUserMenu(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, []);

  return (
    <header className="relative z-20 flex h-[58px] shrink-0 items-center justify-between gap-2 border-b border-border bg-card px-3 sm:px-6 md:px-8">
      <h1 className="min-w-0 truncate text-base font-bold leading-none text-foreground sm:text-[20px]">
        {activeTitle}
      </h1>
      <div
        ref={actionsRef}
        className="relative flex shrink-0 items-center gap-1 sm:gap-2 md:gap-3"
      >
        <ThemeToggle />

        <div className="relative">
          <button
            type="button"
            onClick={() => {
              const willOpen = !showMessagesMenu;
              setShowMessagesMenu(willOpen);
              setShowNotificationsMenu(false);
              setShowUserMenu(false);
              if (willOpen) {
                setUnreadMessagesCount(0);
                void markDashboardNotificationsRead("message")
                  .then(loadFeeds)
                  .then(() => setUnreadMessagesCount(0))
                  .catch(() => {
                    // A leitura local já foi aplicada; a próxima carga reconcilia.
                  });
              }
            }}
            className="relative flex h-10 w-10 items-center justify-center rounded-full border border-border bg-card text-foreground transition-colors hover:bg-muted"
            aria-label="Mensagens"
            title="Mensagens"
          >
            <Mail className="h-5 w-5" />
            {unreadMessagesCount > 0 ? (
              <span className="absolute right-2 top-2 h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-card" />
            ) : null}
          </button>

          {showMessagesMenu ? (
            <div className="absolute right-0 mt-3 w-[min(286px,calc(100vw-1.5rem))] rounded-xl border border-border bg-card p-4 text-sm text-foreground shadow-xl">
              <div className="flex items-center justify-between border-b border-border pb-3">
                <span className="font-bold">Caixa de Mensagens</span>
                <span className="text-xs font-bold text-primary">
                  {unreadMessagesCount > 0
                    ? `${unreadMessagesCount} novas`
                    : "Lidas"}
                </span>
              </div>
              <div className="space-y-4 pt-4">
                {menuMessages.length > 0 ? (
                  menuMessages.map((message) => (
                    <button
                      key={message.id}
                      type="button"
                      onClick={() => {
                        setSelectedMessage(message);
                        setShowMessagesMenu(false);
                      }}
                      className="block w-full rounded-md text-left transition-colors hover:bg-muted/60"
                    >
                      <div className="flex items-start justify-between gap-3 text-xs">
                        <span className="font-bold">{message.sender}</span>
                        <span className="shrink-0 text-muted-foreground">
                          {message.date}
                        </span>
                      </div>
                      <p className="mt-1 text-xs leading-5 text-slate-600 dark:text-slate-300">
                        {message.text}
                      </p>
                    </button>
                  ))
                ) : (
                  <p className="text-xs leading-5 text-slate-600 dark:text-slate-300">
                    Nenhuma mensagem recente.
                  </p>
                )}
              </div>
            </div>
          ) : null}
        </div>

        <div className="relative">
          <button
            type="button"
            onClick={() => {
              const willOpen = !showNotificationsMenu;
              setShowNotificationsMenu(willOpen);
              setShowMessagesMenu(false);
              setShowUserMenu(false);
              if (willOpen) {
                setUnreadCount(0);
                void markDashboardNotificationsRead("notification")
                  .then(loadFeeds)
                  .then(() => setUnreadCount(0))
                  .catch(() => {
                    // A leitura local já foi aplicada; a próxima carga reconcilia.
                  });
              }
            }}
            className="relative flex h-10 w-10 items-center justify-center rounded-full border border-border bg-card text-foreground transition-colors hover:bg-muted"
            aria-label="Notificações"
            title="Notificações"
          >
            <Bell className="h-5 w-5" />
            {unreadCount > 0 ? (
              <span className="absolute right-2 top-2 h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-card" />
            ) : null}
          </button>

          {showNotificationsMenu ? (
            <div className="absolute right-0 mt-3 w-[min(286px,calc(100vw-1.5rem))] rounded-xl border border-border bg-card p-4 text-sm text-foreground shadow-xl">
              <div className="flex items-center justify-between border-b border-border pb-3">
                <span className="font-bold">Notificações Recentes</span>
                <button
                  type="button"
                  onClick={() => {
                    setUnreadCount(0);
                    setMenuNotifications([]);
                    void clearDashboardNotifications("notification").catch(() => {
                      // A limpeza local já foi aplicada; a próxima carga reconcilia.
                    });
                  }}
                  className="text-xs text-slate-400 hover:text-foreground"
                >
                  Limpar
                </button>
              </div>
              <div className="space-y-5 pt-4">
          {menuNotifications.length > 0 ? (
            menuNotifications.map((notification) => {
              const jobId = notification.jobId;
              const isRead = notification.isRead ?? false;
            return (
                <div
                  key={notification.id}
                  role={jobId ? "button" : undefined}
                  tabIndex={jobId ? 0 : undefined}
                  onClick={
                    jobId
                      ? () => {
                          setShowNotificationsMenu(false);
                          setMenuNotifications((current) =>
                          current.map((item) => item.id === notification.id ? { ...item, isRead: true } : item,),
                      );
                      void markSingleNotificationRead(String(notification.id)).catch(() => {
                        });
                          navigate(`/dashboard?jobId=${jobId}`);
                        }
                      : undefined
                  }
                  className={`flex gap-3 ${jobId ? "cursor-pointer hover:opacity-50" : ""} ${ isRead ? "opacity-50" : "" }`}
                >
                  <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${ isRead ? "bg-slate-400" : "bg-emerald-500" }`}
                  />
                  <div>
                    <p className="text-xs leading-5 text-slate-600 dark:text-slate-300">
                      {notification.text}
                    </p>
                    <span className="text-[11px] text-slate-400">
                      {notification.date}
                    </span>
                  </div>
                </div>
                );
                 })
                ) : (
                  <p className="text-xs leading-5 text-slate-600 dark:text-slate-300">
                    Nenhuma notificação recente.
                  </p>
                )}
              </div>
            </div>
          ) : null}
        </div>

        <div className="relative">
          <button
            type="button"
            onClick={() => {
              setShowUserMenu((current) => !current);
              setShowMessagesMenu(false);
              setShowNotificationsMenu(false);
            }}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-muted/45 p-0 text-left transition-colors hover:bg-muted md:h-12 md:w-auto md:justify-start md:gap-3 md:rounded-xl md:px-3 md:pr-2"
            aria-label="Menu do usuário"
          >
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt={`Avatar de ${displayName}`}
                className="h-8 w-8 shrink-0 rounded-full border border-border object-cover md:h-9 md:w-9"
              />
            ) : (
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground md:h-9 md:w-9">
                {initials}
              </span>
            )}
            <span className="hidden min-w-0 md:block">
              <span className="block max-w-36 truncate text-sm font-bold leading-4">
                {displayName}
              </span>
              <span className="block max-w-36 truncate text-xs text-muted-foreground">
                {accountLabel}
              </span>
            </span>
            <ChevronDown className="hidden h-4 w-4 shrink-0 text-muted-foreground md:block" />
          </button>

          {showUserMenu ? (
            <div className="absolute right-0 mt-3 w-[min(16rem,calc(100vw-1.5rem))] overflow-hidden rounded-xl border border-border bg-card text-sm text-foreground shadow-xl">
              <div className="border-b border-border px-4 py-3 text-xs text-muted-foreground">
                {accountLabel}
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowUserMenu(false);
                  navigate("/perfil");
                }}
                className="block w-full px-4 py-3 text-left hover:bg-muted"
              >
                Meu Perfil
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowUserMenu(false);
                  navigate("/ajuda");
                }}
                className="block w-full px-4 py-3 text-left hover:bg-muted"
              >
                Ajuda
              </button>
              <button
                type="button"
                onClick={logout}
                className="block w-full border-t border-border px-4 py-3 text-left text-rose-500 hover:bg-rose-500/10"
              >
                Sair da Conta
              </button>
            </div>
          ) : null}
        </div>
      </div>
      {selectedMessage ? (
        <MessageDetailModal
          message={selectedMessage}
          onClose={() => setSelectedMessage(null)}
        />
      ) : null}
    </header>
  );
}
