import Link from "next/link";

export default function LoginPreview() {
  return (
    <div style={{ minHeight: "100vh", display: "grid", gridTemplateColumns: "1fr 1fr" }}>
      {/* Left: hero dark */}
      <div style={{
        background: "var(--c-dark)",
        color: "var(--c-dark-fg)",
        padding: "56px 64px",
        display: "flex",
        flexDirection: "column",
        position: "relative",
        overflow: "hidden",
      }}>
        {/* Background ornaments */}
        <div style={{
          position: "absolute",
          top: -120, right: -120,
          width: 420, height: 420,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(107,33,254,0.5) 0%, rgba(107,33,254,0) 70%)",
          filter: "blur(20px)",
        }} />
        <div style={{
          position: "absolute",
          bottom: -140, left: -100,
          width: 380, height: 380,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(0,245,196,0.3) 0%, rgba(0,245,196,0) 70%)",
          filter: "blur(30px)",
        }} />

        <Link href="/preview" className="side-logo" style={{ padding: 0, color: "#fff", zIndex: 1 }}>
          <span className="mark" />
          EVA
        </Link>

        <div style={{ marginTop: "auto", zIndex: 1, position: "relative" }}>
          <span className="chip chip-accent" style={{ marginBottom: 28 }}>
            <span className="dot dot-live" />
            Para coaches de élite
          </span>
          <h1 className="display" style={{ fontSize: 64, lineHeight: 1, letterSpacing: "-0.04em" }}>
            La plataforma<br />
            que tus<br />
            <span style={{
              background: "linear-gradient(90deg, #00F5C4 0%, #8B5BFF 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}>clientes merecen.</span>
          </h1>
          <p style={{ fontSize: 17, opacity: 0.7, marginTop: 24, maxWidth: 460, lineHeight: 1.6 }}>
            Programa, nutrí, analizá y hacé crecer tu negocio desde un solo lugar.
            Diseñado para coaches que no aceptan plantillas genéricas.
          </p>

          <div style={{ display: "flex", gap: 36, marginTop: 56, paddingTop: 36, borderTop: "1px solid rgba(255,255,255,0.1)" }}>
            <div>
              <div className="display mono" style={{ fontSize: 32, color: "var(--c-accent)" }}>2.8K+</div>
              <div style={{ fontSize: 12, opacity: 0.55, marginTop: 2 }}>Coaches activos</div>
            </div>
            <div>
              <div className="display mono" style={{ fontSize: 32 }}>94%</div>
              <div style={{ fontSize: 12, opacity: 0.55, marginTop: 2 }}>Retención mensual</div>
            </div>
            <div>
              <div className="display mono" style={{ fontSize: 32 }}>48h</div>
              <div style={{ fontSize: 12, opacity: 0.55, marginTop: 2 }}>Setup completo</div>
            </div>
          </div>
        </div>
      </div>

      {/* Right: form */}
      <div style={{
        background: "var(--c-bg)",
        padding: "56px 64px",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
      }}>
        <div style={{ maxWidth: 400, width: "100%", margin: "0 auto" }}>
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 48 }}>
            <span style={{ fontSize: 13, color: "var(--c-muted-fg)" }}>
              ¿No tenés cuenta?{" "}
              <a href="#" style={{ color: "var(--c-primary)", fontWeight: 600 }}>Probar gratis</a>
            </span>
          </div>

          <h2 className="display" style={{ fontSize: 40, letterSpacing: "-0.03em" }}>Bienvenido.</h2>
          <p style={{ fontSize: 15, color: "var(--c-muted-fg)", marginTop: 8, marginBottom: 36 }}>
            Entrá a tu panel y seguí haciendo crecer tu roster.
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: "var(--c-muted-fg)", display: "block", marginBottom: 6 }}>
                Email
              </label>
              <input className="input" placeholder="tu@email.com" defaultValue="javier@evacoach.com" />
            </div>
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--c-muted-fg)" }}>Contraseña</label>
                <a href="#" style={{ fontSize: 12, color: "var(--c-primary)", fontWeight: 600 }}>¿Olvidaste?</a>
              </div>
              <input className="input" type="password" placeholder="••••••••" defaultValue="carbonathlete" />
            </div>

            <button className="btn btn-primary btn-lg" style={{ marginTop: 12, width: "100%" }}>
              Entrar al panel
            </button>

            <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "16px 0" }}>
              <div style={{ flex: 1, height: 1, background: "var(--c-border)" }} />
              <span style={{ fontSize: 11, color: "var(--c-muted-fg)", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase" }}>O con</span>
              <div style={{ flex: 1, height: 1, background: "var(--c-border)" }} />
            </div>

            <button className="btn btn-ghost" style={{ width: "100%", height: 44 }}>
              Continuar con Google
            </button>
          </div>

          <Link href="/preview" style={{ display: "block", marginTop: 48, fontSize: 12, color: "var(--c-muted-fg)", textAlign: "center" }}>
            ← Volver al índice de preview
          </Link>
        </div>
      </div>
    </div>
  );
}
