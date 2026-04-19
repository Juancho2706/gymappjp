import Link from "next/link";

const screens = [
  {
    href: "/preview/login",
    title: "Landing / Login",
    desc: "Primera impresión. Hero oscuro, branding Carbon Athlete, CTA.",
    tag: "Entrada",
  },
  {
    href: "/preview/dashboard",
    title: "Dashboard Coach",
    desc: "Vista principal del coach: métricas, clientes activos, actividad.",
    tag: "Home",
  },
  {
    href: "/preview/cliente",
    title: "Detalle Cliente",
    desc: "Perfil 360: progreso, check-ins, métricas, plan actual.",
    tag: "Cliente",
  },
  {
    href: "/preview/builder",
    title: "Workout Builder",
    desc: "Constructor de rutinas con bloques, drag-handle visual, RPE.",
    tag: "Herramienta",
  },
];

export default function PreviewIndex() {
  return (
    <main style={{ maxWidth: 1100, margin: "0 auto", padding: "64px 32px 120px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
        <div className="side-logo" style={{ padding: 0 }}>
          <span className="mark" />
          EVA
        </div>
        <span className="chip chip-primary">Preview · Carbon Athlete</span>
      </div>

      <h1 className="display" style={{ fontSize: 56, marginTop: 12, marginBottom: 16 }}>
        Rework visual —<br />
        <span style={{ color: "var(--c-primary)" }}>propuesta</span> navegable.
      </h1>
      <p style={{ fontSize: 18, color: "var(--c-muted-fg)", maxWidth: 640, lineHeight: 1.6 }}>
        Cuatro pantallas mock con el nuevo design system. No hay lógica ni backend — sólo cómo se
        vería y se sentiría la app si adoptamos el rework completo del plan.
      </p>

      <div className="grid-2" style={{ marginTop: 48, gap: 20 }}>
        {screens.map((s) => (
          <Link key={s.href} href={s.href} className="surface" style={{
            padding: 28,
            display: "flex",
            flexDirection: "column",
            gap: 12,
            transition: "transform 160ms ease, box-shadow 160ms ease",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span className="chip">{s.tag}</span>
              <span style={{ color: "var(--c-primary)", fontSize: 20, fontWeight: 700 }}>→</span>
            </div>
            <h2 className="display" style={{ fontSize: 26, marginTop: 8 }}>{s.title}</h2>
            <p style={{ color: "var(--c-muted-fg)", fontSize: 14, lineHeight: 1.5 }}>{s.desc}</p>
          </Link>
        ))}
      </div>

      <div style={{ marginTop: 64, padding: 24, borderRadius: 16, background: "var(--c-dark)", color: "var(--c-dark-fg)" }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", opacity: 0.5 }}>
          Nota
        </div>
        <p style={{ marginTop: 8, fontSize: 14, lineHeight: 1.6, opacity: 0.85 }}>
          Estas páginas son estáticas, aisladas en <code style={{ background: "rgba(255,255,255,0.08)", padding: "2px 6px", borderRadius: 4 }}>/preview</code>
          y no tocan el código de producción. El design system vive scoped en <code style={{ background: "rgba(255,255,255,0.08)", padding: "2px 6px", borderRadius: 4 }}>.preview-root</code>.
        </p>
      </div>
    </main>
  );
}
