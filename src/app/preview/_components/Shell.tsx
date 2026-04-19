import Link from "next/link";
import type { ReactNode } from "react";

const nav = [
  { section: "Operación", items: [
    { label: "Dashboard", icon: "◧", href: "/preview/dashboard" },
    { label: "Clientes", icon: "◔", href: "/preview/cliente" },
    { label: "Check-ins", icon: "✓", href: "#" },
    { label: "Mensajes", icon: "✎", href: "#", badge: 3 },
  ]},
  { section: "Construcción", items: [
    { label: "Builder", icon: "▦", href: "/preview/builder" },
    { label: "Templates", icon: "⬚", href: "#" },
    { label: "Nutrición", icon: "◉", href: "#" },
    { label: "Ejercicios", icon: "⚡", href: "#" },
  ]},
  { section: "Negocio", items: [
    { label: "Planes", icon: "$", href: "#" },
    { label: "Ajustes", icon: "⚙", href: "#" },
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
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <aside className="side">
        <Link href="/preview" className="side-logo">
          <span className="mark" />
          EVA
        </Link>

        {nav.map((group) => (
          <div key={group.section}>
            <div className="side-section">{group.section}</div>
            {group.items.map((item) => (
              <Link
                key={item.label}
                href={item.href}
                className={`side-item ${active === item.label ? "active" : ""}`}
              >
                <span style={{ width: 18, textAlign: "center", opacity: 0.9 }}>{item.icon}</span>
                <span style={{ flex: 1 }}>{item.label}</span>
                {item.badge ? (
                  <span style={{
                    background: "var(--c-primary)",
                    color: "#fff",
                    fontSize: 10,
                    fontWeight: 700,
                    padding: "2px 7px",
                    borderRadius: 999,
                  }}>{item.badge}</span>
                ) : null}
              </Link>
            ))}
          </div>
        ))}

        <div style={{ marginTop: "auto", padding: 12, display: "flex", alignItems: "center", gap: 10, borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: 16 }}>
          <div className="avatar" style={{ width: 32, height: 32, fontSize: 11 }}>JM</div>
          <div style={{ fontSize: 13, lineHeight: 1.2 }}>
            <div style={{ fontWeight: 600 }}>Javier Morales</div>
            <div style={{ opacity: 0.5, fontSize: 11 }}>Head Coach</div>
          </div>
        </div>
      </aside>

      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        <header className="topbar">
          <div>
            <h1 className="display" style={{ fontSize: 24 }}>{title}</h1>
            {subtitle && <p style={{ fontSize: 13, color: "var(--c-muted-fg)", marginTop: 2 }}>{subtitle}</p>}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {actions}
          </div>
        </header>

        <div style={{ flex: 1, padding: "28px 32px 60px", background: "var(--c-bg)" }}>
          {children}
        </div>
      </div>
    </div>
  );
}
