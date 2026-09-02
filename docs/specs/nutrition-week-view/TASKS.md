# TASKS — Semana completa de nutrición (week view)

Estado: `[ ]` pendiente · `[x]` hecho · ejecución por workers Opus con juicio Fable por wave.

## W1 — Dominio compartido
- [x] T1.1 `packages/nutrition-v2/week-view.ts`: `NutritionWeekDayState`, `NutritionWeekCell`,
      `buildNutritionWeek()` (reglas de SPEC: dow-resolve, snapshot gana, consumed null,
      legacy V1, siempre 7 celdas Lu..Do).
- [x] T1.2 `packages/nutrition-v2/week-view.test.ts`: plan sin default; dos variantes mismo dow;
      semana con huecos; día legacy; cruce de versión (snapshot gana); cruce de timezone.
- [x] T1.3 Export en `packages/nutrition-v2/index.ts`.

## W2 — Componente compartido
- [x] T2.1 `apps/web/src/components/nutrition-v2/WeekDayNav.tsx` (client): 7 chips, hoy marcado,
      dot de estado, seleccionado con acento, a11y teclado, tokens.
- [x] T2.2 `apps/mobile/components/nutrition-v2/WeekDayNav.tsx`: gemelo NativeWind, Pressable
      44pt, accessibilityLabel día+estado, sin className+style-función.

## W3 — Superficies (paralelo)
- [x] T3.1 Alumno web · tab Plan: WeekDayNav + una sola `PlanVariantCard` (día seleccionado,
      `?dow=`), "Metas diarias" de la variante seleccionada; retira la pila de 7 cards.
- [x] T3.2 Alumno web · tab Hoy: WeekDayNav sticky + `?date=`; pasado read-only con banner y
      resultados del history; futuro preview proyectado sin controles; hoy intacto.
- [x] T3.3 Alumno RN · tabs Hoy y Plan: ídem con estado local + `load(date)`; historial tappable
      → abre el día en modo lectura.
- [x] T3.4 Coach web · ficha `[clientId]`: `?date=` + WeekDayNav con adherencia por chip
      (recentDays, recorte Pro antes de componer); "Últimos días" enlaza `?date=`.
- [x] T3.5 Coach RN · ficha: WeekDayNav sobre clientDetail; día seleccionado muestra consumo de
      ese día (recentDays) + variante que aplicó.

## Cierre
- [x] T4.1 Gates: `pnpm lint` · `pnpm typecheck` · `pnpm test` · `pnpm --filter @eva/mobile exec tsc --noEmit`.
- [x] T4.2 Juicio Fable de estilo por superficie (checklist PLAN §Craft).
- [x] T4.3 Actualizar `docs/status/CURRENT.md` + `docs/status/MOBILE_PARITY.md`.

## W5 — «Futuro visible, solo lectura» (2026-08-22, feedback de alumno)

- [x] T5.1 Verificado contra el código: los 7 chips ya eran seleccionables (futuro incluido) y el
      futuro ya renderizaba en solo lectura en web y RN. No había guard que quitar; la hipótesis
      inicial (`WeekDayNav.tsx` `hasLoggedIntake`) era el punto de estado, no la selección.
- [x] T5.2 Regla escrita en el SPEC (§«Regla cerrada 2026-08-22») para que ningún guard futuro la
      reabra.
- [x] T5.3 Puente al plan del día desde el resumen del día PASADO ("Ver el plan del lunes"):
      helper compartido `formatNutritionWeekPlanLinkLabel` + `alignNutritionIsoToWeekOf`,
      `PastDaySummary` web (`?view=plan&dow=N`) y tab Hoy de RN (`onOpenPlanDay` → `PlanTab`).
- [x] T5.4 Tests del contrato en `week-view.test.ts` (futuro seleccionable, cero escritura) y en
      `week-nav.logic.test.ts` (la web acepta un `?date=` futuro de la semana).
- Nota de producto (NO es tarea de esta spec): **lista de compras** de la semana — idea anotada, sin
  implementar.

## QA (agregado el 2026-08-19)

Esta spec cerró **sin una sola tarea de QA**: tener todo en `[x]` prueba código, no comportamiento.
Ninguna de las rondas registradas del owner (15, 16, 17 y 18-08) menciona la semana completa.

- [ ] QA en device del owner de las 5 superficies: sábado/domingo desde Hoy y desde Plan (cero 4xx
      en consola, cero controles de registro), y QA visual web (alumno tab Plan y tab Hoy, coach
      ficha) — **pendiente (auditoría 17-08, fusiona T5.5 + la QA visual de abajo)**.
- [ ] Caso de riesgo declarado en el PLAN y nunca evaluado: la semana que **cruza cambio de versión
      del plan**. La regla «snapshot gana» cubre el caso normal; la opción B
      (`get_nutrition_week_v2`) quedó documentada por si el QA la exigía. **Investigar 02-09 (jefe).**
