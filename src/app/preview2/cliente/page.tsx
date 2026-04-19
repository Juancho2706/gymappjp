import { Shell2 } from "../_components/Shell2";
import { clientDetail } from "../../preview/_data/mock";

const progressData = [58, 59, 59.5, 60.2, 60.8, 61.4, 61.9, 62.4];
const progressLabels = ["S1", "S2", "S3", "S4", "S5", "S6", "S7", "S8"];

export default function Cliente2() {
  const max = Math.max(...progressData);
  const min = Math.min(...progressData);

  return (
    <Shell2
      active="Clientes"
      title={clientDetail.name.toUpperCase()}
      subtitle="Semana 8 · Hipertrofia 12S"
      actions={
        <>
          <button className="btn btn-ghost btn-sm">Mensaje</button>
          <button className="btn btn-ink btn-sm">Check-in</button>
          <button className="btn btn-primary btn-sm">Editar plan</button>
        </>
      }
    >
      {/* Identity strip */}
      <div className="card" style={{ display: "grid", gridTemplateColumns: "auto 1fr auto auto", gap: 0, marginBottom: 20, overflow: "hidden" }}>
        {/* Avatar block */}
        <div style={{ padding: "28px 24px", borderRight: "3px solid var(--s-ink)", background: "var(--s-ink)", display: "flex", alignItems: "center" }}>
          <div className="avatar avatar-lg" style={{ width: 80, height: 80, fontSize: 28, background: "var(--s-red)", border: "3px solid var(--s-paper)" }}>
            {clientDetail.initials}
          </div>
        </div>

        {/* Name + tags */}
        <div style={{ padding: "28px 28px", borderRight: "3px solid var(--s-ink)" }}>
          <h2 className="display" style={{ fontSize: 44 }}>{clientDetail.name.toUpperCase()}</h2>
          <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
            <span className="tag">{clientDetail.age} años</span>
            <span className="tag tag-red">{clientDetail.goal}</span>
            <span className="tag">Desde {clientDetail.since}</span>
          </div>
        </div>

        {/* Streak */}
        <div style={{ padding: "28px 24px", borderRight: "3px solid var(--s-ink)", textAlign: "center", display: "flex", flexDirection: "column", justifyContent: "center", background: "var(--s-lime)", minWidth: 120 }}>
          <div className="label-caps" style={{ fontSize: 9 }}>Racha</div>
          <div className="big-num" style={{ fontSize: 56 }}>{clientDetail.streak}</div>
          <div className="label-caps" style={{ fontSize: 9 }}>DÍAS</div>
        </div>

        {/* Adherence */}
        <div style={{ padding: "28px 24px", textAlign: "center", display: "flex", flexDirection: "column", justifyContent: "center", background: "var(--s-red)", color: "var(--s-paper)", minWidth: 140 }}>
          <div className="label-caps" style={{ fontSize: 9, color: "rgba(255,255,255,0.7)" }}>Adherencia 8S</div>
          <div className="big-num" style={{ fontSize: 64 }}>{clientDetail.adherence}%</div>
          <div className="label-caps" style={{ fontSize: 9, color: "rgba(255,255,255,0.7)" }}>PROMEDIO</div>
        </div>
      </div>

      {/* Metrics + progress */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1.4fr", gap: 16, marginBottom: 20 }}>
        {/* Metrics list — editorial style */}
        <div className="card" style={{ overflow: "hidden" }}>
          <div style={{ padding: "16px 24px", borderBottom: "2px solid var(--s-ink)", background: "var(--s-ink)" }}>
            <div className="display" style={{ fontSize: 18, color: "var(--s-paper)" }}>MEDICIONES</div>
          </div>
          {clientDetail.metrics.map((m, i) => (
            <div key={m.label} style={{
              display: "grid", gridTemplateColumns: "1fr 1fr 1fr",
              gap: 0, padding: "16px 24px",
              borderBottom: i < clientDetail.metrics.length - 1 ? "1px solid var(--s-ink)" : "none",
            }}>
              <div className="label-caps">{m.label}</div>
              <div className="mono" style={{ fontWeight: 700, fontSize: 20 }}>{m.value}</div>
              <div style={{ color: "var(--s-lime-dark)", fontWeight: 700, fontSize: 12, fontFamily: "var(--s-font-display)", textTransform: "uppercase" }}>
                ↑ {m.delta}
              </div>
            </div>
          ))}
        </div>

        {/* Progress chart — ink style */}
        <div className="card" style={{ padding: 24 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
            <div>
              <div className="label-caps">Progreso de peso</div>
              <div className="display" style={{ fontSize: 26, marginTop: 4 }}>+4.4 KG MASA</div>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <button className="btn btn-primary btn-sm">Peso</button>
              <button className="btn btn-ghost btn-sm">Grasa</button>
            </div>
          </div>

          <div style={{ position: "relative", height: 160 }}>
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ width: "100%", height: "100%" }}>
              <defs>
                <pattern id="hatch" patternUnits="userSpaceOnUse" width="4" height="4">
                  <line x1="0" y1="4" x2="4" y2="0" stroke="rgba(15,15,15,0.1)" strokeWidth="0.5" />
                </pattern>
              </defs>

              {/* Area fill with hatching */}
              {(() => {
                const pts = progressData.map((v, i) => {
                  const x = (i / (progressData.length - 1)) * 100;
                  const y = 100 - ((v - min) / (max - min)) * 80 - 10;
                  return `${x},${y}`;
                });
                return (
                  <>
                    <polygon fill="url(#hatch)" points={`0,100 ${pts.join(" ")} 100,100`} />
                    <polyline fill="none" stroke="var(--s-ink)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" points={pts.join(" ")} />
                    {progressData.map((v, i) => {
                      const x = (i / (progressData.length - 1)) * 100;
                      const y = 100 - ((v - min) / (max - min)) * 80 - 10;
                      return <rect key={i} x={x - 1} y={y - 1} width="2" height="2" fill={i === progressData.length - 1 ? "var(--s-red)" : "var(--s-ink)"} vectorEffect="non-scaling-stroke" />;
                    })}
                  </>
                );
              })()}
            </svg>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 10 }}>
            {progressLabels.map((l) => (
              <span key={l} className="label-caps" style={{ fontSize: 9 }}>{l}</span>
            ))}
          </div>
        </div>
      </div>

      {/* Check-ins — editorial newspaper layout */}
      <div className="card" style={{ overflow: "hidden" }}>
        <div style={{ padding: "16px 24px", borderBottom: "2px solid var(--s-ink)", background: "var(--s-ink)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div className="display" style={{ fontSize: 18, color: "var(--s-paper)" }}>CHECK-INS RECIENTES</div>
          <button className="btn btn-ghost btn-sm" style={{ color: "var(--s-paper)", borderColor: "rgba(255,255,255,0.2)" }}>Ver todos →</button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)" }}>
          {clientDetail.checkins.map((c, i) => (
            <div key={i} style={{ padding: 24, borderRight: i < 2 ? "2px solid var(--s-ink)" : "none" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <span className="tag" style={{ fontSize: 11 }}>{c.date}</span>
                <span style={{ fontSize: 20 }}>
                  {c.mood === "great" ? "●" : c.mood === "good" ? "◐" : "○"}
                </span>
              </div>
              <div className={`tag ${c.mood === "great" ? "tag-lime" : c.mood === "good" ? "" : "tag-red"}`} style={{ marginBottom: 12, fontSize: 10 }}>
                {c.mood === "great" ? "EXCELENTE" : c.mood === "good" ? "BUENO" : "REGULAR"}
              </div>
              <p style={{ fontSize: 13, lineHeight: 1.6 }}>{c.text}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Plan block */}
      <div style={{ marginTop: 16, display: "grid", gridTemplateColumns: "1fr auto", gap: 0, border: "3px solid var(--s-ink)", background: "var(--s-paper)" }}>
        <div style={{ padding: "20px 24px", borderRight: "3px solid var(--s-ink)" }}>
          <div className="label-caps">Plan actual</div>
          <div className="display" style={{ fontSize: 28, marginTop: 4 }}>HIPERTROFIA · 12 SEMANAS</div>
        </div>
        <div style={{ padding: "20px 24px", display: "flex", alignItems: "center", gap: 20 }}>
          <div>
            <div className="label-caps">Semana 8 de 12</div>
            <div className="bar bar-ink" style={{ width: 200, marginTop: 8, height: 10 }}>
              <span style={{ width: "66%" }} />
            </div>
          </div>
          <button className="btn btn-primary">Abrir builder →</button>
        </div>
      </div>
    </Shell2>
  );
}
