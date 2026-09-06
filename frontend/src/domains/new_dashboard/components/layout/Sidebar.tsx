import { cn } from "@/shared/lib/utils";
import { LogOut } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "@/domains/auth/application/AuthContext";
import { CandidateLogo } from "../shared/CandidateLogo";
import { Icons } from "../shared/Icons";

const items = [
  { label: "Início", to: "/home", icon: Icons.Home },
  { label: "Dashboard", to: "/dashboard", icon: Icons.Dashboard },
  { label: "Vagas", to: "/vagas", icon: Icons.Vagas },
  { label: "Mentoria", to: "/mentoria", icon: Icons.Mentoria },
  { label: "Relatórios", to: "/relatorios", icon: Icons.Relatorios },
];

const footerItems = [
  { label: "Perfil", to: "/perfil", icon: Icons.Perfil },
  { label: "Ajuda", to: "/ajuda", icon: Icons.Ajuda },
];

export function Sidebar() {
  const location = useLocation();
  const { logout } = useAuth();

  return (
    <aside className="hidden h-screen w-[236px] shrink-0 flex-col border-r border-border bg-card px-4 pb-6 pt-3 lg:flex">
      <div className="px-2 py-2">
        <CandidateLogo size="md" />
      </div>

      <nav className="mt-4 flex flex-1 flex-col gap-2">
        {items.map((item) => {
          const Icon = item.icon;
          const active = location.pathname === item.to;

          return (
            <Link
              key={item.to}
              to={item.to}
              className={cn(
                "flex h-10 items-center gap-3 rounded-md px-3 text-sm font-semibold transition-colors",
                active
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-slate-500 hover:bg-muted hover:text-foreground dark:text-slate-300",
              )}
            >
              <Icon className="h-5 w-5" />
              {item.label}
            </Link>
          );
        })}

        <div className="mt-auto border-t border-dashed border-border/70 pt-5">
          <div className="flex flex-col gap-2">
            {footerItems.map((item) => {
              const Icon = item.icon;
              const active = location.pathname === item.to;

              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={cn(
                    "flex h-10 items-center gap-3 rounded-md px-3 text-sm font-semibold transition-colors",
                    active
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-slate-500 hover:bg-muted hover:text-foreground dark:text-slate-300",
                  )}
                >
                  <Icon className="h-5 w-5" />
                  {item.label}
                </Link>
              );
            })}

            <button
              type="button"
              onClick={logout}
              className="flex h-10 items-center gap-3 rounded-md px-3 text-sm font-semibold text-rose-500 transition-colors hover:bg-rose-500/10"
            >
              <LogOut className="h-5 w-5" />
              Sair
            </button>
          </div>
        </div>
      </nav>
    </aside>
  );
}
