import { Shell } from "../_components/Shell";
import { clients, metrics, weeklyActivity, weeklyLabels } from "../_data/mock";

export default function DashboardPreview() {
  const max = Math.max(...weeklyActivity);

  return (
    <Shell
      active="Dashboard"
      title="Buenos días, Javier"
      subtitle="Tenés 32 check-ins pendientes y 2 alumnos que requieren atención."
      actions={
        <>
          <input className="input" placeholder="Buscar alumno, ejercicio…" style={{ width: 280 }} />
          <button type="button" className="btn btn-ghost btn-sm">
            Notificaciones
          </button>
          <button type="button" className="btn btn-primary btn-sm">
            + Nuevo alumno
          </button>
        </>
      }
    >
      <div className="grid-4">
        {metrics.map((m) => (
          <div key={m.label} className="stat pv-glass-card rounded-2xl">
            <div className="label">{m.label}</div>
            <div className="val mono">{m.value}</div>
            <div
              className="delta"
              style={{ color: m.good ? "var(--pv-success)" : "var(--pv-warning)" }}
            >
              {m.delta}
            </div>
          </div>
        ))}
      </div>

      <div className="grid-2 mt-4">
        <div className="pv-glass-card rounded-2xl p-6 md:p-7">
          <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="label text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--obs-text-faint)]">
                Actividad semanal
              </div>
              <div className="display mt-1 text-xl text-[var(--obs-text)] md:text-2xl">
                344 sesiones completadas
              </div>
            </div>
            <div className="flex gap-2">
              <span className="chip chip-primary">Esta semana</span>
              <span className="chip">Mes</span>
            </div>
          </div>
          <div className="flex h-[180px] items-end gap-3 px-2">
            {weeklyActivity.map((v, i) => (
              <div key={i} className="flex flex-1 flex-col items-center gap-2">
                <div
                  className="relative w-full rounded-t-md rounded-b-[2px]"
                  style={{
                    height: `${Math.max(12, (v / max) * 100)}%`,
                    minHeight: 12,
                    background:
                      i === 3
                        ? "linear-gradient(180deg, rgba(var(--theme-primary-rgb),0.35) 0%, rgba(255,255,255,0.08) 100%)"
                        : "linear-gradient(180deg, rgba(255,255,255,0.14) 0%, rgba(255,255,255,0.04) 100%)",
                    boxShadow:
                      i === 3 ? "0 0 20px -6px rgba(var(--theme-primary-rgb),0.35)" : undefined,
                  }}
                >
                  {i === 3 ? (
                    <div className="mono absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md bg-[var(--obs-elevated)] px-2 py-1 text-[11px] font-semibold text-[var(--obs-text)] ring-1 ring-[var(--obs-border)]">
                      {v}
                    </div>
                  ) : null}
                </div>
                <div className="text-[11px] font-semibold text-[var(--obs-text-faint)]">
                  {weeklyLabels[i]}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="pv-glass-strong rounded-2xl p-6 md:p-7">
          <div className="mb-1 flex items-center gap-2">
            <span className="dot dot-live" />
            <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--obs-text-faint)]">
              Ahora entrenando
            </span>
          </div>
          <div className="display mt-3 text-2xl leading-tight tracking-[-0.03em] text-[var(--obs-text)] md:text-3xl">
            3 alumnos
            <br />
            en vivo
          </div>
          <div className="mt-5 flex flex-col gap-3">
            {["Lucía F.", "Tomás R.", "Nicolás S."].map((n, i) => (
              <div key={n} className="flex items-center gap-3">
                <div className="avatar h-8 w-8 text-[11px]">{n[0]}</div>
                <div className="min-w-0 flex-1 text-[13px]">
                  <div className="font-semibold text-[var(--obs-text)]">{n}</div>
                  <div className="text-[11px] text-[var(--obs-text-faint)]">
                    {["Empuje · Bloque B", "Piernas · Bloque A", "Pull · Bloque C"][i]}
                  </div>
                </div>
                <div className="mono text-[11px] font-bold text-[#7eebfd]">
                  {[42, 18, 55][i]}′
                </div>
              </div>
            ))}
          </div>
          <button type="button" className="btn btn-accent btn-sm mt-5 w-full">
            Ver en tiempo real
          </button>
        </div>
      </div>

      <div className="pv-glass-card mt-4 overflow-hidden rounded-2xl" style={{ marginTop: 16 }}>
        <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-5 md:px-7">
          <div>
            <div className="label text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--obs-text-faint)]">
              Alumnos activos
            </div>
            <div className="display mt-1 text-lg text-[var(--obs-text)] md:text-xl">
              48 alumnos en tu roster
            </div>
          </div>
          <div className="flex gap-2">
            <button type="button" className="btn btn-ghost btn-sm">
              Filtrar
            </button>
            <button type="button" className="btn btn-ghost btn-sm">
              Ver todos
            </button>
          </div>
        </div>

        <div className="row head" style={{ gridTemplateColumns: "2fr 1.5fr 1fr 1.2fr 1fr 80px" }}>
          <div>Alumno</div>
          <div>Plan</div>
          <div>Adherencia</div>
          <div>Última actividad</div>
          <div>Racha</div>
          <div />
        </div>

        {clients.map((c) => (
          <div key={c.id} className="row" style={{ gridTemplateColumns: "2fr 1.5fr 1fr 1.2fr 1fr 80px" }}>
            <div className="flex items-center gap-3">
              <div className="avatar">{c.initials}</div>
              <div>
                <div className="text-sm font-semibold text-[var(--obs-text)]">{c.name}</div>
                <div className="text-xs text-[var(--obs-text-dim)]">
                  {c.status === "on-track" && (
                    <>
                      <span className="dot inline-block" style={{ background: "var(--pv-success)" }} />{" "}
                      En ruta
                    </>
                  )}
                  {c.status === "attention" && (
                    <>
                      <span className="dot inline-block" style={{ background: "var(--pv-warning)" }} />{" "}
                      Atención
                    </>
                  )}
                  {c.status === "inactive" && (
                    <>
                      <span className="dot inline-block" style={{ background: "var(--obs-text-faint)" }} />{" "}
                      Inactivo
                    </>
                  )}
                </div>
              </div>
            </div>
            <div className="text-[13px] text-[var(--obs-text-dim)]">{c.plan}</div>
            <div className="flex items-center gap-2">
              <div className="bar flex-1">
                <span style={{ width: `${c.adherence}%` }} />
              </div>
              <div className="mono w-8 text-xs font-bold text-[var(--obs-text)]">{c.adherence}%</div>
            </div>
            <div className="text-[13px] text-[var(--obs-text-dim)]">{c.lastCheckin}</div>
            <div className="mono text-[13px] font-bold">
              {c.streak > 0 ? (
                <span style={{ color: "rgb(var(--theme-primary-rgb))" }}>🔥 {c.streak}d</span>
              ) : (
                "—"
              )}
            </div>
            <div>
              <button type="button" className="btn btn-ghost btn-sm">
                →
              </button>
            </div>
          </div>
        ))}
      </div>
    </Shell>
  );
}
