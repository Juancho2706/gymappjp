import { Shell } from "../_components/Shell";
import { workoutDay } from "../_data/mock";

const days = [
  { label: "Día 1", name: "Tracción", done: true },
  { label: "Día 2", name: "Empuje", active: true },
  { label: "Día 3", name: "Piernas", done: false },
  { label: "Día 4", name: "Descanso", rest: true },
  { label: "Día 5", name: "Upper", done: false },
  { label: "Día 6", name: "Lower", done: false },
  { label: "Día 7", name: "Descanso", rest: true },
];

const exerciseLibrary = [
  { name: "Press banca", tag: "Pecho", equip: "Barra", muscle: "#fb7185" },
  { name: "Press inclinado", tag: "Pecho", equip: "Mancuernas", muscle: "#fb7185" },
  { name: "Press militar", tag: "Hombro", equip: "Barra", muscle: "#c084fc" },
  { name: "Elevaciones laterales", tag: "Hombro", equip: "Mancuernas", muscle: "#c084fc" },
  { name: "Fondos", tag: "Pecho", equip: "Peso corporal", muscle: "#fb7185" },
  { name: "Tríceps polea", tag: "Tríceps", equip: "Polea", muscle: "#38bdf8" },
];

function muscleForExercise(name: string): string {
  if (/pectoral|banca|inclinado|fondos/i.test(name)) return "#fb7185";
  if (/militar|lateral|hombro/i.test(name)) return "#c084fc";
  return "#38bdf8";
}

export default function BuilderPreview() {
  return (
    <Shell
      active="Builder"
      title="Hipertrofia · 12 Semanas"
      subtitle="Plan de Lucía Fernández — Semana 8 · Día 2"
      actions={
        <>
          <span className="chip chip-accent">
            <span className="dot" style={{ background: "#5eead4" }} />
            Guardado
          </span>
          <button type="button" className="btn btn-ghost btn-sm">
            Previsualizar
          </button>
          <button type="button" className="btn btn-primary btn-sm">
            Publicar cambios
          </button>
        </>
      }
    >
      <div className="pv-glass-card mb-4 rounded-2xl p-5 md:p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="label text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--obs-text-faint)]">
              Semana 8 de 12
            </div>
            <div className="display mt-1 text-lg text-[var(--obs-text)] md:text-xl">
              Microciclo de acumulación
            </div>
          </div>
          <div className="flex gap-2">
            <button type="button" className="btn btn-ghost btn-sm">
              ← S7
            </button>
            <button type="button" className="btn btn-ghost btn-sm">
              S9 →
            </button>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
          {days.map((d) => (
            <div
              key={d.label}
              className="rounded-xl px-3 py-3.5 transition-colors md:px-3.5"
              style={{
                border: d.active
                  ? "1px solid rgba(var(--theme-primary-rgb),0.45)"
                  : "1px solid var(--obs-border)",
                background: d.active
                  ? "rgba(var(--theme-primary-rgb),0.06)"
                  : d.rest
                    ? "rgba(0,0,0,0.2)"
                    : "rgba(255,255,255,0.02)",
                boxShadow: d.active ? "0 0 24px -8px rgba(var(--theme-primary-rgb),0.35)" : undefined,
                cursor: "pointer",
              }}
            >
              <div className="text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--obs-text-faint)]">
                {d.label}
              </div>
              <div className="mt-1.5 text-sm font-bold text-[var(--obs-text)]">{d.name}</div>
              {d.done ? (
                <span className="chip chip-success mt-2 inline-flex h-5 items-center px-2 text-[10px]">
                  ✓ Hecho
                </span>
              ) : null}
              {d.active ? (
                <span className="chip chip-primary mt-2 inline-flex h-5 items-center px-2 text-[10px]">
                  Editando
                </span>
              ) : null}
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
        <div className="pv-glass-card h-fit rounded-2xl p-5 lg:sticky lg:top-4">
          <div className="label mb-2 text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--obs-text-faint)]">
            Biblioteca
          </div>
          <input className="input mb-3" placeholder="Buscar ejercicio…" />
          <div className="mb-4 flex flex-wrap gap-1.5">
            {["Todos", "Pecho", "Espalda", "Pierna", "Hombro", "Core"].map((t, i) => (
              <span key={t} className={`chip cursor-pointer ${i === 0 ? "chip-primary" : ""}`}>
                {t}
              </span>
            ))}
          </div>
          <div className="flex flex-col gap-2">
            {exerciseLibrary.map((e) => (
              <div
                key={e.name}
                className="pv-glass-card cursor-grab rounded-xl px-3 py-3 transition-transform duration-200 hover:scale-[1.01]"
                style={{
                  borderLeft: `3px solid ${e.muscle}`,
                  boxShadow: `inset 3px 0 0 -1px ${e.muscle}33`,
                }}
              >
                <div className="flex items-center gap-2">
                  <span className="text-[var(--obs-text-faint)]">⋮⋮</span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-semibold text-[var(--obs-text)]">{e.name}</div>
                    <div className="mt-0.5 text-[11px] text-[var(--obs-text-faint)]">
                      {e.tag} · {e.equip}
                    </div>
                  </div>
                  <span className="text-base font-bold text-[rgb(var(--theme-primary-rgb))]">+</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <div className="pv-glass-strong mb-4 rounded-2xl p-6 md:p-7">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--obs-text-faint)]">
                  Día en edición
                </div>
                <div className="display mt-2 text-2xl text-[var(--obs-text)] md:text-3xl">{workoutDay.name}</div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <span className="chip chip-dark">⏱ {workoutDay.duration}</span>
                  <span className="chip chip-dark">4 bloques</span>
                  <span className="chip chip-dark">9 ejercicios</span>
                </div>
              </div>
              <div className="flex gap-2">
                <button type="button" className="btn btn-ghost btn-sm">
                  Duplicar día
                </button>
                <button type="button" className="btn btn-accent btn-sm">
                  + Bloque
                </button>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            {workoutDay.blocks.map((block) => (
              <div key={block.letter} className="pv-glass-card overflow-hidden rounded-2xl">
                <div
                  className="flex items-center gap-3 border-b px-5 py-4"
                  style={{ borderColor: "var(--obs-border)", background: "rgba(0,0,0,0.2)" }}
                >
                  <span className="text-[var(--obs-text-faint)]">⋮⋮</span>
                  <div
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-base font-extrabold text-[var(--obs-text)]"
                    style={{
                      fontFamily: "var(--font-montserrat)",
                      background: "rgba(255,255,255,0.06)",
                      border: "1px solid var(--obs-border)",
                    }}
                  >
                    {block.letter}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[15px] font-bold text-[var(--obs-text)]">{block.title}</div>
                    <div className="text-[11px] text-[var(--obs-text-faint)]">
                      {block.exercises.length} ejercicios
                    </div>
                  </div>
                  <button type="button" className="btn btn-ghost btn-sm">
                    Editar
                  </button>
                </div>

                <div>
                  <div
                    className="row head border-t-0"
                    style={{ gridTemplateColumns: "28px 2fr 1fr 1.5fr 52px" }}
                  >
                    <div />
                    <div>Ejercicio</div>
                    <div>Sets × Reps</div>
                    <div>Notas</div>
                    <div />
                  </div>
                  {block.exercises.map((ex, i) => {
                    const muscle = muscleForExercise(ex.name);
                    const dragDemo =
                      block.letter === "B" && ex.name === "Press banca";
                    return (
                      <div
                        key={i}
                        className={`row ${dragDemo ? "pv-kinetic-glow-strong scale-[1.02] rounded-lg" : ""}`}
                        style={{
                          gridTemplateColumns: "28px 2fr 1fr 1.5fr 52px",
                          borderLeft: dragDemo ? "3px solid rgb(var(--theme-primary-rgb))" : `3px solid ${muscle}`,
                          boxShadow: dragDemo
                            ? undefined
                            : `inset 3px 0 0 -1px ${muscle}40`,
                          transition: "box-shadow 0.3s ease, transform 0.3s ease",
                        }}
                      >
                        <div className="text-[var(--obs-text-faint)]">⋮⋮</div>
                        <div className="flex items-center gap-3 text-sm font-semibold text-[var(--obs-text)]">
                          <span
                            className="inline-block h-9 w-9 shrink-0 rounded-md bg-[rgba(0,0,0,0.35)] ring-1 ring-[var(--obs-border)]"
                            aria-hidden
                          />
                          {ex.name}
                          {dragDemo ? (
                            <span className="chip chip-primary text-[10px]">Arrastrando (demo)</span>
                          ) : null}
                        </div>
                        <div className="mono text-[13px] font-bold text-[var(--obs-text)]">{ex.sets}</div>
                        <div className="text-[13px] text-[var(--obs-text-dim)]">{ex.notes}</div>
                        <div>
                          <button type="button" className="btn btn-ghost btn-sm !h-8 !min-w-8 !px-0">
                            ⋯
                          </button>
                        </div>
                      </div>
                    );
                  })}
                  <div className="border-t px-5 py-3" style={{ borderColor: "var(--obs-border)" }}>
                    <button type="button" className="btn btn-ghost btn-sm">
                      + Agregar ejercicio al bloque
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <button type="button" className="btn btn-ghost mt-4 h-[52px] w-full border-[var(--obs-border-strong)]">
            + Añadir bloque al día
          </button>
        </div>
      </div>
    </Shell>
  );
}
