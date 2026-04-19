import { BrutalistShell } from "../_components/BrutalistShell";
import { CommandPalettePreview } from "../_components/CommandPalettePreview";
import { SpatialBuilderCanvas } from "../_components/SpatialBuilderCanvas";
import { workoutDay } from "../_data/mock";

export default function PreviewCBuilderPage() {
  return (
    <BrutalistShell
      title="Programa · canvas"
      subtitle="Nodos día + conexión SVG · pan/zoom táctil y rueda · minimap."
      actions={<CommandPalettePreview />}
    >
      <SpatialBuilderCanvas />

      <section className="mt-8 space-y-4 md:mt-10">
        <h2 className="text-lg font-bold uppercase tracking-[0.1em] text-[var(--pc-chalk)]">
          Detalle · {workoutDay.name}
        </h2>
        {workoutDay.blocks.map((b) => (
          <article key={b.letter} className="pc-edge-muted p-4 md:p-5">
            <div className="flex flex-wrap items-center gap-3">
              <span className="pc-mono border-2 border-[var(--pc-chalk)] px-2 py-1 text-sm font-bold text-[var(--pc-chalk)]">
                {b.letter}
              </span>
              <h3 className="text-base font-bold uppercase tracking-wide text-[var(--pc-chalk)]">
                {b.title}
              </h3>
            </div>
            <ul className="mt-3 space-y-2 border-t-2 border-[rgba(255,255,255,0.12)] pt-3">
              {b.exercises.map((ex) => (
                <li key={ex} className="pc-mono text-sm text-[var(--pc-muted)]">
                  — {ex}
                </li>
              ))}
            </ul>
          </article>
        ))}
      </section>
    </BrutalistShell>
  );
}
