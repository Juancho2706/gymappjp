# TASKS — Porciones (intercambios) V2 · F1

> Patrón de orquestación del repo: olas con **archivos DISJUNTOS por worker**
> (cero solapamiento dentro de una ola; si dos tareas necesitan el mismo archivo,
> van en olas distintas o en la misma tarea). Modelos: **Fable = UI/UX**,
> **Opus = backend/SQL/lógica**, **Sonnet = mecánica bien especificada**.
> Tras cada ola: gate técnico + **pasada de juicio del orquestador** (revisar diffs
> contra lo pedido; lo deficiente vuelve al MISMO worker con feedback concreto).
> Reintentos de jobs fallidos = workflow NUEVO solo con los fallidos (nunca resume
> con edits en medio del array). StructuredOutput de cada worker: corto, artefactos
> a disco (gotcha StructuredOutput grande loopea).

**Estimación total**: ~18,5 worker-días nominales; con paralelismo real por ola,
**15-17 días calendario** (consistente con la re-estimación PM1 del panel).

**Gate estándar** (se corre completo al cierre de CADA ola; una ola no abre hasta
que la anterior lo pasa + juicio Fable):

```
pnpm lint && pnpm typecheck && npx vitest run \
  && pnpm check:nutrition-v2-boundaries && pnpm check:tokens
pnpm --filter @eva/mobile exec tsc --noEmit
```

---

## Ola 0 — Dominio (secuencia corta, ~3,5d)

T0.1 y T0.2 corren en paralelo; T0.3 arranca cuando T0.2 entrega los tipos.

| ID | Tarea | Modelo | Est. | Archivos (disjuntos) |
|---|---|---|---|---|
| T0.1 | **Migración aditiva completa, EN ORDEN (hallazgo D1)**: (1) tabla `nutrition_slot_exchange_targets_v2` — FK compuesta `(meal_slot_id, version_id)`, CHECK 0,5, índices `version_id` + `exchange_group_id`, RLS espejo no-correlacionado de items con scope re-derivado del PLAN, REVOKE + grants explícitos + policy `_service`, trigger `updated_at`; (2) 2 columnas nullable en `nutrition_intake_entries` (CHECK 0,5 y ≤99); (3) `create or replace` de `record_nutrition_intake_v2` **PARTIENDO del cuerpo `20260718120000_student_access_grace_gate.sql`** (extrae `exchangeGroupCode`/`exchangePortions` de `p_snapshot`; assert de que `private.student_write_allowed` sigue llamada) + wrapper `correct_nutrition_intake_v2` (void → `exchange_portions=null`); (4) `private.nutrition_v2_build_prescription_snapshot` + `exchangeTargets[]` por franja. Guion de rollback comentado al pie (drop tabla/columnas + restaurar cuerpos previos). NO se aplica a prod. | Opus | 1,5d | `supabase/migrations/2026XXXXXXXX_nutrition_portions_v2.sql` |
| T0.2 | **Contratos + read-models**: `exchangeTargets` opcional (default `[]`) en `NutritionMealSlotSchema`; read-model: `slot.exchangeTargets`, dict `exchangeGroups` reconstruido desde snapshots (targets + bases embebidas del `composed_of` enriquecido), `coverage` con `marcadas`/`derivadas` POR SEPARADO (fórmulas SPEC R5, solo cadenas activas); helper de idempotency `operationId = "{fecha}-{slot}-{grupo}-{ordinal}-a{attempt}"` sobre `buildNutritionIdempotencyKey`. Tests: fixture de cache vieja parsea con schemaVersion=1 (Q12), contrato de forma `ExchangeGroup[]` en ambos bordes (A4), key attempt unitario (Q5). PROHIBIDO bump de schemaVersion. | Opus | 1d | `packages/nutrition-v2/contracts.ts`, `packages/nutrition-v2/read-models.ts` + sus `*.test.ts` |
| T0.3 | **Freeze en persistencia (hallazgos A1/A2/B5)**: `draft-builder.ts` emite filas de targets con `snapshot_*` resuelto server-side — grupo por id INCLUSO soft-borrado (si no existe: error explícito, jamás snapshot NULL); `snapshot_composed_of` ENRIQUECIDO con `ref_*` de los grupos base; `plan-persistence.ts` inserta los targets en la MISMA tx del draft. `publish_nutrition_plan_v2` NO se toca. Tests de freeze (criterio 2; Q6 parcial: editar `ref_*` de P/C post-persist no cambia lo emitido). | Opus | 1d | `apps/web/src/app/coach/nutrition-v2/[clientId]/builder/_lib/draft-builder.ts`, `apps/web/src/app/coach/nutrition-v2/_actions/plan-persistence.ts` + tests |

**Gate 0**: gate estándar (la migración se valida solo por lectura/lint SQL; el
BEGIN/ROLLBACK + advisors en LIVE es de la fase de operación) + juicio Fable de
los 3 diffs contra SPEC R2/R4.

---

## Ola 1 — Coach (paralela, ~4d worker)

| ID | Tarea | Modelo | Est. | Archivos (disjuntos) |
|---|---|---|---|---|
| T1.1 | **Builder web**: sección "Porciones a elección" en la card de franja del paso 2 (fila grupo: circulito `exchangeGroupColor` + stepper 0,5 adaptando `StepperField` + eliminar), picker de grupos (popover/bottom-sheet: 9 system primero, custom después, usados deshabilitados, badge "referencial"), card "Usar como objetivos" en paso 1 (deriva con `dayTotalsByVariant`, nunca sobrescribe sin tap), chips read-only `portionsSummaryLabel` en paso 3 + banner macros referenciales. SPEC UX-a al pie de la letra; tokens semánticos; 360px. | Fable | 1,5d | `apps/web/src/app/coach/nutrition-v2/[clientId]/builder/_components/*` (archivos NUEVOS `Portions*.tsx` + wiring en `PlanBuilderClient.tsx`) |
| T1.2 | **Quick-edit web**: hidratación `readModelToDraft` + `countDraftChanges` (un cambio de porciones = 1) en el paquete; `EditablePortionsCard` hermana de `EditableSlotCard`; publica por el pipeline existente. | Fable | 1d | `packages/nutrition-v2/quick-edit.ts` (+ test), `apps/web/.../quick-edit/EditablePortionsCard.tsx` + wiring quick-edit web |
| T1.3 | **Microcopy**: `PORTIONS_COPY` web + espejo RN, tabla exacta de SPEC UX-d (incluye `coach.derivedNote`). Cero lógica. | Sonnet | 0,5d | archivo de copy web + archivo de copy RN (nuevos) |
| T1.4 | **Quick-edit RN**: espejo de T1.2 en `QuickEditMode` con `NutritionV2Kit`; stepper con botones (nunca teclado numérico), `notes` keyboard-avoiding, sheet `nativeModal` (hallazgo M4 + gotcha gorhom/reanimated). | Fable | 1d | `apps/mobile/components/nutrition-v2/quick-edit/*` |

**Gate 1**: gate estándar + juicio Fable (fidelidad al wireframe UX-a, light/dark,
white-label `primary`, 360px).

---

## Ola 2 — Alumno (paralela, ~5,5d worker; puede solaparse con Ola 1 — archivos disjuntos entre olas)

| ID | Tarea | Modelo | Est. | Archivos (disjuntos) |
|---|---|---|---|---|
| T2.1 | **Alumno web PWA**: fila "Porciones de hoy" bajo AuraHero (chips compactos, jerarquía SPEC UX-b: héroe único = anillos); chips por franja con marcar/deshacer (tap = siguiente segmento; snackbar 5s con Deshacer; confirmación inline del exceso "+n"); **delta optimista solo-marcadas** reconciliado por idempotency key (hallazgo F1-front); segmentos derivados-de-alimento con estilo propio (usa `marcadas`/`derivadas` del read-model); sheet de equivalencias portado del V1 al read-model V2 (long-press = atajo, botón siempre visible); aviso anti-duplicado `student.dupWarning`; ficha coach day-detail read-only (`coach.dayCoverage` + `coach.derivedNote`). A11y del chip según SPEC. | Fable | 2d | `apps/web/src/app/c/[coach_slug]/nutrition-v2/_components/*` (nuevos `Portion*.tsx` + wiring `TodayExperience.tsx`) + componente read-only de ficha coach |
| T2.2 | **Server action marcar/deshacer (web)**: action de intake sintético vía `record_nutrition_intake_v2` con key del helper canónico (ordinal+attempt), `source='prescription'`, macros = ref snapshot × porciones, transporte por `p_snapshot`; void por `correct_nutrition_intake_v2`; verificación del presupuesto de `rateLimitNutritionIntake` para ráfaga de 8-15 marcas (hallazgo D5). Tests: Q4 (media porción + void neutraliza contador Y macros), Q5 (deshacer→re-marcar = intake nuevo), Q2 (franja solo-porciones con `canRegisterFreely=false` permite marcar). | Opus | 1d | `apps/web/src/app/c/[coach_slug]/nutrition-v2/_actions/intake.actions.ts` + tests de action |
| T2.3 | **Alumno RN**: mismas superficies con `NutritionV2Kit`; marcar-porción por la cola offline existente (key ordinal+attempt; deshacer-en-cola cancela la entrada E incrementa attempt — hallazgo M1); estados pending (`NutritionSyncState`) / error 4xx revierte; haptics + `NUTRITION_MOTION`; memoización por slot — jamás recomputar todas las franjas por tap (M3); sheet equivalencias `nativeModal`. | Fable | 2,5d | `apps/mobile/components/alumno/nutrition-v2/*` (nuevos) + `apps/mobile/lib/nutrition-v2-intake.ts` (solo si T0.2 no dejó el helper listo — coordinar en el brief para no chocar) |

**Gate 2**: gate estándar + Q1 (plan sin porciones = read-model byte-idéntico),
Q3 (mixta sin doble conteo), Q9 (offline) verdes + juicio Fable.

---

## Ola 3 — Conversión de los 6 planes exchanges V1 (~1,5d)

| ID | Tarea | Modelo | Est. | Archivos (disjuntos) |
|---|---|---|---|---|
| T3.1 | **Mapper**: `conversion.ts` reemplaza el skip `'exchanges_manual'` por mapeo `meal_exchange_targets` → filas de targets con snapshot enriquecido; RECIBE los grupos (system+custom) como input del loader de impersonación (hallazgo B6); `strategy='structured'` o `'hybrid'` según `food_items`; fan-out dow 7→0 replica targets por variante; `seenMeals` no cuenta doble targets de comidas dow-NULL (test de conteo). Tests de fidelidad `porciones-in == porciones-out` + paridad macros engine. | Opus | 1d | `packages/nutrition-v2/conversion.ts` + `conversion.test.ts` + loader de impersonación (plumbing de grupos) |
| T3.2 | **Driver + reporte**: extensión del driver de `scripts/nutrition-v2-conversion/` — dry-run default, reporte MD+JSON de fidelidad por comida/grupo, cero invención (lo no mapeable queda listado), flag fail-closed manda. | Sonnet | 0,5d | `scripts/nutrition-v2-conversion/*` (solo scripts) |

**Gate 3 (build)**: vitest paridad + juicio Fable del reporte dry-run local.
**Operación (GO CEO)**: dry-run Alan + ali → reporte fidelidad → GO → apply dark →
resto de los 6.

---

## Ola 4 — Pipeline catálogo (~2d; ola PROPIA — dry-run + reporte CEO ANTES de escribir una sola fila)

Puede construirse en paralelo con olas 1-3; su `--apply` SOLO corre después del
apply de la conversión (hallazgo D3).

| ID | Tarea | Modelo | Est. | Archivos (disjuntos) |
|---|---|---|---|---|
| T4.1 | **Heurísticas puras + tests**: clasificador `(grupo_candidato, tier alto/medio/bajo)` por categoría (`food-category.ts`), keywords y perfil de macros vs `ref_*` de los 9 system; derivación de `exchange_portion_grams` (macro clave ≈ ref, redondeo entero) + `exchange_portion_label`. 100% puro y testeado con foods reales de fixture. | Opus | 1d | `scripts/nutrition-portions/heuristics.ts` (o `.mjs`) + tests |
| T4.2 | **Driver**: `classify-foods` con dry-run DEFAULT (cero escrituras), `--apply` gated (UPDATE con `where exchange_group_id is null` — jamás pisa clasificación manual; tabla de respaldo previa), `--down` restaura desde respaldo; `createServiceRoleClient` (nunca raw admin — gotcha memoria). | Opus | 0,5d | `scripts/nutrition-portions/classify-foods.mjs` |
| T4.3 | **Reporte CEO**: MD + JSON + artifact — % clasificado, distribución por grupo, tiers, N muestras por grupo/tier para revisión humana del tier medio (hallazgo PM4), lista completa de tier bajo (quedan sin clasificar). | Fable | 0,5d | `scripts/nutrition-portions/report.mjs` + plantilla artifact |

**Gate 4 (build)**: tests heurísticas verdes + dry-run contra datos reales SIN
escribir + artifact generado + juicio Fable.
**Operación (GO CEO, post-conversión)**: dry-run → artifact → **GO explícito** →
`--apply` (respaldo listo) → re-dry-run de verificación (delta = 0).

---

## Ola 5 — QA + cierre (~2d)

| ID | Tarea | Modelo | Est. | Archivos (disjuntos) |
|---|---|---|---|---|
| T5.1 | **Matriz Q1-Q14 completa** (vitest integración; las que las olas 0-3 no cubrieron): foco Q6 (LEG congelado end-to-end), Q7 (grupo sin foods clasificados), Q8 (grandfathering coach que baja de plan), Q10 (republish same-day re-deriva `exchangeTargets` sin duplicar intakes), Q11 (exceso "+n" no descuenta), Q14 (fidelidad conversión). | Opus | 1d | `packages/nutrition-v2/*.portions.test.ts` (archivos de test NUEVOS) |
| T5.2 | **SQL RLS isolation** de la tabla nueva, espejo de `tests/team/exchanges-isolation.sql`: alumno de otro coach no ve/escribe targets; anon sin privilegios (Q13). | Sonnet | 0,5d | `tests/team/portions-isolation.sql` (nuevo) |
| T5.3 | **QA visual**: light/dark/white-label/360px en builder, quick-edit, Hoy alumno y ficha coach (criterio 11) + artifact QA con screenshots para el CEO (al CEO le encantan). | Fable | 0,5d | sin código (artifact + notas QA) |

**Gate final (build)**: gate estándar completo + criterios SPEC 1-9 y 11
verificados → **PR draft**.

**Operación completa (fuera del build, GO CEO en orden — PLAN "F1 operación")**:
migración BEGIN/ROLLBACK + advisors + verificación `student_write_allowed` →
EXPLAIN Today + presupuesto rate-limit → conversión (dry-run → GO → apply) →
catálogo (dry-run → reporte → GO → apply) → QA device CEO.

---

## Resumen de estimación

| Ola | Contenido | Worker-días | Dependencias |
|---|---|---|---|
| 0 | Dominio (DDL, contratos, freeze) | 3,5 | — |
| 1 | Coach (builder + quick-edit web/RN + copy) | 4 | Ola 0 |
| 2 | Alumno (PWA + action + RN) | 5,5 | Ola 0 (∥ con Ola 1) |
| 3 | Conversión 6 planes | 1,5 | Ola 0 (∥ con 1-2) |
| 4 | Pipeline catálogo | 2 | build ∥; apply post-Ola 3 |
| 5 | QA + cierre | 2 | Olas 1-4 |
| **Total** | | **≈18,5 nominales → 15-17 calendario** | |

Corte si aprieta (PLAN riesgo 10 / hallazgo PM2): (1) T2.3 degrada a chips
read-only RN; (2) segmentos derivados degradan a solo-contador; (3) Ola 3 pasa a
follow-up post-F1. NUNCA cortar: T0.1-T0.3, no-doble-conteo, fixture cache vieja.
