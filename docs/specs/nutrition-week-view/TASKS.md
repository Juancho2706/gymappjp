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
