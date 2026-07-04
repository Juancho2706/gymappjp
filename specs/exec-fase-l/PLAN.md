# PLAN — Fase L: ejecución de entrenamiento del alumno

**Feature:** `exec-fase-l`
**Status:** APROBADO
**Owner:** TBD
**Last updated:** 2026-07-04
**Spec:** `specs/exec-fase-l/SPEC.md`
**Informes fuente:** `docs/audits/fase-l-wl2/informe-stepper-exec.md`, `informe-teclado-custom.md`, `informe-sustitucion-maquina.md`

---

## 1. Arquitectura

Tres workstreams, un solo spec, ordenados de **menor a mayor riesgo**:

1. **Extracción `SingleExerciseCard`** (prerequisito duro, cero feature nueva).
2. **Teclado numérico custom** (B — 100% presentación).
3. **Modo stepper opt-in** (A — 100% presentación/navegación).
4. **Sustitución de máquina ocupada** (C — única con migración; toca todas las capas).

### Principio rector (A y B)
Stepper y teclado son **capa de presentación pura**. NO tocan `_data/`, `_actions/`, `services/`, `infrastructure/db/`, ni el schema. Cero migración, cero `GRANT`. Todo el motor (logging, cola offline, dedupe, reconciliación, descanso, progresión) sigue viviendo en `LogSetForm` + los handlers del padre + `lib/workout-offline-queue`. El stepper decide **qué card se muestra** y **cómo se navega**; el keypad **muta `ref.value`** de inputs uncontrolled. El pipeline de submit queda intacto.

### Data flow (C — sustitución, respeta Clean Architecture)
```text
app/c/[coach_slug]/workout/[planId]/_data/substitution.queries.ts   (React.cache; candidate set same-muscle en scope RLS)
  -> services/workout/exercise-substitution.ts                       (rankSubstitutes() PURO, sin Next/Supabase)
  -> (query cruda vía repository/PostgREST scoped por RLS)
  -> Supabase (tabla exercises, RLS del alumno = techo)

app/c/[coach_slug]/workout/[planId]/_actions/substitution.actions.ts (getExerciseSubstitutionsAction; Zod; ownership por RLS)
```
La persistencia de la sustitución reusa el write-path del log existente: `LogSetForm` → `FormData` → `logSetAction` → `workout_logs`. No se crea un write-path nuevo; se agregan campos aditivos opcionales al payload.

### Por qué encaja con los patrones EVA
- Toggle stepper = mismo carril que `omni_autotimer` (localStorage device-scoped, no `feature-prefs` que es scope coach).
- Keypad provider = análogo a `WorkoutTimerProvider` (una instancia por sesión, portal a `body`).
- Swipe/pager = patrón `DayNavigator` (framer-motion, sin librería nueva de carousel).
- Sustitución = precedente de swap en nutrición (food swaps), pero para ejercicios; columnas snapshot como `exercise_name_at_log`/`plan_name_at_log`.

## 2. Files

### Workstream 1 — Extracción SingleExerciseCard
| Action | Path | Notes |
|---|---|---|
| CREATE | `apps/web/src/app/c/[coach_slug]/workout/[planId]/SingleExerciseCard.tsx` | Mueve el inline `WorkoutExecutionClient.tsx:1440-1699` con props explícitas; paridad 1:1 |
| UPDATE | `apps/web/src/app/c/[coach_slug]/workout/[planId]/WorkoutExecutionClient.tsx` | La lista renderiza `<SingleExerciseCard/>` en lugar del inline |

### Workstream 2 — Teclado numérico
| Action | Path | Notes |
|---|---|---|
| CREATE | `apps/web/src/lib/client/useCoarsePointer.ts` | Hook `matchMedia('(pointer: coarse)')` post-montaje + listener; reutilizable |
| CREATE | `apps/web/src/app/c/[coach_slug]/workout/[planId]/WorkoutKeypadProvider.tsx` | Contexto análogo a `WorkoutTimerProvider`; una instancia, portal a `body`, `--keypad-h`, háptica |
| CREATE | `apps/web/src/app/c/[coach_slug]/workout/[planId]/NumericKeypadSheet.tsx` | Panel presentacional: header de objetivo, display, chips, grid 3×4, `Siguiente`/`Listo` |
| UPDATE | `apps/web/src/app/c/[coach_slug]/workout/[planId]/LogSetForm.tsx` | `StrengthLogSetForm`: gate coarse, `inputMode="none"`+onFocus→openKeypad, props opcionales `targetSets`/`targetReps`; path desktop intacto |
| UPDATE | `apps/web/src/app/c/[coach_slug]/workout/[planId]/WorkoutExecutionClient.tsx` | Envolver árbol con `WorkoutKeypadProvider` (junto a `WorkoutTimerProvider`:1204); pasar `targetSets`/`targetReps` al render |

### Workstream 3 — Stepper
| Action | Path | Notes |
|---|---|---|
| CREATE | `apps/web/src/lib/workout-stepper.ts` | Helper puro: `buildStepModel`, `firstIncompleteStepIndex`, `stepIndexOfBlock`, `isStepComplete` |
| CREATE | `apps/web/src/lib/workout-stepper.test.ts` | Vitest: orden de pasos, superserie=1 paso, primer incompleto, salto por bloque |
| CREATE | `apps/web/src/app/c/[coach_slug]/workout/[planId]/StepperExecution.tsx` | Pager drag/swipe (patrón `DayNavigator`), `AnimatePresence` direccional, prev/next, rail de progreso, eyebrow de sección |
| UPDATE | `apps/web/src/app/c/[coach_slug]/workout/[planId]/rest-timer-preferences.ts` | Agregar `export const STEPPER_MODE_KEY = 'omni_stepper'` junto a `OMNIAUTOTIMER_KEY` |
| UPDATE | `apps/web/src/app/c/[coach_slug]/workout/[planId]/WorkoutExecutionClient.tsx` | `stepperEnabled` + effect de lectura + `toggleStepper`; render condicional; ramificar `scrollToNextIncomplete` |
| UPDATE | `apps/web/src/app/c/[coach_slug]/workout/[planId]/WorkoutTimerSettingsPanel.tsx` | (opcional) prop `stepperEnabled`+`onToggleStepper`; el control principal va en el header |

### Workstream 4 — Sustitución
| Action | Path | Notes |
|---|---|---|
| CREATE | `supabase/migrations/<ts>_workout_logs_substitution_columns.sql` | Aditiva: 3 cols + FK `ON DELETE SET NULL` + índice parcial; SIN GRANT (tabla ya tiene GRANT de tabla); SIN CHECK |
| CREATE | `apps/web/src/services/workout/exercise-substitution.ts` | `rankSubstitutes()` PURO + `EQUIPMENT_TIERS`/normalización + `SUBSTITUTION_REASON` const única |
| CREATE | `apps/web/src/services/workout/exercise-substitution.test.ts` | Vitest: máquina ocupada des-prioriza su equipment, orden estable, top-5, scope, exclusión del actual |
| CREATE | `apps/web/src/app/c/[coach_slug]/workout/[planId]/_data/substitution.queries.ts` | `React.cache`; candidate set same-muscle en scope RLS; NO rankea |
| CREATE | `apps/web/src/app/c/[coach_slug]/workout/[planId]/_actions/substitution.actions.ts` | `getExerciseSubstitutionsAction(blockId)`; Zod; ownership por RLS; lazy (al tocar el botón) |
| CREATE | `apps/web/src/app/c/[coach_slug]/workout/[planId]/_components/SubstituteExerciseSheet.tsx` | Bottom-sheet (reusa `components/ui/sheet.tsx`); tarjetas rankeadas, gif mini, badge equipment, "Usar este", loading/empty/error |
| UPDATE | `packages/schemas/workout.ts` | `WorkoutLogSetSchema`: `substituted_exercise_id` z.guid().optional, `substituted_exercise_name` z.string().max(120).optional, `substitution_reason` z.string().optional |
| UPDATE | `apps/web/src/app/c/[coach_slug]/workout/[planId]/_actions/workout-log.actions.ts` | `logSetAction`: leer 3 campos del FormData + agregar a `payloadValues` (INSERT + UPDATE) |
| UPDATE | `apps/web/src/lib/workout-offline-queue.ts` | `WorkoutOfflineLog` + `workoutLogToFormData`: 3 campos opcionales (retrocompat legacy) |
| UPDATE | `apps/web/src/app/c/[coach_slug]/workout/[planId]/_data/workout-execution.queries.ts` | SELECT de logs de HOY (~:167): agregar las cols para reconstruir `substitutionByBlock` |
| UPDATE | `apps/web/src/app/c/[coach_slug]/workout/[planId]/WorkoutExecutionClient.tsx` | Estado `substitutionByBlock`, botón disparador, override de `getExercise`/nombre/gif/técnica, badge, deshacer, thread de campos a `LogSetForm`, guard anti-PR-falso |
| UPDATE | `apps/web/src/app/c/[coach_slug]/workout/[planId]/LogSetForm.tsx` | Agregar 3 campos al FormData cuando hay sustitución activa en el bloque |
| UPDATE | `apps/web/src/services/client/client-detail.service.ts` | `getClientWorkoutForDate` (~:896): agregar `substituted_exercise_id`, `substituted_exercise_name`, `substitution_reason` al SELECT |
| UPDATE | `apps/web/src/.../TrainingTabB4Panels.tsx` | Badge "Hizo X — sustituyó Y (máquina ocupada)" por serie/ejercicio (patrón del badge `note` `:713-732`) |
| UPDATE | `apps/web/src/lib/database.types.ts` | Regenerar tras la migración |

## 3. Data Model

- **Workstreams A y B:** DB changes = **none**. RLS impact = none. Generated types = none. Solo `localStorage['omni_stepper']`.
- **Workstream C:** migración requerida.

```sql
-- migración aditiva, forward-only, idempotente
ALTER TABLE public.workout_logs
  ADD COLUMN IF NOT EXISTS substituted_exercise_id   uuid
    REFERENCES public.exercises(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS substituted_exercise_name text,
  ADD COLUMN IF NOT EXISTS substitution_reason       text;  -- SIN CHECK en v1; valor único 'machine_busy' desde const en código
CREATE INDEX IF NOT EXISTS idx_workout_logs_substituted_exercise_id
  ON public.workout_logs (substituted_exercise_id) WHERE substituted_exercise_id IS NOT NULL;
```
- **RLS impact:** ninguno nuevo. `workout_logs` tiene **GRANT de TABLA** para `authenticated` (evidencia: `note` se agregó sin GRANT y el alumno lo escribe). **NO aplica** el gotcha de `GRANT UPDATE(col)` de CLAUDE.md (ese es para `coaches`/`teams`/`clients`, que tienen column-grants). Documentar esto en el comentario de la migración.
- **Trigger:** NO tocar `set_workout_log_exercise_id`. Sigue poblando `exercise_id` desde el bloque (prescrito). La sustitución vive SOLO en las columnas dedicadas.
- **RPCs de progreso:** NO tocar las 4 (`get_client_exercise_prs`, `strength_series`, `weekly_prs`, `get_client_muscle_volume`). Resuelven con `COALESCE(wb.exercise_id, wl.exercise_id)` (el bloque gana). Como el sustituto es del mismo `muscle_group` por construcción, `get_client_muscle_volume` sigue correcto. Re-atribución = fast-follow fuera de alcance.
- **Generated types:** regenerar `database.types.ts` tras la migración (MCP `generate_typescript_types` o `supabase gen types`).

## 4. Server Actions

### C — `getExerciseSubstitutionsAction`
- **Action:** `getExerciseSubstitutionsAction(blockId: string)` en `_actions/substitution.actions.ts`.
- **Validación:** Zod — `z.object({ blockId: z.guid() })`. Ownership verificado por RLS (el alumno solo ve su plan / catálogo en scope).
- **Flujo:** resuelve el ejercicio del bloque → `substitution.queries.ts` arma candidate set (`muscle_group` = actual, `exercise_type` = actual, `deleted_at IS NULL`, `id <> actual`, scope del alumno vía `resolveCatalogScope`) → `rankSubstitutes()` (puro) → top 3-5.
- **Revalidation:** ninguna (es lectura lazy on-demand, no muta estado servidor).
- **No prefetch:** se llama solo al tocar el botón (evento raro).

### C — persistencia (reusa `logSetAction`)
- `logSetAction` NO es una acción nueva; se **extiende** para leer 3 campos opcionales del FormData y meterlos en `payloadValues` (INSERT y UPDATE del upsert por `(block_id, set_number, día)`).
- **Validación:** `WorkoutLogSetSchema` gana 3 campos opcionales; `z.coerce` ya tolera strings crudos del FormData.
- **Revalidation:** la que ya hace `logSetAction` hoy (sin cambios).

### A y B
- Cero server actions nuevas. Cero cambios en acciones existentes.

## 5. UI/UX

- **Mobile viewport:** `min-h-dvh`/`h-dvh`; contenedor del paso con `overflow-y-auto` propio y `touch-action: pan-y`; el pager nunca genera scroll horizontal del body. Bottom-sheets `max-h-[85dvh]` con scroll interno.
- **Safe areas:** `pb-safe` en keypad y sheets; padding inferior (`pb-32` como hoy) para no chocar con la barra fija "Finalizar".
- **Dark mode:** la exec es dark siempre; keypad usa tokens EVA (`--ink-950`, `--sport-500`, `rounded-control`, `rounded-t-sheet`). Verificar igual el `.dark`.
- **Reduced motion:** `useReducedMotion` desactiva drag/slide (stepper → crossfade) y animación del sheet (keypad/sustitución), consistente con `DayNavigator:66-70` y `RestTimer`.
- **Componentes:** route-local first (todos co-locados en `workout/[planId]/`, misma convención que los hermanos). `useCoarsePointer` a `lib/client/` (multi-domain). `SubstituteExerciseSheet` en `_components/`. Sin promover a atoms/molecules (no hay reuso en 3+ domains).
- **Z-order:** RestTimer z-50 (arranca en el submit), footer "Finalizar" z-40, keypad z-50 (oculta el footer al abrir). Definir explícito.
- **A11y:** carousel APG (role/aria-roledescription/aria-label "Ejercicio X de Y", aria-live polite, prev/next siempre presentes); keypad con `<input>` real como fuente de verdad + botones con `aria-label`, panel `role="group"`; sheet `role="dialog"` + focus-trap (Radix, ya en `sheet.tsx`).

## 6. Fases (con gates)

Cada fase cierra con `pnpm typecheck` + `pnpm lint` + Vitest de lo tocado (gate por tanda). Playwright/E2E y cualquier SQL contra PROD (incluida la migración) SOLO con **OK explícito del CEO**. La migración corre con snapshot `_bak_workout_logs_<fecha>` previo, es aditiva/idempotente/forward-only.

### Fase 1 — Extracción `SingleExerciseCard` (prerequisito, menor riesgo)
- Mover el inline a componente con paridad 1:1. La lista clásica renderiza el nuevo componente.
- **Gate:** typecheck + lint verdes; verificación de paridad visual/comportamental contra la lista actual (la exec se ve idéntica). Sin esto, no avanza nada.

### Fase 2 — Teclado numérico
- `useCoarsePointer` + test → `WorkoutKeypadProvider` → `NumericKeypadSheet` → integración en `StrengthLogSetForm` (gate coarse, path desktop intacto) → ajuste de layout (ocultar footer, `--keypad-h`, scroll-into-view).
- **Gate:** typecheck + lint + Vitest de `useCoarsePointer`; QA manual cross-device (iOS real, Android Chrome, desktop) diferido al gate CEO.

### Fase 3 — Stepper
- `workout-stepper.ts` + tests → `StepperExecution.tsx` → `STEPPER_MODE_KEY` + estado/toggle/render condicional en el orquestador → ramificar auto-avance → a11y/reduced-motion/hardening.
- **Gate:** typecheck + lint + Vitest de `workout-stepper`; QA offline (red inestable, sin pérdida de logs) diferido al gate CEO.

### Fase 4 — Sustitución (única con migración)
- Migración aditiva (aplicar en gate CEO con snapshot) → regenerar types → `exercise-substitution.ts` + tests → `_data`/`_actions` → schema Zod → `logSetAction` → offline queue → `SubstituteExerciseSheet` → wiring en el orquestador (override, badge, deshacer, guard anti-PR-falso, rehidratación) → thread en `LogSetForm` → ficha coach (SELECT + badge).
- **Gate:** typecheck + lint + Vitest de `rankSubstitutes`+schema; migración + advisors + E2E del flujo (swap → log → reload → ficha coach → offline) SOLO con OK CEO.

## 7. Test Plan

- **Unit (Vitest, verde por tanda):**
  - `workout-stepper.ts`: orden de pasos, superserie = 1 paso, `firstIncompleteStepIndex`, `stepIndexOfBlock`, `isStepComplete`.
  - `exercise-substitution.ts`: máquina ocupada des-prioriza su equipment, orden determinista estable, top-5, filtro de scope, exclusión del actual, normalización de equipment sucio.
  - `useCoarsePointer.ts`: mock `matchMedia`.
  - `WorkoutLogSetSchema`: acepta los 3 campos opcionales; legacy sin ellos sigue válido.
- **Integration:** `logSetAction` persiste los 3 campos en INSERT y UPDATE; `workoutLogToFormData` incluye los campos opcionales sin romper items legacy.
- **E2E (Playwright, SOLO gate CEO):** activar stepper y ejecutar; abrir keypad y registrar serie; swap de máquina ocupada → loguear → reload (persiste) → ficha coach muestra badge; offline flush conserva la sustitución.
- **Manual (gate CEO):** iOS Safari real (supresión teclado + fallback readOnly), Android Chrome, desktop (Enter-no-cierra + Tab intactos), VoiceOver/TalkBack, reduced-motion, dark mode, coma decimal es-CL, red inestable en auto-avance.

## 8. Rollback Plan

- **A (stepper):** default OFF y device-scoped → el riesgo vivo es la extracción de `SingleExerciseCard`. Revert = restaurar el render inline y quitar `StepperExecution`/`workout-stepper`. Sin estado servidor que limpiar.
- **B (keypad):** gate por `pointer: coarse` → revert = quitar el gate (o forzar `useCoarsePointer` a `false`) y el input nativo vuelve tal cual. Cero DB.
- **C (sustitución):** la migración es **aditiva** (columnas nullable) → dejarlas en su lugar es inocuo (no hay writers si se revierte el código). Revert de UI = quitar el botón/sheet/estado; los logs con columnas pobladas quedan como dato histórico válido. Snapshot `_bak_workout_logs_<fecha>` disponible como respaldo. NO se hace DROP de columnas (forward-only).

## 9. Fast-follows declarados fuera de alcance (registro, no v1)

- **FF-1 (C):** re-atribución correcta de PRs/volumen — cambiar las 4 RPCs a `COALESCE(wl.substituted_exercise_id, wb.exercise_id, wl.exercise_id)`. Aditivo y behavior-preserving (0 sustituciones hoy → salida idéntica), pero re-abre las funciones endurecidas en P1-3 y exige su propia pasada de tests.
- **FF-2 (C):** `substitution_reason` con `CHECK` enum multi-motivo (equipo roto, lesión, preferencia) usando const espejo (patrón `INTAKE_SOURCES`).
- **FF-3 (B):** keypad para `TypedLogSetRow` (cardio min/metros/FC, movilidad seg, roller seg/pasadas).
- **FF-4 (B):** plate math / calculadora de discos.
- **FF-5 (todos):** paridad `apps/mobile` (RN/Expo) — swap/keypad/stepper nativos.
- **FF-6 (A):** persistencia del toggle stepper cross-device (columna + GRANT + acción server).
