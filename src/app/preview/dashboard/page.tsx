import { Shell } from "../_components/Shell";
import { clients, metrics, weeklyActivity, weeklyLabels } from "../_data/mock";

export default function DashboardPreview() {
  const max = Math.max(...weeklyActivity);

  return (
    <Shell
      active="Dashboard"
      title="Buenos días, Javier"
      subtitle="Tenés 32 check-ins pendientes y 2 clientes que requieren atención."
      actions={
        <>
          <input className="input" placeholder="Buscar cliente, ejercicio…" style={{ width: 280 }} />
          <button className="btn btn-ghost btn-sm">Notificaciones</button>
          <button className="btn btn-primary btn-sm">+ Nuevo cliente</button>
        </>
      }
    >
      {/* Metrics */}
      <div className="grid-4">
        {metrics.map((m) => (
          <div key={m.label} className="stat">
            <div className="label">{m.label}</div>
            <div className="val mono">{m.value}</div>
            <div className="delta" style={{ color: m.good ? "var(--c-success)" : "var(--c-warning)" }}>
              {m.delta}
            </div>
          </div>
        ))}
      </div>

      {/* Mid row: activity chart + today */}
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16, marginTop: 16 }}>
        <div className="surface" style={{ padding: 24 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
            <div>
              <div className="label" style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--c-muted-fg)" }}>
                Actividad semanal
              </div>
              <div className="display" style={{ fontSize: 22, marginTop: 4 }}>
                344 sesiones completadas
              </div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <span className="chip chip-primary">Esta semana</span>
              <span className="chip">Mes</span>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 14, height: 180, padding: "0 8px" }}>
            {weeklyActivity.map((v, i) => (
              <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
                <div style={{
                  width: "100%",
                  height: `${(v / max) * 100}%`,
                  background: `linear-gradient(180deg, var(--c-primary) 0%, var(--c-primary-dark) 100%)`,
                  borderRadius: "8px 8px 2px 2px",
                  position: "relative",
                  minHeight: 10,
                }}>
                  {i === 3 && (
                    <div style={{
                      position: "absolute",
                      top: -28,
                      left: "50%",
                      transform: "translateX(-50%)",
                      background: "var(--c-dark)",
                      color: "#fff",
                      padding: "4px 8px",
                      borderRadius: 6,
                      fontSize: 11,
                      fontWeight: 600,
                      whiteSpace: "nowrap",
                    }}>{v}</div>
                  )}
                </div>
                <div style={{ fontSize: 11, color: "var(--c-muted-fg)", fontWeight: 600 }}>{weeklyLabels[i]}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="surface-dark" style={{ padding: 24 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <span className="dot dot-live" />
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", opacity: 0.6 }}>
              Ahora entrenando
            </span>
          </div>
          <div className="display" style={{ fontSize: 30, marginTop: 12, letterSpacing: "-0.03em" }}>
            3 clientes<br />en vivo
          </div>
          <div style={{ marginTop: 20, display: "flex", flexDirection: "column", gap: 12 }}>
            {["Lucía F.", "Tomás R.", "Nicolás S."].map((n, i) => (
              <div key={n} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div className="avatar" style={{ width: 30, height: 30, fontSize: 11 }}>{n[0]}</div>
                <div style={{ flex: 1, fontSize: 13 }}>
                  <div style={{ fontWeight: 600 }}>{n}</div>
                  <div style={{ opacity: 0.55, fontSize: 11 }}>
                    {["Empuje · Bloque B", "Piernas · Bloque A", "Pull · Bloque C"][i]}
                  </div>
                </div>
                <div style={{ fontSize: 11, fontWeight: 700, color: "var(--c-accent)" }}>
                  {[42, 18, 55][i]}′
                </div>
              </div>
            ))}
          </div>
          <button className="btn btn-accent btn-sm" style={{ marginTop: 20, width: "100%" }}>
            Ver en tiempo real
          </button>
        </div>
      </div>

      {/* Clients table */}
      <div className="surface" style={{ marginTop: 16, overflow: "hidden" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "20px 24px" }}>
          <div>
            <div className="label" style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--c-muted-fg)" }}>
              Clientes activos
            </div>
            <div className="display" style={{ fontSize: 20, marginTop: 4 }}>48 clientes en tu roster</div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-ghost btn-sm">Filtrar</button>
            <button className="btn btn-dark btn-sm">Ver todos</button>
          </div>
        </div>

        <div className="row head" style={{ gridTemplateColumns: "2fr 1.5fr 1fr 1.2fr 1fr 80px" }}>
          <div>Cliente</div>
          <div>Plan</div>
          <div>Adherencia</div>
          <div>Última actividad</div>
          <div>Racha</div>
          <div></div>
        </div>

        {clients.map((c) => (
          <div key={c.id} className="row" style={{ gridTemplateColumns: "2fr 1.5fr 1fr 1.2fr 1fr 80px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div className="avatar">{c.initials}</div>
              <div>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{c.name}</div>
                <div style={{ fontSize: 12, color: "var(--c-muted-fg)" }}>
                  {c.status === "on-track" && <><span className="dot" style={{ background: "var(--c-success)" }} /> En ruta</>}
                  {c.status === "attention" && <><span className="dot" style={{ background: "var(--c-warning)" }} /> Atención</>}
                  {c.status === "inactive" && <><span className="dot" style={{ background: "var(--c-muted-fg)" }} /> Inactivo</>}
                </div>
              </div>
            </div>
            <div style={{ fontSize: 13 }}>{c.plan}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div className="bar" style={{ flex: 1 }}>
                <span style={{ width: `${c.adherence}%` }} />
              </div>
              <div className="mono" style={{ fontSize: 12, fontWeight: 700, width: 32 }}>{c.adherence}%</div>
            </div>
            <div style={{ fontSize: 13, color: "var(--c-muted-fg)" }}>{c.lastCheckin}</div>
            <div className="mono" style={{ fontSize: 13, fontWeight: 700 }}>
              {c.streak > 0 ? <span style={{ color: "var(--c-primary)" }}>🔥 {c.streak}d</span> : "—"}
            </div>
            <div><button className="btn btn-ghost btn-sm">→</button></div>
          </div>
        ))}
      </div>
    </Shell>
  );
}
