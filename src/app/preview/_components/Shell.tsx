import Link from "next/link";
import type { ReactNode } from "react";
import { GymAppLogo } from "@/components/ui/Logo";
import { cn } from "@/lib/utils";

const coachBrand = "FITCOACH STUDIO";

const nav = [
  { section: "Operación", items: [
    { label: "Dashboard", href: "/preview/dashboard" },
    { label: "Alumnos", href: "/preview/cliente" },
    { label: "Check-ins", href: "#" },
    { label: "Mensajes", href: "#", badge: 3 },
  ]},
  { section: "Construcción", items: [
    { label: "Programas", href: "#" },
    { label: "Builder", href: "/preview/builder" },
    { label: "Nutrición", href: "#" },
    { label: "Ejercicios", href: "#" },
  ]},
  { section: "Negocio", items: [
    { label: "Mi marca", href: "#" },
    { label: "Suscripción", href: "#" },
  ]},
];

export function Shell({ active, children, title, subtitle, actions }: {
  active: string;
  children: ReactNode;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="pv-shell">
      <aside className="pv-side">
        <Link href="/preview" className="pv-side-brand">
          <GymAppLogo className="h-9 w-[5.5rem] flex-shrink-0" />
          <div className="pv-side-brand-text">
            <p className="pv-eva-mark">EVA</p>
            <p className="pv-coach-brand">{coachBrand}</p>
          </div>
        </Link>

        {nav.map((group) => (
          <div key={group.section} className="pv-nav-group">
            <div className="pv-side-section">{group.section}</div>
            {group.items.map((item) => {
              const isActive = active === item.label;
              return (
                <Link
                  key={item.label}
                  href={item.href}
                  className={cn("pv-side-item", isActive && "pv-side-item-active")}
                >
                  <span
                    className={cn("pv-nav-dot", isActive && "pv-nav-dot-active")}
                    aria-hidden
                  />
                  <span className="pv-side-label">{item.label}</span>
                  {item.badge ? (
                    <span className="pv-badge">{item.badge}</span>
                  ) : null}
                </Link>
              );
            })}
          </div>
        ))}

        <div className="pv-side-footer">
          <div className="pv-terminal-label">Terminal</div>
          <div className="pv-coach-name">Juan Villegas</div>
          <div className="pv-theme-row" aria-hidden>
            <span className="pv-theme-icon">☀</span>
            <span className="pv-theme-icon dim">🌙</span>
          </div>
          <button type="button" className="pv-disconnect">
            → Desconectar
          </button>
        </div>
      </aside>

      <div className="pv-main">
        <header className="pv-topbar">
          <div>
            <h1 className="display pv-title">{title}</h1>
            {subtitle ? (
              <p className="pv-subtitle">{subtitle}</p>
            ) : null}
          </div>
          <div className="pv-topbar-actions">{actions}</div>
        </header>

        <div className="pv-content">{children}</div>
      </div>
    </div>
  );
}
