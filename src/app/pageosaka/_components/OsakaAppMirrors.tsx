import { OsakaPhoneFrame } from "./OsakaPhoneFrame";
import {
  builderDays,
  builderExerciseRows,
  clientDashboardBullets,
  coachBuilderBullets,
  coachHomeBullets,
  nutritionBuilderBullets,
  nutritionMealsPreview,
  routes,
} from "../_data/app-mirror";

const weekStripClient = ["L", "M", "X", "J", "V", "S", "D"] as const;

function PocketCaption() {
  return (
    <p className="mono pageosaka-pocket-caption lg:hidden">
      Vista bolsillo — en pantalla ancha aparece el tablero completo debajo.
    </p>
  );
}

/** Espejos del producto EVA: plan builder, nutrition editor, dashboards — Osaka + pocket móvil. */
export function OsakaAppMirrors() {
  return (
    <>
      <section id="spec-app-builder" className="pageosaka-specimen" aria-labelledby="spec-app-builder-h">
        <h2 className="sr-only" id="spec-app-builder-h">
          Constructor de plan semanal coach
        </h2>
        <div className="screen-label">
          <span className="num">[APP·1]</span>
          <span className="title">WEEKLY BUILDER // COACH</span>
          <span className="jp-sm" lang="ja">
            週間編集
          </span>
        </div>
        <PocketCaption />

        <div className="pageosaka-pocket-shell lg:hidden">
          <OsakaPhoneFrame compact>
            <div className="player-bar" style={{ padding: "10px 12px" }}>
              <div className="player-info" style={{ flex: 1 }}>
                <div className="name" style={{ fontSize: 13 }}>
                  PUSH · FUERZA 01
                </div>
                <div className="lvl-row">
                  <span className="lvl">A</span>
                  <span className="xp">Sin guardar</span>
                </div>
              </div>
            </div>
            <div className="pageosaka-day-strip" style={{ padding: "8px 10px 0" }} aria-hidden>
              {builderDays.map((d, i) => (
                <div key={d} className={`pageosaka-day-pill${i === 2 ? " is-active" : ""}`} style={{ minWidth: 44, padding: "10px 6px" }}>
                  {d.slice(0, 3)}
                </div>
              ))}
            </div>
            <div style={{ padding: "10px 12px 12px" }}>
              {builderExerciseRows.map((row) => (
                <div key={row.letter} className="enemy" style={{ marginBottom: 6 }}>
                  <span>{row.letter}</span>
                  <span style={{ fontSize: 11 }}>{row.name}</span>
                  <span className="hp" style={{ fontSize: 9 }}>
                    {row.sets}×{row.reps}
                  </span>
                </div>
              ))}
              <button type="button" className="start-cta" style={{ marginTop: 8, fontSize: 15, padding: "12px 14px" }}>
                Guardar
              </button>
            </div>
          </OsakaPhoneFrame>
        </div>

        <div className="hidden lg:block">
          <div className="osaka-desktop-frame">
            <div className="pageosaka-builder-toolbar" role="presentation">
              <span className="chip">← Alumno / plantilla</span>
              <span className="chip" style={{ background: "var(--yellow)" }}>
                PUSH · FUERZA 01
              </span>
              <span className="chip" style={{ background: "var(--bone)", borderColor: "var(--red)", color: "var(--red)" }}>
                ● Sin guardar
              </span>
              <span className="chip">Plantillas</span>
              <span className="chip">Preview</span>
              <span className="chip">Balance</span>
              <span className="chip">PDF</span>
              <span className="chip">↩ ↪</span>
              <span className="chip" style={{ background: "var(--mint)" }}>
                Guardar
              </span>
            </div>

            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", marginBottom: 14 }}>
              <span className="mono" style={{ fontSize: 10, fontWeight: 700, color: "var(--muted)" }}>
                VARIANT
              </span>
              <span className="h-badge black" style={{ padding: "6px 12px" }}>
                A
              </span>
              <span className="h-badge yellow" style={{ padding: "6px 12px", opacity: 0.5 }}>
                B
              </span>
              <span className="mono" style={{ fontSize: 9, marginLeft: "auto", color: "var(--muted)" }}>
                Catálogo: sheet móvil · sidebar md+
              </span>
            </div>

            <div className="pageosaka-day-strip" aria-label="Días de la semana en el builder">
              {builderDays.map((d, i) => (
                <div key={d} className={`pageosaka-day-pill${i === 2 ? " is-active" : ""}`}>
                  {d}
                </div>
              ))}
            </div>

            <p className="mono" style={{ fontSize: 10, marginBottom: 10, color: "var(--red)", fontWeight: 700 }}>
              MIÉRCOLES · BLOQUES · WARMUP → MAIN
            </p>

            {builderExerciseRows.map((row) => (
              <div key={row.letter} className="enemy" style={{ marginBottom: 8 }}>
                <span>{row.letter}</span>
                <span>
                  {row.name}
                  <span className="mono" style={{ display: "block", fontSize: 9, color: "var(--muted)", marginTop: 4 }}>
                    {"note" in row ? row.note : ""}
                    {"tempo" in row ? ` · tempo ${row.tempo}` : ""}
                  </span>
                </span>
                <span className="hp">
                  {row.sets}×{row.reps} · {row.kg}kg · {row.rest}
                </span>
              </div>
            ))}

            <ul className="mono" style={{ margin: "16px 0 0", paddingLeft: "1.1em", fontSize: 10, lineHeight: 1.65, color: "var(--ink)" }}>
              {coachBuilderBullets.map((b, i) => (
                <li key={`cb-${i}`}>{b}</li>
              ))}
            </ul>

            <div className="pageosaka-app-routes" aria-label="Rutas en la app real">
              Rutas: <code>{routes.planBuilderClient}</code> · <code>{routes.planBuilderTemplate}</code>
            </div>
          </div>
        </div>
      </section>

      <section id="spec-app-nutrition-editor" className="pageosaka-specimen" aria-labelledby="spec-app-nutrition-h">
        <h2 className="sr-only" id="spec-app-nutrition-h">
          Editor de nutrición coach
        </h2>
        <div className="screen-label">
          <span className="num">[APP·2]</span>
          <span className="title">MACRO EDITOR // NUTRITION</span>
          <span className="jp-sm" lang="ja">
            栄養編集
          </span>
        </div>
        <PocketCaption />

        <div className="pageosaka-pocket-shell lg:hidden">
          <OsakaPhoneFrame compact>
            <div style={{ padding: "12px" }}>
              <p className="mono" style={{ fontSize: 9, color: "var(--muted)", marginBottom: 8 }}>
                PlanBuilder · alumno
              </p>
              <div className="stats-grid-3" style={{ boxShadow: "3px 3px 0 var(--black)", marginBottom: 10 }}>
                <div className="stat-cell">
                  <div className="val" style={{ fontSize: 15 }}>
                    2400
                  </div>
                  <div className="lbl">kcal</div>
                </div>
                <div className="stat-cell">
                  <div className="val red" style={{ fontSize: 15 }}>
                    165
                  </div>
                  <div className="lbl">Prot g</div>
                </div>
                <div className="stat-cell">
                  <div className="val" style={{ fontSize: 15 }}>
                    220
                  </div>
                  <div className="lbl">Carb g</div>
                </div>
              </div>
              <div className="mission-main" style={{ boxShadow: "4px 4px 0 var(--black)" }}>
                <div className="m-head">
                  <span className="stage">{nutritionMealsPreview[0].name.toUpperCase()}</span>
                  <span className="jp-side" lang="ja">
                    食
                  </span>
                </div>
                <div className="m-body" style={{ paddingTop: 12, paddingBottom: 12 }}>
                  <div className="enemies-list" style={{ gap: 4 }}>
                    {nutritionMealsPreview[0].items.map((it) => (
                      <div key={it.food} className="enemy" style={{ fontSize: 11 }}>
                        <span>◇</span>
                        <span>{it.food}</span>
                        <span className="hp">
                          {it.qty}
                          {it.unit}
                        </span>
                      </div>
                    ))}
                  </div>
                  <button type="button" className="start-cta" style={{ marginTop: 10, fontSize: 14 }}>
                    + Alimento
                  </button>
                </div>
              </div>
            </div>
          </OsakaPhoneFrame>
        </div>

        <div className="hidden lg:block">
          <div className="osaka-desktop-frame">
            <div className="pageosaka-app-split">
              <aside className="pageosaka-app-split-sidebar">
                <div className="style-block" style={{ marginBottom: 0, boxShadow: "4px 4px 0 var(--black)" }}>
                  <h4 style={{ marginBottom: 12, fontSize: 13 }}>
                    Plan <span className="jp-sm">計画</span>
                  </h4>
                  <p className="mono" style={{ fontSize: 10, marginBottom: 8, color: "var(--muted)" }}>
                    NOMBRE
                  </p>
                  <div
                    className="mono"
                    style={{
                      border: "2px solid var(--black)",
                      padding: "10px 12px",
                      fontSize: 12,
                      fontWeight: 700,
                      marginBottom: 14,
                      background: "var(--ivory)",
                    }}
                  >
                    Hipertrofia · off-season
                  </div>
                  <div className="stats-grid-3" style={{ marginBottom: 12, boxShadow: "3px 3px 0 var(--black)" }}>
                    <div className="stat-cell">
                      <div className="val" style={{ fontSize: 16 }}>
                        2400
                      </div>
                      <div className="lbl">kcal</div>
                    </div>
                    <div className="stat-cell">
                      <div className="val red" style={{ fontSize: 16 }}>
                        165
                      </div>
                      <div className="lbl">P</div>
                    </div>
                    <div className="stat-cell">
                      <div className="val" style={{ fontSize: 16 }}>
                        220
                      </div>
                      <div className="lbl">C</div>
                    </div>
                  </div>
                  <p className="mono" style={{ fontSize: 9, marginBottom: 6 }}>
                    Grasas 62g · sync con totales reales
                  </p>
                  <p className="mono" style={{ fontSize: 9, color: "var(--muted)", marginBottom: 12 }}>
                    Instrucciones coach (textarea en app)…
                  </p>
                  <button type="button" className="start-cta" style={{ marginTop: 4 }}>
                    Guardar plan
                  </button>
                </div>
              </aside>

              <div className="pageosaka-app-split-main">
                <p className="mono" style={{ fontSize: 10, marginBottom: 12, color: "var(--red)", fontWeight: 700 }}>
                  LIENZO · comidas ordenables (dnd-kit) · + añadir comida
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {nutritionMealsPreview.map((meal) => (
                    <div key={meal.name} className="mission-main" style={{ boxShadow: "4px 4px 0 var(--black)" }}>
                      <div className="m-head">
                        <span className="stage">{meal.name.toUpperCase()}</span>
                        <span className="jp-side" lang="ja">
                          食
                        </span>
                      </div>
                      <div className="m-body" style={{ paddingTop: 14 }}>
                        <div className="enemies-list" style={{ gap: 6 }}>
                          {meal.items.map((it) => (
                            <div key={it.food} className="enemy">
                              <span>◇</span>
                              <span>{it.food}</span>
                              <span className="hp">
                                {it.qty}
                                {it.unit}
                              </span>
                            </div>
                          ))}
                        </div>
                        <button type="button" className="start-cta" style={{ marginTop: 14, fontSize: 14, padding: "12px 14px" }}>
                          + Buscar alimento
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <ul className="mono" style={{ margin: "16px 0 0", paddingLeft: "1.1em", fontSize: 10, lineHeight: 1.65, color: "var(--ink)" }}>
              {nutritionBuilderBullets.map((b, i) => (
                <li key={`nb-${i}`}>{b}</li>
              ))}
            </ul>

            <div className="pageosaka-app-routes">
              Hub: <code>{routes.nutritionPlansHub}</code> · editor: <code>{routes.nutritionClientPlan}</code> ·{" "}
              <code>{routes.nutritionLegacyRedirect}</code>
            </div>
          </div>
        </div>
      </section>

      <section id="spec-app-client-dash" className="pageosaka-specimen" aria-labelledby="spec-app-client-dash-h">
        <h2 className="sr-only" id="spec-app-client-dash-h">
          Dashboard del alumno
        </h2>
        <div className="screen-label">
          <span className="num">[APP·3]</span>
          <span className="title">HOME STAGE // CLIENT</span>
          <span className="jp-sm" lang="ja">
            ホーム
          </span>
        </div>
        <PocketCaption />

        <div className="pageosaka-pocket-shell lg:hidden">
          <OsakaPhoneFrame compact>
            <div className="pageosaka-day-strip" style={{ padding: "10px 10px 0" }} aria-label="Semana">
              {weekStripClient.map((d, i) => (
                <div key={d + i} className={`pageosaka-day-pill${i === 3 ? " is-active" : ""}`} style={{ minWidth: 40, padding: "8px 4px", fontSize: 9 }}>
                  {d}
                </div>
              ))}
            </div>
            <div style={{ padding: "0 10px" }}>
              <div className="achievement" style={{ margin: "10px 0", background: "var(--yellow)" }}>
                <div className="info" style={{ flex: 1 }}>
                  <div className="kick">Check-in</div>
                  <div className="name" style={{ fontSize: 12 }}>
                    Registro mensual
                  </div>
                </div>
              </div>
              <div className="mission-main" style={{ boxShadow: "4px 4px 0 var(--black)" }}>
                <div className="m-head">
                  <span className="stage">Hoy</span>
                  <span className="jp-side" lang="ja">
                    今日
                  </span>
                </div>
                <div className="m-body" style={{ paddingTop: 12, paddingBottom: 14 }}>
                  <h4 style={{ fontSize: 22 }}>
                    PUSH
                    <br />
                    DAY
                  </h4>
                  <div className="xp-bar osaka-xp-bar" role="progressbar" aria-valuenow={45} aria-valuemin={0} aria-valuemax={100} aria-label="Progreso de series">
                    <span className="xp-bar-fill" style={{ width: "45%" }} />
                  </div>
                  <button type="button" className="start-cta" style={{ marginTop: 10 }}>
                    Entrar
                  </button>
                </div>
              </div>
            </div>
          </OsakaPhoneFrame>
        </div>

        <div className="hidden lg:block">
          <div className="osaka-desktop-frame">
            <div className="pageosaka-client-mini-grid">
              <div>
                <p className="mono" style={{ fontSize: 9, marginBottom: 8, color: "var(--muted)" }}>
                  WeekCalendar · pull-to-refresh en app
                </p>
                <div className="pageosaka-day-strip" aria-label="Semana resumida">
                  {weekStripClient.map((d, i) => (
                    <div key={d + i} className={`pageosaka-day-pill${i === 3 ? " is-active" : ""}`}>
                      {d}
                    </div>
                  ))}
                </div>

                <div className="achievement" style={{ margin: "0 0 14px", background: "var(--yellow)", borderColor: "var(--black)" }}>
                  <div className="info" style={{ flex: 1 }}>
                    <div className="kick">Check-in banner</div>
                    <div className="name">Toca para completar tu registro mensual</div>
                  </div>
                </div>

                <div className="mission-main" style={{ boxShadow: "5px 5px 0 var(--black)" }}>
                  <div className="m-head">
                    <span className="stage">WorkoutHeroCard</span>
                    <span className="jp-side" lang="ja">
                      今日
                    </span>
                  </div>
                  <div className="m-body">
                    <h4 style={{ fontSize: 26 }}>
                      PUSH
                      <br />
                      DAY
                    </h4>
                    <div className="sub">Bloques A–C · progreso de series en vivo</div>
                    <div className="xp-bar osaka-xp-bar" role="progressbar" aria-valuenow={45} aria-valuemin={0} aria-valuemax={100} aria-label="Progreso de series">
                      <span className="xp-bar-fill" style={{ width: "45%" }} />
                    </div>
                    <button type="button" className="start-cta">
                      Continuar entreno
                    </button>
                  </div>
                </div>

                <p className="mono" style={{ fontSize: 9, marginTop: 12, color: "var(--muted)" }}>
                  Debajo en app: ActiveProgramSection · RecentWorkoutsSection · WeightFullChartSection
                </p>
              </div>

              <aside className="style-block" style={{ boxShadow: "4px 4px 0 var(--black)" }}>
                <h4 style={{ fontSize: 12, marginBottom: 12 }}>
                  Sidebar <span className="jp-sm">脇</span>
                </h4>
                <p className="mono" style={{ fontSize: 9, marginBottom: 10 }}>
                  DashboardSidebarBlocks
                </p>
                <div className="stats-grid-3" style={{ marginBottom: 12, boxShadow: "3px 3px 0 var(--black)" }}>
                  <div className="stat-cell">
                    <div className="val" style={{ fontSize: 18 }}>
                      82%
                    </div>
                    <div className="lbl">Train</div>
                  </div>
                  <div className="stat-cell">
                    <div className="val mint" style={{ fontSize: 18 }}>
                      76%
                    </div>
                    <div className="lbl">Meals</div>
                  </div>
                  <div className="stat-cell">
                    <div className="val red" style={{ fontSize: 18 }}>
                      ×4
                    </div>
                    <div className="lbl">Streak</div>
                  </div>
                </div>
                <div className="side-mission" style={{ marginBottom: 10 }}>
                  <div className="tag">PR</div>
                  <div className="name" style={{ fontSize: 12 }}>
                    Bench +2.5 kg
                  </div>
                  <div className="meta">PersonalRecordsBanner</div>
                </div>
                <div className="reward-chip mint" style={{ width: "100%", justifyContent: "center" }}>
                  NutritionDailySummary
                </div>
              </aside>
            </div>

            <ul className="mono" style={{ margin: "16px 0 0", paddingLeft: "1.1em", fontSize: 10, lineHeight: 1.65, color: "var(--ink)" }}>
              {clientDashboardBullets.map((b, i) => (
                <li key={`cd-${i}`}>{b}</li>
              ))}
            </ul>

            <div className="pageosaka-app-routes">
              Ruta: <code>{routes.clientDashboard}</code>
            </div>
          </div>
        </div>
      </section>

      <section id="spec-app-coach-home" className="pageosaka-specimen" aria-labelledby="spec-app-coach-home-h">
        <h2 className="sr-only" id="spec-app-coach-home-h">
          Dashboard coach
        </h2>
        <div className="screen-label">
          <span className="num">[APP·4]</span>
          <span className="title">HQ DASHBOARD // COACH</span>
          <span className="jp-sm" lang="ja">
            司令部
          </span>
        </div>
        <PocketCaption />

        <div className="pageosaka-pocket-shell lg:hidden">
          <OsakaPhoneFrame compact>
            <div style={{ padding: "12px" }}>
              <p className="mono" style={{ fontSize: 9, color: "var(--muted)", marginBottom: 10 }}>
                CoachDashboardClient
              </p>
              <div className="stats-grid-3" style={{ boxShadow: "4px 4px 0 var(--black)", marginBottom: 12 }}>
                <div className="stat-cell">
                  <div className="val" style={{ fontSize: 17 }}>
                    $420k
                  </div>
                  <div className="lbl">MRR</div>
                </div>
                <div className="stat-cell">
                  <div className="val red" style={{ fontSize: 17 }}>
                    48
                  </div>
                  <div className="lbl">Alumnos</div>
                </div>
                <div className="stat-cell">
                  <div className="val mint" style={{ fontSize: 17 }}>
                    36
                  </div>
                  <div className="lbl">Planes</div>
                </div>
              </div>
              <div className="score-row top">
                <div className="rank">!</div>
                <div className="name" style={{ fontSize: 11 }}>
                  Riesgo · sin log<span className="sub">7 días</span>
                </div>
                <div className="value" style={{ fontSize: 12 }}>
                  →
                </div>
              </div>
            </div>
          </OsakaPhoneFrame>
        </div>

        <div className="hidden lg:block">
          <div className="osaka-desktop-frame">
            <div className="stats-grid-3" style={{ marginBottom: 20, maxWidth: 720, width: "100%" }}>
              <div className="stat-cell">
                <div className="val" style={{ fontSize: 20 }}>
                  $420k
                </div>
                <div className="lbl">MRR · CLP</div>
              </div>
              <div className="stat-cell">
                <div className="val red" style={{ fontSize: 20 }}>
                  48
                </div>
                <div className="lbl">Alumnos</div>
              </div>
              <div className="stat-cell">
                <div className="val mint" style={{ fontSize: 20 }}>
                  36
                </div>
                <div className="lbl">Planes activos</div>
              </div>
            </div>

            <div className="pageosaka-client-mini-grid">
              <div className="style-block" style={{ boxShadow: "4px 4px 0 var(--black)", marginBottom: 0 }}>
                <h4 style={{ fontSize: 12, marginBottom: 10 }}>Charts · recharts</h4>
                <div
                  className="mono"
                  style={{
                    height: 120,
                    border: "2px dashed var(--black)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 10,
                    color: "var(--muted)",
                    background: "repeating-linear-gradient(90deg, var(--ivory-2) 0, var(--ivory-2) 12px, transparent 12px, transparent 24px)",
                  }}
                >
                  Adherencia entreno vs macros (modal info en app)
                </div>
              </div>
              <div className="style-block" style={{ boxShadow: "4px 4px 0 var(--black)", marginBottom: 0 }}>
                <h4 style={{ fontSize: 12, marginBottom: 10 }}>Riesgo · vencimientos</h4>
                <div className="score-row top">
                  <div className="rank">!</div>
                  <div className="name">
                    Cliente sin log<span className="sub">7 días · topRiskClients</span>
                  </div>
                  <div className="value">
                    PING<span className="unit">→</span>
                  </div>
                </div>
                <div className="score-row">
                  <div className="rank">02</div>
                  <div className="name">
                    Plan vence 02/05<span className="sub">expiringPrograms</span>
                  </div>
                  <div className="value">
                    FIX<span className="unit">→</span>
                  </div>
                </div>
              </div>
            </div>

            <ul className="mono" style={{ margin: "16px 0 0", paddingLeft: "1.1em", fontSize: 10, lineHeight: 1.65, color: "var(--ink)" }}>
              {coachHomeBullets.map((b, i) => (
                <li key={`ch-${i}`}>{b}</li>
              ))}
            </ul>

            <div className="pageosaka-app-routes">
              Ruta: <code>{routes.coachDashboard}</code> · componente: <code>CoachDashboardClient</code>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
