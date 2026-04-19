import Link from "next/link";

const screens = [
  { href: "/preview2/login", title: "Landing / Login", tag: "Entrada", desc: "Hero full-bleed brutalist, tipografía condensada, llamado a la acción agresivo." },
  { href: "/preview2/dashboard", title: "Dashboard Coach", tag: "Home", desc: "Números grandes, marquee live, tabla editorial, stats brutales." },
  { href: "/preview2/cliente", title: "Detalle Cliente", tag: "Cliente", desc: "Perfil editorial, gráfico ink-style, check-ins con jerarquía tipográfica." },
  { href: "/preview2/builder", title: "Workout Builder", tag: "Herramienta", desc: "Builder con bloques tipo newspaper grid, drag-handles, semana en tira." },
];

export default function Preview2Index() {
  return (
    <main style={{ maxWidth: 1000, margin: "0 auto", padding: "64px 32px 100px" }}>
      {/* Header */}
      <div style={{ borderBottom: "3px solid var(--s-ink)", paddingBottom: 24, marginBottom: 40, display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
        <div>
          <span className="tag tag-red" style={{ marginBottom: 14, display: "inline-flex" }}>Concepto alternativo</span>
          <h1 className="display" style={{ fontSize: 72 }}>
            EV<span style={{ color: "var(--s-red)" }}>A</span><br />
            SIGNAL
          </h1>
          <p style={{ marginTop: 16, fontSize: 16, color: "var(--s-ink-3)", maxWidth: 540, lineHeight: 1.6 }}>
            Sistema SIGNAL — neo-brutalismo editorial. Comparalo contra Carbon Athlete en{" "}
            <Link href="/preview" style={{ color: "var(--s-red)", fontWeight: 700 }}>/preview</Link>.
          </p>
        </div>
        <div style={{ textAlign: "right" }}>
          <div className="label-caps">Design system</div>
          <div className="display" style={{ fontSize: 20, marginTop: 4 }}>SIGNAL v1</div>
          <div style={{ display: "flex", gap: 8, marginTop: 12, justifyContent: "flex-end" }}>
            {["#FF3B1F", "#C1FF33", "#0F0F0F", "#FFFDF7"].map((c) => (
              <div key={c} style={{ width: 28, height: 28, background: c, border: "2px solid var(--s-ink)", boxShadow: "2px 2px 0 var(--s-ink)" }} />
            ))}
          </div>
        </div>
      </div>

      {/* Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        {screens.map((s, i) => (
          <Link key={s.href} href={s.href} className="card" style={{
            padding: 28,
            display: "flex",
            flexDirection: "column",
            gap: 14,
            transition: "transform 80ms ease, box-shadow 80ms ease",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span className="tag">{s.tag}</span>
              <span className="display" style={{ fontSize: 48, color: i === 0 ? "var(--s-red)" : "var(--s-ink)", opacity: 0.15 }}>
                0{i + 1}
              </span>
            </div>
            <h2 className="display" style={{ fontSize: 32 }}>{s.title}</h2>
            <p style={{ color: "var(--s-ink-3)", fontSize: 14, lineHeight: 1.5 }}>{s.desc}</p>
            <span className="btn btn-ghost btn-sm" style={{ alignSelf: "flex-start", marginTop: 8 }}>
              Ver pantalla →
            </span>
          </Link>
        ))}
      </div>

      {/* Compare note */}
      <div className="card-ink" style={{ padding: 24, marginTop: 36 }}>
        <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
          <div style={{ fontSize: 36 }}>↔</div>
          <div>
            <div className="label-caps" style={{ color: "rgba(255,255,255,0.5)" }}>Dos propuestas</div>
            <p style={{ marginTop: 4, fontSize: 14, opacity: 0.8, lineHeight: 1.5 }}>
              <strong>Carbon Athlete</strong> (violeta, premium, dark): <Link href="/preview" style={{ color: "var(--s-lime)", fontWeight: 700 }}>/preview</Link> ·{" "}
              <strong>Signal</strong> (rojo, brutalist, editorial): esta página.<br />
              Ninguna es funcional — son propuestas visuales puras.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
