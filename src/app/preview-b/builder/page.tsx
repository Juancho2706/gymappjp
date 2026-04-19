import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { PaperShell } from "../_components/PaperShell";
import { workoutDay } from "../_data/mock";

const days = [
  { label: "Día 1", name: "Tracción", active: false },
  { label: "Día 2", name: "Empuje", active: true },
  { label: "Día 3", name: "Piernas", active: false },
  { label: "Día 4", name: "Descanso", active: false },
];

const library = [
  { name: "Press banca", meta: "Pecho · barra" },
  { name: "Press inclinado", meta: "Pecho · mancuernas" },
  { name: "Press militar", meta: "Hombro · barra" },
  { name: "Elevaciones laterales", meta: "Hombro" },
];

function LibraryPanel({ className }: { className?: string }) {
  return (
    <div className={className}>
      <p className="caption-micro text-primary">Catálogo</p>
      <h3 className="display-editorial mt-2 text-lg text-foreground">Biblioteca</h3>
      <input
        type="search"
        placeholder="Buscar ejercicio…"
        className="mt-4 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none ring-primary/30 focus-visible:ring-2"
      />
      <ul className="mt-4 space-y-2">
        {library.map((e) => (
          <li key={e.name}>
            <button
              type="button"
              className="paper-flat flex min-h-12 w-full flex-col items-start rounded-lg px-3 py-3 text-left transition-transform hover:-translate-y-px active:scale-[0.99]"
            >
              <span className="text-sm font-semibold text-foreground">{e.name}</span>
              <span className="text-xs text-muted-foreground">{e.meta}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function PreviewBBuilderPage() {
  return (
    <PaperShell
      title={workoutDay.name}
      subtitle="Layout editorial: fases legibles en móvil; catálogo en panel o acordeón."
      actions={
        <>
          <span className="caption-micro hidden rounded-full border border-border px-3 py-2 sm:inline-flex">
            Guardado
          </span>
          <button
            type="button"
            className="inline-flex min-h-11 items-center rounded-lg border border-border bg-background px-4 text-sm font-medium hover:bg-muted/80"
          >
            Previsualizar
          </button>
          <button
            type="button"
            className="inline-flex min-h-11 items-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:opacity-95"
          >
            Publicar
          </button>
        </>
      }
    >
      <div className="paper-card overflow-x-auto rounded-xl px-2 py-3 md:px-4">
        <div className="flex min-w-max gap-1 md:gap-2">
          {days.map((d) => (
            <button
              key={d.label}
              type="button"
              className={cn(
                "preview-b-phase-tab flex shrink-0 flex-col items-start gap-0.5 rounded-md px-3 py-2 text-left whitespace-nowrap",
                d.active && "bg-muted/70",
              )}
              data-active={d.active ? "true" : "false"}
            >
              <span>{d.label}</span>
              <span className="normal-case text-[10px] font-normal tracking-normal text-muted-foreground">
                {d.name}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="mt-8 flex flex-col gap-8 lg:grid lg:grid-cols-[minmax(0,1fr)_280px] lg:items-start lg:gap-10">
        <div className="min-w-0 lg:order-1">
          <section className="paper-elevated rounded-2xl p-5 md:p-8">
            <p className="caption-micro">Día en edición</p>
            <h2 className="display-editorial mt-2 text-2xl text-foreground md:text-3xl">
              {workoutDay.name}
            </h2>
            <div className="mt-4 flex flex-wrap gap-2">
              <span className="rounded-full border border-border bg-muted/40 px-3 py-1 text-xs font-medium text-muted-foreground">
                ⏱ {workoutDay.duration}
              </span>
              <span className="rounded-full border border-border bg-muted/40 px-3 py-1 text-xs font-medium text-muted-foreground">
                {workoutDay.blocks.length} bloques
              </span>
            </div>
          </section>

          <div className="mt-6 space-y-4">
            {workoutDay.blocks.map((block) => (
              <article key={block.letter} className="paper-card overflow-hidden rounded-2xl">
                <div className="flex flex-wrap items-center gap-3 border-b border-border bg-muted/20 px-4 py-4 md:px-6">
                  <span className="flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-card text-base font-bold text-foreground">
                    {block.letter}
                  </span>
                  <div className="min-w-0 flex-1">
                    <h3 className="font-semibold text-foreground">{block.title}</h3>
                    <p className="text-xs text-muted-foreground">
                      {block.exercises.length} ejercicios
                    </p>
                  </div>
                  <button
                    type="button"
                    className="min-h-10 rounded-lg border border-border px-3 text-sm font-medium hover:bg-muted/60"
                  >
                    Editar
                  </button>
                </div>
                <ul className="divide-y divide-border">
                  {block.exercises.map((ex, i) => (
                    <li
                      key={i}
                      className="flex flex-col gap-2 px-4 py-4 sm:flex-row sm:items-center sm:gap-4 md:px-6"
                    >
                      <span className="text-muted-foreground sm:w-6">⋮⋮</span>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-foreground">{ex.name}</p>
                        <p className="text-sm text-muted-foreground">{ex.notes}</p>
                      </div>
                      <p className="data-number shrink-0 text-sm font-semibold text-primary">
                        {ex.sets}
                      </p>
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>

          <button
            type="button"
            className="paper-flat mt-6 flex min-h-12 w-full items-center justify-center rounded-xl text-sm font-semibold text-foreground hover:bg-muted/50"
          >
            + Añadir bloque
          </button>
        </div>

        <details className="paper-card group rounded-2xl lg:hidden">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-4 [&::-webkit-details-marker]:hidden">
            <span className="font-semibold text-foreground">Biblioteca de ejercicios</span>
            <ChevronDown className="h-5 w-5 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
          </summary>
          <div className="border-t border-border px-4 pb-4">
            <LibraryPanel className="pt-4" />
          </div>
        </details>

        <aside className="paper-card sticky top-28 hidden h-fit rounded-2xl p-5 lg:order-2 lg:block">
          <LibraryPanel />
        </aside>
      </div>
    </PaperShell>
  );
}
