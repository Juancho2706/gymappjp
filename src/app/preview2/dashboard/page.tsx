import { Shell2 } from "../_components/Shell2";
import { clients, weeklyLabels, weeklyActivity } from "../../preview/_data/mock";

const marqueeItems = ["87% adherencia promedio", "48 clientes activos", "🔴 3 en vivo ahora", "124 sesiones esta semana", "🟢 Sin pendientes críticos"];

export default function Dashboard2() {
  const max = Math.max(...weeklyActivity);

  return (
    <Shell2
      active="Dashboard"
      title="Dashboard"
      subtitle="Semana 16 · Lunes 19 de Abril"
      actions={
        <>
          <input className="input" placeholder="Buscar…" style={{ width: 240 }} />
          <button className="btn btn-ghost btn-sm">Notif.</button>
          <button className="btn btn-primary btn-sm">+ Nuevo cliente</button>
        </>
      }
    >
      {/* Live marquee */}
      <div className="marquee-wrap" style={{ borderRadius: "2px", marginBottom: 20, borderLeft: "3px solid var(--s-ink)", borderRight: "3px solid var(--s-ink)" }}>
        <div className="marquee-inner">
          {[...marqueeItems, ...marqueeItems].map((item, i) => (
            <span key={i} className="marquee-item" style={{ borderColor: "rgba(255,255,255,0.25)" }}>{item}</span>
          ))}
        </div>
      </div>

      {/* Giant stats row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 0, border: "3px solid var(--s-ink)", background: "var(--s-paper)", marginBottom: 20 }}>
        {[
          { label: "Clientes activos", val: "48", delta: "+6", unit: "", good: true },
          { label: "Adherencia prom.", val: "87", delta: "+3.2pp", unit: "%", good: true },
          { label: "Check-ins / semana", val: "124", delta: "32 pend.", unit: "", good: false },
          { label: "MRR", val: "4.820", delta: "+620", unit: "$", good: true },
        ].map((s, i) => (
          <div key={s.label} style={{
            padding: "28px 24px",
            borderRight: i < 3 ? "2px solid var(--s-ink)" : "none",
            position: "relative",
            overflow: "hidden",
          }}>
            {/* Big bg number */}
            <div className="display" style={{
              position: "absolute", bottom: -8, right: 8,
              fontSize: 80, opacity: 0.04, color: "var(--s-ink)", userSelect: "none",
              fontStyle: "italic",
            }}>
              {String(i + 1).padStart(2, "0")}
            </div>
            <div className="label-caps">{s.label}</div>
            <div className="big-num" style={{ fontSize: 64, marginTop: 8, color: i === 0 ? "var(--s-red)" : "var(--s-ink)" }}>
              {s.unit === "$" ? <><span style={{ fontSize: 28 }}>$</span>{s.val}</> : <>{s.val}<span style={{ fontSize: 28 }}>{s.unit}</span></>}
            </div>
            <div style={{
              fontSize: 12, fontWeight: 700, marginTop: 8, textTransform: "uppercase", letterSpacing: "0.06em",
              color: s.good ? "var(--s-lime-dark)" : "var(--s-red)",
              display: "flex", alignItems: "center", gap: 4,
            }}>
              {s.good ? "↑" : "⚠"} {s.delta}
            </div>
          </div>
        ))}
      </div>

      {/* Mid: chart + live */}
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16, marginBottom: 20 }}>
        {/* Bar chart */}
        <div className="card" style={{ padding: 24 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
            <div>
              <div className="label-caps">Actividad semanal</div>
              <div className="display" style={{ fontSize: 28, marginTop: 4 }}>344 sesiones</div>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <button className="btn btn-primary btn-sm">7 días</button>
              <button className="btn btn-ghost btn-sm">30 días</button>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 10, height: 160 }}>
            {weeklyActivity.map((v, i) => (
              <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
                <div style={{
                  width: "100%",
                  height: `${(v / max) * 100}%`,
                  background: i === 3 ? "var(--s-red)" : "var(--s-ink)",
                  border: "2px solid var(--s-ink)",
                  boxShadow: i === 3 ? "var(--s-shadow-sm)" : "none",
                  minHeight: 8,
                  position: "relative",
                }}>
                  {i === 3 && (
                    <div style={{
                      position: "absolute",
                      top: -30, left: "50%", transform: "translateX(-50%)",
                      background: "var(--s-red)", color: "var(--s-paper)",
                      padding: "3px 8px", border: "2px solid var(--s-ink)",
                      fontSize: 11, fontWeight: 700, whiteSpace: "nowrap",
                    }}>{v}</div>
                  )}
                </div>
                <div className="label-caps" style={{ fontSize: 10 }}>{weeklyLabels[i]}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Live widget */}
        <div className="card-ink" style={{ padding: 24 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <span className="live-dot" />
            <span className="label-caps" style={{ color: "var(--s-lime)", fontSize: 10 }}>En vivo ahora</span>
          </div>
          <div className="display" style={{ fontSize: 52, marginTop: 8 }}>3<br /><span style={{ color: "var(--s-lime)" }}>ACTIVOS</span></div>

          <div style={{ marginTop: 24, display: "flex", flexDirection: "column", gap: 0 }}>
            {[
              { init: "LF", name: "Lucía F.", plan: "Empuje B", min: 42 },
              { init: "TR", name: "Tomás R.", plan: "Piernas A", min: 18 },
              { init: "NS", name: "Nicolás S.", plan: "Pull C", min: 55 },
            ].map((c, i) => (
              <div key={c.name} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 0", borderTop: i > 0 ? "1px solid rgba(255,255,255,0.1)" : "none" }}>
                <div className="avatar" style={{ width: 32, height: 32, fontSize: 11, background: "var(--s-lime)", color: "var(--s-ink)", border: "2px solid rgba(255,255,255,0.2)" }}>{c.init}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{c.name}</div>
                  <div style={{ fontSize: 11, opacity: 0.5 }}>{c.plan}</div>
                </div>
                <div className="mono" style={{ fontSize: 13, fontWeight: 700, color: "var(--s-lime)" }}>{c.min}′</div>
              </div>
            ))}
          </div>

          <button className="btn btn-lime btn-sm" style={{ marginTop: 16, width: "100%" }}>Ver en vivo →</button>
        </div>
      </div>

      {/* Clients table */}
      <div className="card" style={{ overflow: "hidden" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "18px 24px", borderBottom: "2px solid var(--s-ink)" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
            <div className="display" style={{ fontSize: 22 }}>Clientes activos</div>
            <span className="tag">48 total</span>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-ghost btn-sm">Filtrar</button>
            <button className="btn btn-ink btn-sm">Ver todos</button>
          </div>
        </div>

        <div className="row head" style={{ gridTemplateColumns: "2fr 1.6fr 1fr 1.2fr 0.8fr 60px" }}>
          <div>Cliente</div>
          <div>Plan</div>
          <div>Adherencia</div>
          <div>Última actividad</div>
          <div>Racha</div>
          <div></div>
        </div>

        {clients.map((c) => (
          <div key={c.id} className="row" style={{ gridTemplateColumns: "2fr 1.6fr 1fr 1.2fr 0.8fr 60px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div className="avatar" style={{
                background: c.status === "on-track" ? "var(--s-ink)" : c.status === "attention" ? "var(--s-red)" : "var(--s-mid)",
              }}>{c.initials}</div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{c.name}</div>
                <div className="label-caps" style={{ fontSize: 9, marginTop: 2 }}>
                  {c.status === "on-track" ? "En ruta" : c.status === "attention" ? "⚠ Atención" : "Inactivo"}
                </div>
              </div>
            </div>
            <div style={{ fontSize: 13, fontWeight: 500 }}>{c.plan}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div className="bar bar-ink" style={{ flex: 1 }}>
                <span style={{ width: `${c.adherence}%` }} />
              </div>
              <div className="mono" style={{ fontSize: 12, fontWeight: 700, width: 34 }}>{c.adherence}%</div>
            </div>
            <div style={{ fontSize: 13, color: "var(--s-ink-3)" }}>{c.lastCheckin}</div>
            <div className="mono" style={{ fontSize: 13, fontWeight: 700 }}>
              {c.streak > 0 ? <span>{c.streak}d</span> : <span style={{ color: "var(--s-mid)" }}>—</span>}
            </div>
            <button className="btn btn-ghost btn-sm">→</button>
          </div>
        ))}
      </div>
    </Shell2>
  );
}
