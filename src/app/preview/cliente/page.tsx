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
      active="Alumnos"
      title={clientDetail.name}
      subtitle={`Alumno desde ${clientDetail.since} · ${clientDetail.goal}`}
      actions={
        <>
          <button type="button" className="btn btn-ghost btn-sm">
            Mensaje
          </button>
          <button type="button" className="btn btn-ghost btn-sm">
            Check-in
          </button>
          <button type="button" className="btn btn-primary btn-sm">
            Editar plan
          </button>
        </>
      }
    >
      <div className="pv-glass-strong flex flex-col gap-8 rounded-2xl p-8 md:flex-row md:items-center md:gap-10 md:p-10">
        <div className="avatar avatar-lg h-24 w-24 shrink-0 text-3xl md:h-28 md:w-28 md:text-4xl">
          {clientDetail.initials}
        </div>
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="chip chip-dark">{clientDetail.age} años</span>
            <span className="chip chip-accent">🔥 {clientDetail.streak} días</span>
            <span className="chip chip-dark">Próxima: {clientDetail.nextSession}</span>
          </div>
          <div className="display text-3xl text-[var(--obs-text)] md:text-4xl">{clientDetail.name}</div>
          <p className="mt-2 text-sm text-[var(--obs-text-dim)]">{clientDetail.goal}</p>
        </div>
        <div className="text-left md:text-right">
          <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--obs-text-faint)]">
            Adherencia 8S
          </div>
          <div className="mono mt-1 text-5xl font-bold leading-none text-[#7eebfd] md:text-6xl">
            {clientDetail.adherence}%
          </div>
        </div>
      </div>

      <div className="grid-4 mt-4">
        {clientDetail.metrics.map((m) => (
          <div key={m.label} className="stat pv-glass-card rounded-2xl">
            <div className="label">{m.label}</div>
            <div className="val mono">{m.value}</div>
            <div className="delta" style={{ color: "var(--pv-success)" }}>
              {m.delta} (8S)
            </div>
          </div>
        ))}
      </div>

      <div className="grid-2 mt-4">
        <div className="pv-glass-card rounded-2xl p-6 md:p-7">
          <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="label text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--obs-text-faint)]">
                Progreso de peso · 8 semanas
              </div>
              <div className="display mt-1 text-xl text-[var(--obs-text)]">+4.4 kg masa</div>
            </div>
            <div className="flex flex-wrap gap-2">
              <span className="chip chip-primary">Peso</span>
              <span className="chip">% Grasa</span>
              <span className="chip">Medidas</span>
            </div>
          </div>

          <div className="relative h-[200px]">
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-full w-full">
              <defs>
                <linearGradient id="pvGradLine" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="rgba(255,255,255,0.12)" />
                  <stop offset="100%" stopColor="rgba(255,255,255,0)" />
                </linearGradient>
              </defs>
              <polygon fill="url(#pvGradLine)" points={`0,100 ${points} 100,100`} />
              <polyline
                fill="none"
                stroke="rgba(255,255,255,0.35)"
                strokeWidth="0.85"
                vectorEffect="non-scaling-stroke"
                points={points}
              />
              {progressData.map((v, i) => {
                const x = (i / (progressData.length - 1)) * 100;
                const y = 100 - ((v - min) / (max - min)) * 80 - 10;
                const isLast = i === progressData.length - 1;
                return (
                  <circle
                    key={i}
                    cx={x}
                    cy={y}
                    r={isLast ? 1.1 : 0.65}
                    fill={isLast ? "rgb(var(--theme-primary-rgb))" : "rgba(255,255,255,0.5)"}
                    vectorEffect="non-scaling-stroke"
                  />
                );
              })}
            </svg>
            <div className="pointer-events-none absolute right-0 top-0 text-right">
              <div className="mono text-[11px] text-[var(--obs-text-faint)]">62.4 kg</div>
              <div className="mono mt-[120px] text-[11px] text-[var(--obs-text-faint)]">58.0 kg</div>
            </div>
          </div>
          <div className="mt-3 flex justify-between px-1">
            {progressLabels.map((l) => (
              <span key={l} className="mono text-[11px] text-[var(--obs-text-faint)]">
                {l}
              </span>
            ))}
          </div>
        </div>

        <div className="pv-glass-card rounded-2xl p-6 md:p-7">
          <div className="label text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--obs-text-faint)]">
            Check-ins recientes
          </div>
          <div className="display mt-1 text-xl text-[var(--obs-text)]">3 últimos</div>
          <div className="mt-6 flex flex-col gap-4">
            {clientDetail.checkins.map((c, i) => (
              <div
                key={i}
                className="border-b border-[var(--obs-border)] pb-4 last:border-0 last:pb-0"
              >
                <div className="mb-2 flex items-center gap-2">
                  <span className="text-lg" aria-hidden>
                    {c.mood === "great" ? "🟢" : c.mood === "good" ? "🟡" : "🟠"}
                  </span>
                  <span className="text-xs font-semibold text-[var(--obs-text-faint)]">{c.date}</span>
                </div>
                <p className="text-[13px] leading-relaxed text-[var(--obs-text-dim)]">{c.text}</p>
              </div>
            ))}
          </div>
          <button type="button" className="btn btn-ghost btn-sm mt-5 w-full">
            Ver todos los check-ins →
          </button>
        </div>
      </div>

      <div className="pv-glass-card mt-4 rounded-2xl p-6 md:p-7">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="label text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--obs-text-faint)]">
              Plan actual
            </div>
            <div className="display mt-1 text-xl text-[var(--obs-text)]">Hipertrofia · 12 Semanas</div>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--obs-text-faint)]">
                Semana 8 / 12
              </div>
              <div className="bar mt-2 w-[200px] md:w-[220px]">
                <span style={{ width: "66%" }} />
              </div>
            </div>
            <button type="button" className="btn btn-primary btn-sm">
              Abrir en builder
            </button>
          </div>
        </div>
      </div>
    </Shell>
  );
}
