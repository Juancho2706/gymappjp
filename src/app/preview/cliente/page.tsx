import { Shell } from "../_components/Shell";
import { clientDetail } from "../_data/mock";

const progressData = [58, 59, 59.5, 60.2, 60.8, 61.4, 61.9, 62.4];
const progressLabels = ["S1", "S2", "S3", "S4", "S5", "S6", "S7", "S8"];

export default function ClientePreview() {
  const max = Math.max(...progressData);
  const min = Math.min(...progressData);
  const points = progressData.map((v, i) => {
    const x = (i / (progressData.length - 1)) * 100;
    const y = 100 - ((v - min) / (max - min)) * 80 - 10;
    return `${x},${y}`;
  }).join(" ");

  return (
    <Shell
      active="Clientes"
      title={clientDetail.name}
      subtitle={`Cliente desde ${clientDetail.since} · ${clientDetail.goal}`}
      actions={
        <>
          <button className="btn btn-ghost btn-sm">Mensaje</button>
          <button className="btn btn-ghost btn-sm">Check-in</button>
          <button className="btn btn-primary btn-sm">Editar plan</button>
        </>
      }
    >
      {/* Hero client card */}
      <div className="surface-dark" style={{ padding: 32, display: "flex", alignItems: "center", gap: 32 }}>
        <div className="avatar avatar-lg" style={{ width: 96, height: 96, fontSize: 36 }}>
          {clientDetail.initials}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
            <span className="chip chip-dark">{clientDetail.age} años</span>
            <span className="chip chip-accent">🔥 {clientDetail.streak} días</span>
            <span className="chip chip-dark">Próxima: {clientDetail.nextSession}</span>
          </div>
          <div className="display" style={{ fontSize: 36 }}>{clientDetail.name}</div>
          <div style={{ fontSize: 14, opacity: 0.65, marginTop: 6 }}>{clientDetail.goal}</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", opacity: 0.5 }}>
            Adherencia 8S
          </div>
          <div className="display mono" style={{ fontSize: 64, color: "var(--c-accent)", lineHeight: 1 }}>
            {clientDetail.adherence}%
          </div>
        </div>
      </div>

      {/* Metrics grid */}
      <div className="grid-4" style={{ marginTop: 16 }}>
        {clientDetail.metrics.map((m) => (
          <div key={m.label} className="stat">
            <div className="label">{m.label}</div>
            <div className="val mono">{m.value}</div>
            <div className="delta" style={{ color: "var(--c-success)" }}>{m.delta} (8S)</div>
          </div>
        ))}
      </div>

      {/* Progress chart + check-ins */}
      <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: 16, marginTop: 16 }}>
        <div className="surface" style={{ padding: 24 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
            <div>
              <div className="label" style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--c-muted-fg)" }}>
                Progreso de peso · 8 semanas
              </div>
              <div className="display" style={{ fontSize: 22, marginTop: 4 }}>+4.4 kg masa</div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <span className="chip chip-primary">Peso</span>
              <span className="chip">% Grasa</span>
              <span className="chip">Medidas</span>
            </div>
          </div>

          <div style={{ position: "relative", height: 200 }}>
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ width: "100%", height: "100%" }}>
              <defs>
                <linearGradient id="gradLine" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="rgba(107,33,254,0.3)" />
                  <stop offset="100%" stopColor="rgba(107,33,254,0)" />
                </linearGradient>
              </defs>
              <polygon fill="url(#gradLine)" points={`0,100 ${points} 100,100`} />
              <polyline
                fill="none"
                stroke="var(--c-primary)"
                strokeWidth="0.8"
                vectorEffect="non-scaling-stroke"
                points={points}
              />
              {progressData.map((v, i) => {
                const x = (i / (progressData.length - 1)) * 100;
                const y = 100 - ((v - min) / (max - min)) * 80 - 10;
                return <circle key={i} cx={x} cy={y} r="0.8" fill="var(--c-primary)" vectorEffect="non-scaling-stroke" stroke="#fff" strokeWidth="0.5" />;
              })}
            </svg>
            <div style={{ position: "absolute", top: 0, right: 0, textAlign: "right" }}>
              <div className="mono" style={{ fontSize: 11, color: "var(--c-muted-fg)" }}>62.4 kg</div>
              <div className="mono" style={{ fontSize: 11, color: "var(--c-muted-fg)", marginTop: 120 }}>58.0 kg</div>
            </div>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 12, paddingLeft: 4 }}>
            {progressLabels.map((l) => (
              <span key={l} className="mono" style={{ fontSize: 11, color: "var(--c-muted-fg)" }}>{l}</span>
            ))}
          </div>
        </div>

        <div className="surface" style={{ padding: 24 }}>
          <div className="label" style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--c-muted-fg)" }}>
            Check-ins recientes
          </div>
          <div className="display" style={{ fontSize: 20, marginTop: 4, marginBottom: 20 }}>
            3 últimos
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {clientDetail.checkins.map((c, i) => (
              <div key={i} style={{ paddingBottom: 16, borderBottom: i < 2 ? "1px solid var(--c-border)" : "none" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <span style={{ fontSize: 18 }}>
                    {c.mood === "great" ? "🟢" : c.mood === "good" ? "🟡" : "🟠"}
                  </span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: "var(--c-muted-fg)" }}>{c.date}</span>
                </div>
                <p style={{ fontSize: 13, lineHeight: 1.5 }}>{c.text}</p>
              </div>
            ))}
          </div>
          <button className="btn btn-ghost btn-sm" style={{ marginTop: 16, width: "100%" }}>Ver todos los check-ins →</button>
        </div>
      </div>

      {/* Plan actual placeholder */}
      <div className="surface" style={{ padding: 24, marginTop: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div className="label" style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--c-muted-fg)" }}>
              Plan actual
            </div>
            <div className="display" style={{ fontSize: 22, marginTop: 4 }}>Hipertrofia · 12 Semanas</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div>
              <div style={{ fontSize: 11, color: "var(--c-muted-fg)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em" }}>Semana 8 / 12</div>
              <div className="bar" style={{ width: 220, marginTop: 6 }}>
                <span style={{ width: "66%" }} />
              </div>
            </div>
            <button className="btn btn-primary btn-sm">Abrir en builder</button>
          </div>
        </div>
      </div>
    </Shell>
  );
}
