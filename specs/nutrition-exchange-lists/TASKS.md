# TASKS — Listas de equivalencia propias del coach (F2)

## T1 — DB
- [x] T1.1 Migracion `exchange_group_foods`: tabla, unique, checks, RLS, grants column-level, indices, trigger.
- [x] T1.2 Migracion de backfill idempotente de las 2.525 clasificaciones como filas sin dueno (`source='catalog'`).
- [x] T1.3 Parche del bloque `exchangeFoods` de `get_nutrition_today_v2` (union + precedencia + `is_excluded`).
- [x] T1.4 `BEGIN/ROLLBACK` de las tres en LIVE + APLICADAS + advisors sin hallazgos nuevos + `database.types.ts` al dia.

## T2 — Contratos compartidos
- [x] T2.1 `UpsertExchangeGroupFoodSchema` / `Exclude...` / `Remove...` / `DuplicateExchangeGroupSchema`.
- [x] T2.2 `suggestPortionGrams()` puro + tests (macro dominante, base per_100/per_serving, sin macros, trazas, redondeo).
- [x] T2.3 `formatPortionSentence()` + `rescalePortionGrams()` + `resolveExchangeListRows()` con tests.
- [x] T2.4 `suggestExchangeGroupCode` / `suggestFreeExchangeGroupCode` movidas a `@eva/schemas` (RN tenia su propia copia).

## T3 — Backend web
- [x] T3.1 `exchange-group-foods.repository.ts` (listar, upsert propio, excluir, restaurar, copiar, buscar candidatos, contar).
- [x] T3.2 `exchange-lists.service.ts` (visibilidad de grupo y alimento, dueno coach-scoped, reescalado, doble escritura).
- [x] T3.3 Server actions de la lista + revalidacion de las superficies del coach.
- [x] T3.4 API movil `/api/mobile/nutrition/exchanges/group-foods` (GET/POST/PATCH/DELETE) con `gateExchanges`.
- [x] T3.5 Doble escritura en `setFoodExchangeEquivalenceAction`, `insertCoachFood` (web + API movil) y `saveCustomFood`.

## T4 — UI web
- [x] T4.1 Sheet "¿Que cuenta como 1 porcion?": buscador sobre TODO el catalogo, sugerencia de gramos, preview de la frase.
- [x] T4.2 Lista del grupo: filas propias vs heredadas del catalogo, excluir/restaurar, contador real.
- [x] T4.3 "Duplicar y ajustar" copia y reescala la lista completa.
- [x] T4.4 Seccion "Porciones" en `/coach/foods` (gestion fuera del builder de un alumno).

## T5 — Pruebas y cierre
- [x] T5.1 Tests puros de la matematica y de la resolucion de precedencia (20 casos).
- [x] T5.2 `tests/team/exchange-lists-isolation.sql` con roles reales — ejecutada en LIVE con ROLLBACK: `ALL PASSED`.
- [x] T5.3 Gates: `pnpm test` 5096 pass, `tsc --noEmit` web limpio, `pnpm lint` 0 errores / 445 warnings (baseline),
      `check:nutrition-v2-boundaries` 256/8, `check:tokens` 86.
- [ ] T5.4 QA visual del coach en `/coach/foods → Porciones` (pendiente: nadie lo abrio en un navegador todavia).
- [ ] T5.5 Paridad RN de esta superficie — es F4.
