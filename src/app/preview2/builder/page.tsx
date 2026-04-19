import { Shell2 } from "../_components/Shell2";
import { workoutDay } from "../../preview/_data/mock";

const days = [
  { label: "L", name: "Tracción", done: true },
  { label: "M", name: "Empuje", active: true },
  { label: "X", name: "Piernas", done: false },
  { label: "J", name: "OFF", rest: true },
  { label: "V", name: "Upper", done: false },
  { label: "S", name: "Lower", done: false },
  { label: "D", name: "OFF", rest: true },
];

const library = [
  { name: "Press banca", tag: "Pecho" },
  { name: "Press inclinado", tag: "Pecho" },
  { name: "Press militar", tag: "Hombro" },
  { name: "Elevaciones lat.", tag: "Hombro" },
  { name: "Fondos", tag: "Tríceps" },
  { name: "Tríceps polea", tag: "Tríceps" },
  { name: "Face pull", tag: "Hombro" },
];

export default function Builder2() {
  return (
    <Shell2
      active="Builder"
      title="BUILDER"
      subtitle="Lucía F. · Hipertrofia 12S · S8"
      actions={
        <>
          <span className="tag tag-lime"><span className="live-dot" style={{ background: "var(--s-lime-dark)", border: "1.5px solid var(--s-ink)" }} /> Guardado</span>
          <button className="btn btn-ghost btn-sm">Preview</button>
          <button className="btn btn-primary btn-sm">Publicar</button>
        </>
      }
    >
      {/* Week strip — editorial newspaper style */}
      <div style={{ border: "3px solid var(--s-ink)", marginBottom: 20, overflow: "hidden" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)" }}>
          {days.map((d, i) => (
            <div key={d.label} style={{
              padding: "16px 14px",
              borderRight: i < 6 ? "2px solid var(--s-ink)" : "none",
              background: d.active ? "var(--s-red)" : d.done ? "var(--s-ink)" : d.rest ? "var(--s-paper-3)" : "var(--s-paper)",
              color: d.active ? "var(--s-paper)" : d.done ? "var(--s-paper)" : "var(--s-ink)",
              cursor: "pointer",
              position: "relative",
            }}>
              <div className="label-caps" style={{ fontSize: 9, opacity: 0.7 }}>DÍA</div>
              <div className="display" style={{ fontSize: 28, marginTop: 2 }}>{d.label}</div>
              <div style={{ fontSize: 12, fontWeight: 600, marginTop: 6 }}>{d.name}</div>
              {d.done && <div className="label-caps" style={{ fontSize: 9, marginTop: 8, color: "var(--s-lime)" }}>✓ OK</div>}
              {d.active && <div className="label-caps" style={{ fontSize: 9, marginTop: 8, color: "rgba(255,255,255,0.8)" }}>EDITANDO</div>}
            </div>
          ))}
        </div>
      </div>

      {/* Builder grid: library + editor */}
      <div style={{ display: "grid", gridTemplateColumns: "260px 1fr", gap: 16 }}>
        {/* Library panel */}
        <div className="card" style={{ overflow: "hidden", alignSelf: "start", position: "sticky", top: 16 }}>
          <div style={{ padding: "14px 18px", borderBottom: "2px solid var(--s-ink)", background: "var(--s-ink)" }}>
            <div className="display" style={{ fontSize: 16, color: "var(--s-paper)" }}>BIBLIOTECA</div>
          </div>
          <div style={{ padding: 14 }}>
            <input className="input" placeholder="Buscar ejercicio…" style={{ marginBottom: 12 }} />
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14 }}>
              {["Todo", "Pecho", "Espalda", "Pierna", "Hombro"].map((t, i) => (
                <button key={t} className={`tag ${i === 0 ? "tag-red" : ""}`} style={{ cursor: "pointer", border: "2px solid var(--s-ink)", boxShadow: i === 0 ? "var(--s-shadow-sm)" : "none" }}>{t}</button>
              ))}
            </div>
            {library.map((e) => (
              <div key={e.name} style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "10px 12px",
                border: "2px solid var(--s-ink)",
                marginBottom: 6,
                background: "var(--s-paper)",
                cursor: "grab",
                transition: "box-shadow 80ms, transform 80ms",
                borderRadius: "var(--s-radius)",
              }}>
                <span style={{ color: "var(--s-ink-3)", fontSize: 14, userSelect: "none" }}>⣿</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>{e.name}</div>
                  <div className="label-caps" style={{ fontSize: 9 }}>{e.tag}</div>
                </div>
                <button style={{ width: 24, height: 24, border: "2px solid var(--s-ink)", background: "var(--s-red)", color: "#fff", fontWeight: 900, fontSize: 14, cursor: "pointer", borderRadius: "2px" }}>+</button>
              </div>
            ))}
          </div>
        </div>

        {/* Day editor */}
        <div>
          {/* Day header */}
          <div style={{ border: "3px solid var(--s-ink)", background: "var(--s-ink)", color: "var(--s-paper)", padding: "20px 24px", display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <div>
              <div className="label-caps" style={{ color: "rgba(255,255,255,0.5)" }}>Editando</div>
              <div className="display" style={{ fontSize: 36 }}>{workoutDay.name.toUpperCase()}</div>
              <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                <span className="tag tag-paper" style={{ fontSize: 11 }}>⏱ {workoutDay.duration}</span>
                <span className="tag tag-paper" style={{ fontSize: 11 }}>4 bloques</span>
                <span className="tag tag-paper" style={{ fontSize: 11 }}>9 ejercicios</span>
              </div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn btn-ghost btn-sm" style={{ color: "var(--s-paper)", borderColor: "rgba(255,255,255,0.25)" }}>Duplicar día</button>
              <button className="btn btn-lime btn-sm">+ Bloque</button>
            </div>
          </div>

          {/* Blocks */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {workoutDay.blocks.map((block) => (
              <div key={block.letter} className="card" style={{ overflow: "hidden" }}>
                {/* Block header */}
                <div style={{
                  display: "flex", alignItems: "center", gap: 14, padding: "14px 20px",
                  background: "var(--s-paper-2)",
                  borderBottom: "2px solid var(--s-ink)",
                }}>
                  <span style={{ color: "var(--s-ink-3)", cursor: "grab" }}>⣿</span>
                  <div style={{
                    width: 40, height: 40,
                    background: "var(--s-ink)", color: "var(--s-paper)",
                    border: "2px solid var(--s-ink)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontFamily: "var(--s-font-display)",
                    fontWeight: 900, fontSize: 20,
                    boxShadow: "var(--s-shadow-sm)",
                  }}>{block.letter}</div>
                  <div style={{ flex: 1 }}>
                    <div className="display" style={{ fontSize: 18 }}>{block.title.toUpperCase()}</div>
                    <div className="label-caps" style={{ fontSize: 9 }}>{block.exercises.length} ejercicios</div>
                  </div>
                  <button className="btn btn-ghost btn-sm">Editar</button>
                </div>

                {/* Exercises */}
                <div className="row head" style={{ gridTemplateColumns: "20px 2fr 1fr 1.5fr 48px", borderTop: "none", borderBottom: "2px solid var(--s-ink)" }}>
                  <div></div>
                  <div>Ejercicio</div>
                  <div>Sets × Reps</div>
                  <div>Notas</div>
                  <div></div>
                </div>
                {block.exercises.map((ex, i) => (
                  <div key={i} className="row" style={{ gridTemplateColumns: "20px 2fr 1fr 1.5fr 48px" }}>
                    <span style={{ color: "var(--s-mid)", cursor: "grab" }}>⣿</span>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{ex.name}</div>
                    <div className="mono" style={{ fontWeight: 900, fontSize: 15, color: "var(--s-red)", fontFamily: "var(--s-font-display)" }}>{ex.sets}</div>
                    <div style={{ fontSize: 12, color: "var(--s-ink-3)" }}>{ex.notes}</div>
                    <button className="btn btn-ghost btn-sm" style={{ width: 32, padding: 0, fontSize: 16 }}>⋯</button>
                  </div>
                ))}
                <div style={{ padding: "12px 20px", borderTop: "1px solid var(--s-ink)" }}>
                  <button className="btn btn-ghost btn-sm">+ Ejercicio al bloque</button>
                </div>
              </div>
            ))}
          </div>

          <button className="btn btn-ink btn-lg" style={{ marginTop: 14, width: "100%", border: "3px solid var(--s-ink)", boxShadow: "var(--s-shadow-lg)" }}>
            + AÑADIR BLOQUE
          </button>
        </div>
      </div>
    </Shell2>
  );
}
