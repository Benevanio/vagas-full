import { cn } from "@/shared/lib/utils";
import { Link, useLocation } from "react-router-dom";
import { Icons } from "../shared/Icons";

const tabs = [
  { label: "Início", to: "/home", icon: Icons.Home },
  { label: "Dashboard", to: "/dashboard", icon: Icons.Dashboard },
  { label: "Vagas", to: "/vagas", icon: Icons.Vagas },
  { label: "Mentoria", to: "/mentoria", icon: Icons.Mentoria },
  { label: "Relatórios", to: "/relatorios", icon: Icons.Relatorios },
];

export function MobileTabBar() {
  const location = useLocation();

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 px-2 pt-1.5 shadow-[0_-8px_24px_rgba(0,0,0,0.12)] backdrop-blur lg:hidden"
      style={{
        paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))",
      }}
      aria-label="Navegação principal mobile"
    >
      <div className="mx-auto grid max-w-lg grid-cols-5 gap-1">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const active = location.pathname === tab.to;

          return (
            <Link
              key={tab.to}
              to={tab.to}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-1 py-1.5 text-[11px] font-semibold transition-colors",
                active
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <Icon
                className="h-5 w-5 shrink-0"
                strokeWidth={active ? 2.5 : 2}
              />
              <span className="max-w-full truncate">{tab.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
