import Link from "next/link";

export default function Login2() {
  const marqueeItems = ["Coaching de élite", "Programación inteligente", "Retención del 94%", "2.800 coaches activos", "Check-ins en tiempo real", "Builder drag-drop", "Nutrición integrada", "Análisis de progreso"];

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      {/* Top bar */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "20px 48px", borderBottom: "3px solid var(--s-ink)", background: "var(--s-paper)" }}>
        <Link href="/preview2" className="display" style={{ fontSize: 32 }}>
          EV<span style={{ color: "var(--s-red)" }}>A</span>
        </Link>
        <nav style={{ display: "flex", gap: 32, alignItems: "center" }}>
          {["Producto", "Precios", "Blog", "Coaches"].map((l) => (
            <a key={l} href="#" className="label-caps" style={{ fontSize: 12 }}>{l}</a>
          ))}
          <button className="btn btn-ghost btn-sm">Ingresar</button>
          <button className="btn btn-primary btn-sm">Empezar gratis</button>
        </nav>
      </div>

      {/* Hero */}
      <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1fr 1fr", minHeight: 0 }}>
        {/* Left: hero copy */}
        <div style={{ background: "var(--s-ink)", color: "var(--s-paper)", padding: "64px 56px", display: "flex", flexDirection: "column", justifyContent: "space-between", position: "relative", overflow: "hidden" }}>
          {/* Decorative big number */}
          <div className="display" style={{ fontSize: 320, lineHeight: 1, position: "absolute", bottom: -40, right: -20, opacity: 0.05, color: "var(--s-paper)", userSelect: "none", pointerEvents: "none" }}>
            E
          </div>

          <div style={{ position: "relative", zIndex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 32 }}>
              <span className="live-dot" />
              <span className="label-caps" style={{ color: "rgba(255,255,255,0.55)", fontSize: 11 }}>2.847 coaches activos ahora</span>
            </div>
            <h1 className="display" style={{ fontSize: 96, lineHeight: 0.88 }}>
              CREA.
              <br />
              <span style={{ color: "var(--s-red)" }}>CRECIÓ.</span>
              <br />
              DOMINÓ.
            </h1>
            <p style={{ fontSize: 18, lineHeight: 1.6, opacity: 0.65, marginTop: 28, maxWidth: 420 }}>
              La plataforma que convierte coaches buenos en referentes de su industria. Sin plantillas genéricas. Sin excusas.
            </p>
          </div>

          {/* Stats row */}
          <div style={{ position: "relative", zIndex: 1, display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 0, borderTop: "2px solid rgba(255,255,255,0.12)", paddingTop: 32 }}>
            {[
              { val: "2.8K", label: "Coaches" },
              { val: "94%", label: "Retención" },
              { val: "$6.2M", label: "MRR generado" },
            ].map((s, i) => (
              <div key={s.label} style={{ borderRight: i < 2 ? "2px solid rgba(255,255,255,0.12)" : "none", paddingRight: 20, paddingLeft: i > 0 ? 20 : 0 }}>
                <div className="big-num" style={{ fontSize: 48, color: i === 0 ? "var(--s-lime)" : "var(--s-paper)" }}>{s.val}</div>
                <div className="label-caps" style={{ color: "rgba(255,255,255,0.4)", marginTop: 6 }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Right: form */}
        <div style={{ background: "var(--s-paper)", padding: "64px 56px", display: "flex", flexDirection: "column", justifyContent: "center", borderLeft: "3px solid var(--s-ink)" }}>
          <div style={{ maxWidth: 380 }}>
            <span className="tag tag-red" style={{ marginBottom: 24, display: "inline-flex" }}>Acceso coaches</span>
            <h2 className="display" style={{ fontSize: 52 }}>ENTRÁ<br />AL PANEL</h2>
            <p style={{ fontSize: 14, color: "var(--s-ink-3)", marginTop: 12, marginBottom: 32, lineHeight: 1.5 }}>
              Tu próxima sesión de alumnos ya está esperando.
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <div className="label-caps" style={{ marginBottom: 6 }}>Email</div>
                <input className="input" placeholder="tu@email.com" defaultValue="javier@evacoach.com" />
              </div>
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                  <span className="label-caps">Contraseña</span>
                  <a href="#" style={{ fontSize: 11, fontWeight: 700, color: "var(--s-red)", textTransform: "uppercase", letterSpacing: "0.06em" }}>¿Olvidaste?</a>
                </div>
                <input className="input" type="password" defaultValue="signalrules" />
              </div>

              <button className="btn btn-primary btn-lg" style={{ marginTop: 8 }}>
                Entrar →
              </button>

              <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "8px 0" }}>
                <div style={{ flex: 1, height: 2, background: "var(--s-ink)" }} />
                <span className="label-caps">O</span>
                <div style={{ flex: 1, height: 2, background: "var(--s-ink)" }} />
              </div>

              <button className="btn btn-ghost" style={{ width: "100%" }}>Continuar con Google</button>

              <p style={{ fontSize: 12, color: "var(--s-ink-3)", textAlign: "center", marginTop: 8 }}>
                ¿No tenés cuenta?{" "}
                <a href="#" style={{ color: "var(--s-red)", fontWeight: 700 }}>Probá gratis 14 días</a>
              </p>
            </div>

            {/* Social proof */}
            <div style={{ marginTop: 36, paddingTop: 24, borderTop: "2px solid var(--s-ink)", display: "flex", alignItems: "center", gap: 14 }}>
              <div style={{ display: "flex" }}>
                {["MH", "LF", "TR", "SP"].map((i, idx) => (
                  <div key={i} className="avatar" style={{ width: 32, height: 32, fontSize: 11, marginLeft: idx > 0 ? -8 : 0, border: "2px solid var(--s-paper)", zIndex: 4 - idx }}>
                    {i}
                  </div>
                ))}
              </div>
              <div style={{ fontSize: 12, color: "var(--s-ink-3)", lineHeight: 1.4 }}>
                <strong style={{ color: "var(--s-ink)" }}>+2.800 coaches</strong> ya gestionan sus alumnos con EVA.
              </div>
            </div>

            <Link href="/preview2" style={{ display: "block", marginTop: 32, fontSize: 11, color: "var(--s-ink-3)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 700 }}>
              ← Volver al índice
            </Link>
          </div>
        </div>
      </div>

      {/* Marquee bottom */}
      <div className="marquee-wrap" style={{ flexShrink: 0 }}>
        <div className="marquee-inner">
          {[...marqueeItems, ...marqueeItems].map((item, i) => (
            <span key={i} className="marquee-item">{item}</span>
          ))}
        </div>
      </div>
    </div>
  );
}
