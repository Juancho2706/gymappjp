import { PaperShell } from "../_components/PaperShell";
import { clients, metrics, weeklyActivity, weeklyLabels } from "../_data/mock";

export default function PreviewBDashboardPage() {
  const max = Math.max(...weeklyActivity);
  const featured = clients[0];

  return (
    <PaperShell
      title="Portada del estudio"
      subtitle="Vista magazine: alumno destacado, métricas editoriales y actividad semanal."
      actions={
        <>
          <button
            type="button"
            className="inline-flex min-h-11 items-center rounded-lg border border-border bg-background px-4 text-sm font-medium text-foreground shadow-sm hover:bg-muted/80"
          >
            Exportar
          </button>
          <button
            type="button"
            className="inline-flex min-h-11 items-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm hover:opacity-95"
          >
            Nuevo alumno
          </button>
        </>
      }
    >
      {/* Hero feature — stacks on mobile */}
      <section className="paper-elevated overflow-hidden rounded-2xl">
        <div className="grid gap-0 md:grid-cols-2">
          <div className="border-b border-border p-6 md:border-b-0 md:border-r md:p-10">
            <p className="caption-micro text-primary">Alumno destacado</p>
            <h2 className="display-editorial mt-2 text-2xl text-foreground md:text-3xl">
              {featured.name}
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              {featured.plan} · adherencia{" "}
              <span className="data-number font-semibold text-foreground">{featured.adherence}%</span>
            </p>
            <div className="mt-6">
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{ width: `${featured.adherence}%` }}
                />
              </div>
              <p className="caption-micro mt-2">Barra de adherencia · acento white-label</p>
            </div>
          </div>
          <div className="flex flex-col justify-center p-6 md:p-10">
            <blockquote className="pull-quote my-0 border-l-2 border-primary pl-5 text-base italic md:text-lg">
              Lucía cerró todas las sesiones pautadas esta semana; subimos volumen de pierna el
              jueves sin perder técnica.
            </blockquote>
          </div>
        </div>
      </section>

      <section className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {metrics.map((m) => (
          <article key={m.label} className="paper-card rounded-xl p-5 md:p-6">
            <p className="caption-micro">{m.label}</p>
            <p className="data-number mt-2 text-3xl font-medium tracking-tight text-foreground md:text-4xl">
              {m.value}
            </p>
            <p
              className="mt-2 text-sm font-medium"
              style={{ color: m.good ? "var(--chart-2)" : "var(--destructive)" }}
            >
              {m.delta}
            </p>
          </article>
        ))}
      </section>

      <section className="paper-card mt-8 rounded-2xl p-5 md:p-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="caption-micro">Actividad semanal</p>
            <h3 className="display-editorial mt-1 text-xl text-foreground md:text-2xl">
              Sesiones completadas
            </h3>
          </div>
          <div className="flex gap-2">
            <span className="preview-b-phase-tab rounded-md bg-muted/60 px-3 py-2" data-active="true">
              Semana
            </span>
            <span className="preview-b-phase-tab rounded-md px-3 py-2" data-active="false">
              Mes
            </span>
          </div>
        </div>
        <div className="mt-8 flex h-40 items-end gap-2 sm:gap-3">
          {weeklyActivity.map((v, i) => (
            <div key={i} className="flex min-w-0 flex-1 flex-col items-center gap-2">
              <div
                className="w-full max-w-[3rem] rounded-t-sm sm:max-w-none"
                style={{
                  height: `${Math.max(14, (v / max) * 100)}%`,
                  minHeight: 28,
                  background:
                    i === 3
                      ? "linear-gradient(180deg, var(--primary) 0%, var(--muted) 100%)"
                      : "linear-gradient(180deg, var(--muted-foreground) 0%, var(--muted) 100%)",
                  opacity: i === 3 ? 1 : 0.35,
                }}
              />
              <span className="data-number text-[10px] font-semibold uppercase tracking-wider text-muted-foreground sm:text-xs">
                {weeklyLabels[i]}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="paper-card mt-8 overflow-hidden rounded-2xl">
        <div className="border-b border-border px-5 py-4 md:px-8 md:py-5">
          <p className="caption-micro">Roster</p>
          <h3 className="display-editorial mt-1 text-lg text-foreground md:text-xl">
            Alumnos recientes
          </h3>
        </div>
        <ul className="divide-y divide-border">
          {clients.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center gap-4 px-5 py-4 md:px-8">
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2 border-primary/40 bg-muted text-sm font-semibold text-foreground">
                  {c.initials}
                </div>
                <div className="min-w-0">
                  <p className="truncate font-medium text-foreground">{c.name}</p>
                  <p className="truncate text-sm text-muted-foreground">{c.plan}</p>
                </div>
              </div>
              <div className="flex w-full items-center gap-3 sm:w-48">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${c.adherence}%` }}
                  />
                </div>
                <span className="data-number w-10 text-right text-sm font-semibold text-foreground">
                  {c.adherence}%
                </span>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </PaperShell>
  );
}
