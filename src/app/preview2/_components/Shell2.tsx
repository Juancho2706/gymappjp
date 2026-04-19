import Link from "next/link";
import type { ReactNode } from "react";

const nav = [
  { section: "Operación", items: [
    { label: "Dashboard", icon: "⊞", href: "/preview2/dashboard" },
    { label: "Clientes", icon: "◎", href: "/preview2/cliente" },
    { label: "Check-ins", icon: "✓", href: "#", badge: 32 },
    { label: "Mensajes", icon: "✎", href: "#", badge: 3 },
  ]},
  { section: "Construcción", items: [
    { label: "Builder", icon: "▤", href: "/preview2/builder" },
    { label: "Templates", icon: "⬚", href: "#" },
    { label: "Nutrición", icon: "◈", href: "#" },
    { label: "Ejercicios", icon: "⚡", href: "#" },
  ]},
  { section: "Negocio", items: [
    { label: "Planes", icon: "$", href: "#" },
    { label: "Ajustes", icon: "⚙", href: "#" },
  ]},
];

export function Shell2({ active, children, title, subtitle, actions }: {
  active: string;
  children: ReactNode;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      {/* Sidebar */}
      <aside className="side">
        <Link href="/preview2" className="side-logo">
          EV<span className="signal-mark">A</span>
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
                <span style={{ width: 20, opacity: 0.8 }}>{item.icon}</span>
                <span style={{ flex: 1 }}>{item.label}</span>
                {item.badge ? (
                  <span style={{
                    background: "var(--s-red)",
                    color: "#fff",
                    fontSize: 10,
                    fontWeight: 700,
                    padding: "2px 7px",
                    border: "1.5px solid rgba(255,255,255,0.2)",
                    borderRadius: "2px",
                    fontFamily: "var(--s-font-display)",
                  }}>{item.badge}</span>
                ) : null}
              </Link>
            ))}
          </div>
        ))}

        {/* Footer user */}
        <div style={{ marginTop: "auto", borderTop: "2px solid rgba(255,255,255,0.12)", padding: "16px 24px", display: "flex", alignItems: "center", gap: 12 }}>
          <div className="avatar" style={{ width: 32, height: 32, fontSize: 11 }}>JM</div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 13 }}>Javier Morales</div>
            <div style={{ fontSize: 11, opacity: 0.45 }}>Head Coach</div>
          </div>
        </div>
      </aside>

      {/* Main */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        <header className="topbar">
          <div style={{ display: "flex", alignItems: "baseline", gap: 16 }}>
            <h1 className="display" style={{ fontSize: 26 }}>{title}</h1>
            {subtitle && <p style={{ fontSize: 13, color: "var(--s-ink-3)", fontWeight: 500 }}>{subtitle}</p>}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {actions}
          </div>
        </header>

        <div style={{ flex: 1, padding: "28px 32px 60px", background: "var(--s-paper-2)" }}>
          {children}
        </div>
      </div>
    </div>
  );
}
