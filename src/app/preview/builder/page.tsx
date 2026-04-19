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
  { name: "Press banca", tag: "Pecho", equip: "Barra" },
  { name: "Press inclinado", tag: "Pecho", equip: "Mancuernas" },
  { name: "Press militar", tag: "Hombro", equip: "Barra" },
  { name: "Elevaciones laterales", tag: "Hombro", equip: "Mancuernas" },
  { name: "Fondos", tag: "Pecho", equip: "Peso corporal" },
  { name: "Tríceps polea", tag: "Tríceps", equip: "Polea" },
];

export default function BuilderPreview() {
  return (
    <Shell
      active="Builder"
      title="Hipertrofia · 12 Semanas"
      subtitle="Plan de Lucía Fernández — Semana 8 · Día 2"
      actions={
        <>
          <span className="chip chip-accent"><span className="dot" style={{ background: "#047F68" }} /> Guardado</span>
          <button className="btn btn-ghost btn-sm">Previsualizar</button>
          <button className="btn btn-primary btn-sm">Publicar cambios</button>
        </>
      }
    >
      {/* Week strip */}
      <div className="surface" style={{ padding: 20, marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div>
            <div className="label" style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--c-muted-fg)" }}>
              Semana 8 de 12
            </div>
            <div className="display" style={{ fontSize: 20, marginTop: 4 }}>Microciclo de acumulación</div>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button className="btn btn-ghost btn-sm">← S7</button>
            <button className="btn btn-ghost btn-sm">S9 →</button>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 8 }}>
          {days.map((d) => (
            <div
              key={d.label}
              style={{
                padding: "14px 12px",
                borderRadius: 10,
                border: d.active ? "2px solid var(--c-primary)" : "1px solid var(--c-border)",
                background: d.active ? "rgba(107,33,254,0.08)" : d.rest ? "var(--c-muted)" : "var(--c-card)",
                cursor: "pointer",
                position: "relative",
              }}
            >
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--c-muted-fg)" }}>
                {d.label}
              </div>
              <div style={{ fontSize: 14, fontWeight: 700, marginTop: 6 }}>{d.name}</div>
              {d.done && <span className="chip chip-success" style={{ marginTop: 8, height: 20, fontSize: 10 }}>✓ Hecho</span>}
              {d.active && <span className="chip chip-primary" style={{ marginTop: 8, height: 20, fontSize: 10 }}>Editando</span>}
            </div>
          ))}
        </div>
      </div>

      {/* Main builder layout */}
      <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", gap: 16 }}>
        {/* Library */}
        <div className="surface" style={{ padding: 20, height: "fit-content", position: "sticky", top: 16 }}>
          <div className="label" style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--c-muted-fg)", marginBottom: 10 }}>
            Biblioteca
          </div>
          <input className="input" placeholder="Buscar ejercicio…" style={{ marginBottom: 14 }} />
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 16 }}>
            {["Todos", "Pecho", "Espalda", "Pierna", "Hombro", "Core"].map((t, i) => (
              <span key={t} className={`chip ${i === 0 ? "chip-primary" : ""}`} style={{ cursor: "pointer" }}>{t}</span>
            ))}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {exerciseLibrary.map((e) => (
              <div key={e.name} style={{
                padding: 12,
                border: "1px solid var(--c-border)",
                borderRadius: 10,
                cursor: "grab",
                background: "var(--c-card)",
                transition: "border-color 100ms ease, transform 100ms ease",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ color: "var(--c-muted-fg)", fontSize: 14 }}>⋮⋮</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{e.name}</div>
                    <div style={{ fontSize: 11, color: "var(--c-muted-fg)", marginTop: 2 }}>{e.tag} · {e.equip}</div>
                  </div>
                  <span style={{ color: "var(--c-primary)", fontSize: 16, fontWeight: 700 }}>+</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Day editor */}
        <div>
          <div className="surface-dark" style={{ padding: 24, marginBottom: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", opacity: 0.5 }}>
                  Día en edición
                </div>
                <div className="display" style={{ fontSize: 34, marginTop: 6 }}>{workoutDay.name}</div>
                <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
                  <span className="chip chip-dark">⏱ {workoutDay.duration}</span>
                  <span className="chip chip-dark">4 bloques</span>
                  <span className="chip chip-dark">9 ejercicios</span>
                </div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="btn btn-ghost btn-sm" style={{ borderColor: "rgba(255,255,255,0.2)", color: "#fff" }}>Duplicar día</button>
                <button className="btn btn-accent btn-sm">+ Bloque</button>
              </div>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {workoutDay.blocks.map((block) => (
              <div key={block.letter} className="surface" style={{ padding: 0, overflow: "hidden" }}>
                <div style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                  padding: "16px 20px",
                  background: "var(--c-bg-2)",
                  borderBottom: "1px solid var(--c-border)",
                }}>
                  <span style={{ color: "var(--c-muted-fg)" }}>⋮⋮</span>
                  <div style={{
                    width: 36, height: 36, borderRadius: 8,
                    background: "var(--c-dark)", color: "#fff",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontFamily: "var(--font-montserrat)", fontWeight: 800, fontSize: 16,
                  }}>{block.letter}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 15, fontWeight: 700 }}>{block.title}</div>
                    <div style={{ fontSize: 11, color: "var(--c-muted-fg)" }}>{block.exercises.length} ejercicios</div>
                  </div>
                  <button className="btn btn-ghost btn-sm">Editar</button>
                </div>

                <div>
                  <div className="row head" style={{ gridTemplateColumns: "24px 2fr 1fr 1.5fr 60px", borderTop: "none" }}>
                    <div></div>
                    <div>Ejercicio</div>
                    <div>Sets × Reps</div>
                    <div>Notas</div>
                    <div></div>
                  </div>
                  {block.exercises.map((ex, i) => (
                    <div key={i} className="row" style={{ gridTemplateColumns: "24px 2fr 1fr 1.5fr 60px" }}>
                      <div style={{ color: "var(--c-muted-fg)" }}>⋮⋮</div>
                      <div style={{ fontSize: 14, fontWeight: 600 }}>{ex.name}</div>
                      <div className="mono" style={{ fontSize: 13, fontWeight: 700, color: "var(--c-primary)" }}>{ex.sets}</div>
                      <div style={{ fontSize: 13, color: "var(--c-muted-fg)" }}>{ex.notes}</div>
                      <div style={{ display: "flex", gap: 4 }}>
                        <button className="btn btn-ghost btn-sm" style={{ width: 28, padding: 0 }}>⋯</button>
                      </div>
                    </div>
                  ))}
                  <div style={{ padding: "12px 20px", borderTop: "1px solid var(--c-border)" }}>
                    <button className="btn btn-ghost btn-sm">+ Agregar ejercicio al bloque</button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <button className="btn btn-dark" style={{ marginTop: 16, width: "100%", height: 52 }}>
            + Añadir bloque al día
          </button>
        </div>
      </div>
    </Shell>
  );
}
