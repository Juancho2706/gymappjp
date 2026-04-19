import { PaperShell } from "../_components/PaperShell";
import { clientDetail } from "../_data/mock";

export default function PreviewBClientePage() {
  return (
    <PaperShell
      title={clientDetail.name}
      subtitle={`${clientDetail.goal} · desde ${clientDetail.since}`}
      actions={
        <>
          <button
            type="button"
            className="inline-flex min-h-11 items-center rounded-lg border border-border bg-background px-4 text-sm font-medium hover:bg-muted/80"
          >
            Mensaje
          </button>
          <button
            type="button"
            className="inline-flex min-h-11 items-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:opacity-95"
          >
            Editar plan
          </button>
        </>
      }
    >
      <header className="border-b border-border pb-6">
        <p className="caption-micro text-primary">Diario personal</p>
        <p className="data-number mt-2 text-sm text-muted-foreground">19 abril 2026</p>
        <h2 className="display-editorial mt-2 text-3xl tracking-tight text-foreground md:text-4xl">
          Resumen de semana
        </h2>
        <p className="drop-cap mt-4 max-w-2xl text-base leading-relaxed text-muted-foreground">
          Próxima sesión {clientDetail.nextSession}. Racha de entrenos consecutivos:{" "}
          <span className="data-number font-semibold text-foreground">{clientDetail.streak}</span>{" "}
          días. Ajustamos volumen según feedback del último check-in.
        </p>
      </header>

      <div className="mt-8 grid gap-6 lg:grid-cols-12">
        <div className="paper-card rounded-2xl p-6 lg:col-span-7">
          <p className="caption-micro">Plan del día · vista artículo</p>
          <h3 className="display-editorial mt-2 text-2xl text-foreground">Empuje · Bloque B</h3>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            Press banca 5×5, press militar 4×6, accesorios de hombro y tríceps. Duración estimada
            65 min.
          </p>
          <div className="mt-6 rounded-xl border border-border bg-muted/30 p-4">
            <p className="caption-micro text-primary">Nota marginal</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Recordá registrar RPE en press banca para ajustar la próxima ola.
            </p>
          </div>
        </div>

        <aside className="space-y-4 lg:col-span-5">
          <div className="paper-elevated rounded-2xl p-6">
            <p className="caption-micro">Adherencia 8 semanas</p>
            <p className="data-number mt-2 text-5xl font-medium text-foreground">
              {clientDetail.adherence}%
            </p>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary"
                style={{ width: `${clientDetail.adherence}%` }}
              />
            </div>
          </div>

          <blockquote className="pull-quote text-base">{clientDetail.pullQuote}</blockquote>

          <div className="paper-card rounded-2xl p-6">
            <p className="caption-micro">Check-ins</p>
            <ul className="mt-4 space-y-4">
              {clientDetail.checkins.map((c, i) => (
                <li key={i} className="border-b border-border pb-4 last:border-0 last:pb-0">
                  <p className="caption-micro text-muted-foreground">{c.date}</p>
                  <p className="mt-1 text-sm leading-relaxed text-foreground">{c.text}</p>
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </div>

      <section className="mt-8 grid gap-4 sm:grid-cols-2">
        {clientDetail.metrics.map((m) => (
          <article key={m.label} className="paper-flat rounded-xl p-5">
            <p className="caption-micro">{m.label}</p>
            <p className="data-number mt-2 text-2xl text-foreground">{m.value}</p>
            <p className="mt-1 text-sm font-medium text-primary">{m.delta}</p>
          </article>
        ))}
      </section>
    </PaperShell>
  );
}
