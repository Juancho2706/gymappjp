# PLAN — Entrenamiento Movida: ejercicios polimórficos + cardio TrainingPeaks-lite

> SPEC: `specs/movida-entrenamiento/SPEC.md`. Insumo maestro: `docs/plans/movida/02-PLAN-entrenamiento.md`.
> Construye SOBRE la fundación 2026-06-10 (Director §"FUNDACIÓN COMPLETADA"): NAV_MODULES,
> scoping 3-vías por workspace activo, marca por tenant, `assertModule`, testing calmado.

## Estado actual (código mapeado, 2026-06-11)

- **DB:** `workout_blocks` = sets int + `reps` text NOT NULL + target_weight_kg + tempo/rir/rest_time/
  notes + section/section_template_id + superset/progression (sin tipo, sin duración/distancia/lado).
  `workout_logs` = weight_kg/reps_done/rpe/rir + snapshots `*_at_log`. `exercises` = ownership
  coach_id|org_id (RLS `20260608180000`), SIN `exercise_type` ni `team_id`. `clients` SIN
  birth_date/resting_hr (verificado en `database.types.ts`). Helpers RLS team set-returning ya en prod
  (`current_user_team_ids()` etc., migr. `20260609160000`).
- **Coach:** builder en `apps/web/src/app/coach/builder/[clientId]/` (recién refactorizado a áreas
  dinámicas — `specs/movida-areas/`, baselines F0 vigentes en `usePlanBuilder.test.ts` y
  `lib/workout-block-grouping.test.ts`). `BlockEditSheet.tsx` (357 líneas, un solo form fuerza, `<img>`
  crudo línea 128), `ExerciseBlock.tsx` (resumen "sets x reps"), save pipeline =
  `services/workout/workout.service.ts` (4 inserts: save/duplicate/assign/merge,
  `getExerciseHistoryAction` línea 955). Catálogo: `app/coach/exercises/` con `resolveExerciseOwner`
  (2 casos: standalone|org) en `_actions/exercises.actions.ts`.
- **Alumno:** `app/c/[coach_slug]/workout/[planId]/` — `WorkoutExecutionClient.tsx` (703 líneas,
  `Array.from({length: block.sets})` → `LogSetForm` por set), `LogSetForm.tsx` (useActionState +
  useOptimistic + offline guard → `enqueueWorkoutLog`), `workout-log.actions.ts` (logSetAction:
  Zod → adminDb upsert por día Santiago), `WorkoutTimerProvider.tsx` (SOLO `startRest`),
  `lib/workout-offline-queue.ts` (localStorage, shape fijo weight/reps/rpe/rir).
- **Gating:** `services/entitlements.service.ts` con `MODULE_KEYS = ['cardio', ...]` + `hasModule`/
  `assertModule` (team manda; coach fallback). `components/coach/coach-nav.ts` con `NAV_MODULES` y
  campo `entitlement` declarado pero **sin enforcement todavía** (`getVisibleNavItems` no filtra por
  módulos). Kill-switch actual = `teams.suspended_at` (team-level); falta flag de operador POR MÓDULO.
- **Schemas:** `packages/schemas/workout.ts` (`WorkoutBlockSchema` con gotcha `z.guid()` para áreas;
  `reps` requerido max 20 chars; `WorkoutLogSetSchema`). `packages/calc/` **NO existe** (se crea acá).
- **Domain:** `domain/workout/types.ts` — `ExerciseUnit` huérfano; falta `ExerciseType`.

## Decisiones de arquitectura

1. **Ejes ortogonales, no enum de combinaciones** (research Hevy): el tipo (`exercise_type`) decide
   QUÉ formulario se muestra, pero los datos son columnas independientes que pueden coexistir
   (carga + distancia + lado = farmer carry). Híbrido: columnas tipadas para lo frecuente +
   `interval_config`/`extra_targets` jsonb para lo raro.
2. **Resolución de tipo:** `effectiveExerciseType(block, exercise) = block.exercise_type_override ??
   exercise.exercise_type ?? 'strength'` — helper puro en `apps/web/src/lib/workout-exercise-type.ts`
   (patrón `lib/workout-areas.ts`), con tests.
3. **Coexistencia `reps` (expand-contract):** lectura prefiere campos tipados, fallback a `reps` texto.
   `reps` es NOT NULL en DB y max 20 chars en Zod → el builder SIEMPRE escribe en `reps` un **resumen
   legacy corto** generado desde los campos tipados ("8×400m", "30s/lado", "20min Z2") para que
   preview/print/`target_reps_at_log`/history sigan mostrando algo sensato sin tocarlos. No-numéricos
   (`8-10`, `AMRAP`): `reps_value` NULL + `reps` texto manda. El DROP de `reps`/`section` es fase
   CONTRACT futura, fuera de este plan.
4. **Prescripción por zona, targets por alumno** (research TrainingPeaks): el bloque persiste
   `hr_zone` 1-5; los bpm se calculan al renderizar con el perfil del alumno (módulo cardio ON).
   Nunca persistir bpm absolutos en la prescripción.
5. **Cálculo puro en `packages/calc/`** (`@eva/calc`, espejo de `packages/schemas`): sin imports
   `server-only`/Supabase/Next → testeable Vitest y reusable en Expo. `services/cardio-zones.service.ts`
   orquesta (lee perfil del cliente vía repository, llama a calc, decide gating).
6. **Plantillas de intervalos v1 = constantes system en `packages/calc/cardio-templates.ts`**
   (i18n keys, no texto), aplicables desde el form cardio del BlockEditSheet. Plantillas del coach =
   programas template existentes (`client_id NULL`, ya compartidos en pool). SIN tabla nueva.
7. **Catálogo team = 3er caso de ownership** (exactamente uno de `coach_id`|`org_id`|`team_id`):
   miembro del team ve system + team + propios; full-access plano (cualquier miembro activo edita las
   del team). RLS con helper set-returning existente `current_user_team_ids()` — NUNCA per-row
   (lección 2026-06-09). **Anti-fantasma (write-path del pool):** la VISIBILIDAD del catálogo incluye
   `propios`, pero en workspace team lo ASIGNABLE a alumnos del pool es solo system+team. Un ejercicio
   personal (`coach_id=self`) prescrito a un alumno del pool quedaría fantasma: el alumno no lo lee
   (`exercises_client_coach_select` exige `c.coach_id = exercises.coach_id`; el join embebido de
   `workout-execution.queries.ts` con cliente user-scoped devuelve null y `workout_blocks` NO
   denormaliza nombre → bloque sin nombre/gif/instrucciones) y otro coach del pool tampoco lo ve.
   Solución: acción "Copiar al team" (copy-on-use: crea o reutiliza la fila team por nombre
   normalizado y el bloque referencia esa copia). Extender las policies de LECTURA queda DESCARTADO:
   exigiría EXISTS correlacionado vía `workout_blocks`/plans en hot path (lección 2026-06-09).
8. **Módulo `cardio`:** key existente en `MODULE_KEYS`. Server-side: `assertModule` al tope de cada
   action/RSC del módulo + chequeo de flag de plataforma `DISABLED_MODULE_KEYS` (env, leído dentro de
   `hasModule` — apaga para todos sin migración, Director §3). Nav: nueva entrada
   `{ key: 'cardio', href: '/coach/cardio', entitlement: 'cardio', contexts: ['coach_standalone','coach_team'] }`
   + implementar el enforcement de `entitlement` en `getVisibleNavItems` (hoy declarativo).
9. **Offline:** `WorkoutOfflineLog` se extiende con campos opcionales (compatible con colas viejas en
   localStorage — los items legacy siguen parseando); el flush envía los campos nuevos a `logSetAction`.
10. **Timers:** un solo timer activo en `WorkoutTimerProvider`; el nuevo reemplaza con confirmación
    suave. Beep Web Audio primario (iOS no vibra), `navigator.vibrate` refuerzo, Wake Lock opcional
    con toggle (gesto del usuario + re-adquisición en `visibilitychange`), `useReducedMotion` + safe-area.
11. **Scope del seed F8 (explícito, no implícito):** el CSV versionado lleva columna `scope` por fila.
    Genéricos curados propios (cardio/movilidad/roller universales) → `system` (globales para toda
    EVA; pasan revisión de curación: nombre es-neutro, gif, instrucciones). Transcripción Villarroel +
    lista específica del kine de Ani → `team_id` de Movida (privados del pool). Nada se seedea a
    `coach_id`. Con esto, el "catálogo system intacto" de AC6 se lee así: las filas system EXISTENTES
    no cambian; las únicas altas system nuevas son las del seed genérico curado.

## Modelo de datos (DDL aditiva, idempotente, forward-only)

Vía branching MCP (ventana Pro hasta ~2026-07-09): `create_branch` → poll `MIGRATIONS_PASSED` →
`apply_migration` (solo esta DDL) → seed sintético + tests RLS como `authenticated` → `get_advisors`
(0 críticos) → snapshot `_bak_*` → `merge_branch` → `db pull` + regen types → `delete_branch` MISMO día.
Todo `IF NOT EXISTS`/`DROP POLICY IF EXISTS + CREATE` (replay-safe: el merge re-ejecuta TODO el historial).

### M1 — `20260611NNNNNN_exercise_types_team_catalog.sql`

```sql
-- Tipo + ownership team en el catálogo (expand)
ALTER TABLE public.exercises
  ADD COLUMN IF NOT EXISTS exercise_type text NOT NULL DEFAULT 'strength',
  ADD COLUMN IF NOT EXISTS team_id uuid REFERENCES public.teams(id);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'exercises_exercise_type_check') THEN
    ALTER TABLE public.exercises ADD CONSTRAINT exercises_exercise_type_check
      CHECK (exercise_type IN ('strength','cardio','mobility','roller')) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'exercises_single_owner_check') THEN
    ALTER TABLE public.exercises ADD CONSTRAINT exercises_single_owner_check
      CHECK (num_nonnulls(coach_id, org_id, team_id) <= 1) NOT VALID;
  END IF;
END $$;
ALTER TABLE public.exercises VALIDATE CONSTRAINT exercises_exercise_type_check;
-- OJO merge: este VALIDATE pasa trivial en el branch (los preview branches NO tienen data de prod),
-- pero el merge re-ejecuta la migración contra la DATA REAL — si existe alguna fila legacy con
-- coach_id Y org_id no-null (org_id se agregó en 20260608130000), el merge FALLA a mitad de camino.
-- Pre-check read-only obligatorio en prod ANTES del merge (checklist F1):
--   SELECT count(*) FROM public.exercises WHERE num_nonnulls(coach_id, org_id) > 1;  -- debe dar 0
-- Si diera > 0: quitar el VALIDATE de single_owner de esta migración (queda NOT VALID, expand) y
-- validar en una migración posterior tras corregir las filas legacy.
ALTER TABLE public.exercises VALIDATE CONSTRAINT exercises_single_owner_check;

CREATE INDEX IF NOT EXISTS idx_exercises_team_id ON public.exercises (team_id) WHERE team_id IS NOT NULL;

-- RLS: cerrar el predicado system (team_id IS NULL) y abrir el 3er caso team.
-- Patrón set-returning + col IN (SELECT helper()) — InitPlan, 1 eval/query (regla dura 2026-06-09).
DROP POLICY IF EXISTS exercises_select_visible ON public.exercises;
CREATE POLICY exercises_select_visible ON public.exercises FOR SELECT
  USING ((coach_id IS NULL AND org_id IS NULL AND team_id IS NULL)
      OR (coach_id = (SELECT auth.uid()) AND org_id IS NULL));

DROP POLICY IF EXISTS exercises_team_select ON public.exercises;
CREATE POLICY exercises_team_select ON public.exercises FOR SELECT
  USING (team_id IS NOT NULL AND team_id IN (SELECT public.current_user_team_ids()));
DROP POLICY IF EXISTS exercises_team_insert ON public.exercises;
CREATE POLICY exercises_team_insert ON public.exercises FOR INSERT
  WITH CHECK (team_id IS NOT NULL AND coach_id IS NULL AND org_id IS NULL
    AND team_id IN (SELECT public.current_user_team_ids()));
DROP POLICY IF EXISTS exercises_team_update ON public.exercises;
CREATE POLICY exercises_team_update ON public.exercises FOR UPDATE
  USING (team_id IS NOT NULL AND team_id IN (SELECT public.current_user_team_ids()))
  -- El WITH CHECK exige que el team_id NUEVO también sea propio: sin esa cláusula, un miembro del
  -- team A podría re-apuntar team_id de un ejercicio de A al uuid del team B e inyectar contenido
  -- en el catálogo ajeno (lo verían sus miembros y alumnos, sin posibilidad de revertir). AC6.
  WITH CHECK (team_id IS NOT NULL AND coach_id IS NULL AND org_id IS NULL
    AND team_id IN (SELECT public.current_user_team_ids()));
DROP POLICY IF EXISTS exercises_team_delete ON public.exercises;
CREATE POLICY exercises_team_delete ON public.exercises FOR DELETE
  USING (team_id IS NOT NULL AND team_id IN (SELECT public.current_user_team_ids()));

-- Alumno del pool lee el catálogo de su team (subquery NO correlacionada → InitPlan)
DROP POLICY IF EXISTS exercises_client_team_select ON public.exercises;
CREATE POLICY exercises_client_team_select ON public.exercises FOR SELECT
  USING (team_id IS NOT NULL AND team_id IN (
    SELECT c.team_id FROM public.clients c
    WHERE c.id = (SELECT auth.uid()) AND c.team_id IS NOT NULL));
```

### M2 — `20260611NNNNNN_workout_blocks_polymorphic.sql`

```sql
-- Prescripción polimórfica (todas nullable ⇒ ADD COLUMN metadata-only, sin rewrite)
ALTER TABLE public.workout_blocks
  ADD COLUMN IF NOT EXISTS is_unilateral boolean,
  ADD COLUMN IF NOT EXISTS side_mode text,
  ADD COLUMN IF NOT EXISTS reps_value integer,
  ADD COLUMN IF NOT EXISTS reps_unit text,
  ADD COLUMN IF NOT EXISTS load_type text,
  ADD COLUMN IF NOT EXISTS load_value numeric,
  ADD COLUMN IF NOT EXISTS load_unit text,
  ADD COLUMN IF NOT EXISTS distance_value numeric,
  ADD COLUMN IF NOT EXISTS distance_unit text,
  ADD COLUMN IF NOT EXISTS duration_sec integer,
  ADD COLUMN IF NOT EXISTS target_pace_sec_per_km integer,
  ADD COLUMN IF NOT EXISTS hr_zone smallint,
  ADD COLUMN IF NOT EXISTS instructions text,
  ADD COLUMN IF NOT EXISTS exercise_type_override text,
  ADD COLUMN IF NOT EXISTS interval_config jsonb,
  ADD COLUMN IF NOT EXISTS extra_targets jsonb;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'workout_blocks_poly_check') THEN
    ALTER TABLE public.workout_blocks ADD CONSTRAINT workout_blocks_poly_check CHECK (
      (side_mode IS NULL OR side_mode IN ('bilateral','per_side','alternating'))
      AND (reps_unit IS NULL OR reps_unit IN ('reps','passes','breaths'))
      AND (load_type IS NULL OR load_type IN ('weight','time','bodyweight','none'))
      AND (load_unit IS NULL OR load_unit IN ('kg','lb','sec'))
      AND (distance_unit IS NULL OR distance_unit IN ('m','km'))
      AND (hr_zone IS NULL OR hr_zone BETWEEN 1 AND 5)
      AND (exercise_type_override IS NULL OR exercise_type_override IN ('strength','cardio','mobility','roller'))
      AND (reps_value IS NULL OR reps_value >= 0)
      AND (load_value IS NULL OR load_value >= 0)
      AND (distance_value IS NULL OR distance_value >= 0)
      AND (duration_sec IS NULL OR duration_sec >= 0)
      AND (target_pace_sec_per_km IS NULL OR target_pace_sec_per_km > 0)
    ) NOT VALID;
  END IF;
END $$;
ALTER TABLE public.workout_blocks VALIDATE CONSTRAINT workout_blocks_poly_check;  -- ~4k filas, OK
```

### M3 — `20260611NNNNNN_workout_logs_polymorphic_mirror.sql`

```sql
-- Espejo nullable. NO reusar reps_done (INT). SIN CHECKs (hot table, validación en Zod).
ALTER TABLE public.workout_logs
  ADD COLUMN IF NOT EXISTS actual_duration_sec integer,
  ADD COLUMN IF NOT EXISTS actual_distance_m numeric,
  ADD COLUMN IF NOT EXISTS actual_pace_sec_per_km integer,
  ADD COLUMN IF NOT EXISTS actual_hold_sec integer,
  ADD COLUMN IF NOT EXISTS actual_avg_hr smallint,
  ADD COLUMN IF NOT EXISTS metadata jsonb;
```

### M4 — `20260611NNNNNN_clients_cardio_profile.sql` (junto a F7, módulo cardio)

```sql
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS birth_date date,
  ADD COLUMN IF NOT EXISTS resting_hr smallint,
  ADD COLUMN IF NOT EXISTS max_hr_override smallint,
  ADD COLUMN IF NOT EXISTS ref_5k_time_sec integer;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'clients_cardio_profile_check') THEN
    ALTER TABLE public.clients ADD CONSTRAINT clients_cardio_profile_check CHECK (
      (resting_hr IS NULL OR resting_hr BETWEEN 25 AND 120)
      AND (max_hr_override IS NULL OR max_hr_override BETWEEN 120 AND 230)
      AND (ref_5k_time_sec IS NULL OR ref_5k_time_sec BETWEEN 600 AND 7200)
      AND (birth_date IS NULL OR birth_date BETWEEN '1920-01-01' AND now()::date)
    ) NOT VALID;
  END IF;
END $$;
ALTER TABLE public.clients VALIDATE CONSTRAINT clients_cardio_profile_check;
```

Sin migración para plantillas (decisión #6) ni backfill obligatorio (default `'strength'` cubre todo;
backfill curado de system cardio = script `_POST_DEPLOY_` opcional e idempotente).

### Shape de `interval_config` (jsonb, validado por Zod — `IntervalConfigSchema`)

```ts
{ warmup_sec?: number, cooldown_sec?: number,
  repeats: number,                       // N (M externo = block.sets, ya existe)
  work: { duration_sec?: number, distance_m?: number,
          target?: { kind: 'hr_zone'|'pace'|'rpe'|'none', hr_zone?: 1|2|3|4|5,
                     pace_sec_per_km?: number, rpe?: number } },
  recovery?: { duration_sec?: number, distance_m?: number, mode?: 'rest'|'jog'|'walk' } }
```

## Mapa de campos por tipo (formulario coach / log alumno)

| Tipo | Prescribe (BlockEditSheet) | Registra (LogSetForm) |
|---|---|---|
| strength | sets/reps(+reps_value)/load(kg-lb)/rest/tempo/rir + side_mode + distance opcional | weight_kg/reps_done/rpe/rir (HOY, intacto) |
| cardio | duration_sec O distance+unit, target_pace, hr_zone, interval_config, rest | actual_duration_sec, actual_distance_m, actual_avg_hr, rpe |
| mobility | duration_sec (hold), sets, side_mode, tempo respiración (extra_targets), instructions | actual_hold_sec, rpe opcional |
| roller | duration_sec O reps_value+reps_unit='passes', zona (notes/instructions), side_mode | actual_duration_sec O reps_done, rpe opcional |

Transversales en TODOS: `side_mode`, `load_*` (carga polimórfica), `distance_*`, `instructions`.

## `packages/calc/` (nuevo package `@eva/calc`, espejo de `packages/schemas`)

- `cardio.ts`: `ageFromBirthDate`, `maxHrTanaka` (default), `maxHrClassic`, `hrZonesFromMax` (5 zonas
  %FCmax 50-60/60-70/70-80/80-90/90-100, `round(FCmax×pct)`), `hrZonesKarvonen(maxHr, restingHr)`
  (`FCR·int% + reposo`), `resolveClientZones(profile)` (override > Tanaka; Karvonen si hay reposo),
  `paceToTimeSec`, `timeToPaceSecPerKm`, `distanceFromTimePace`, `kmhFromPace`, `paceKmToMile`
  (`×1.60934`), `formatPace`/`formatDuration` (`floor(s/60):s%60`), `intervalTotalDurationSec(config, sets)`.
  Todo segundos enteros.
- `cardio-templates.ts`: plantillas system (ids + i18n keys + `interval_config`): ej. 8×400m @ Z4 r90s,
  6×1min @ Z5 r2min, 20min Z2 continuo, fartlek 10×30/30, HYROX compromised running (run 1km + estación).
- `cardio.test.ts`: golden fixtures del SPEC AC8 + bordes (edad NULL, reposo ausente → fallback %FCmax).

## Fases (slices con verificación; por tanda SOLO typecheck + vitest)

- **F0 — Baselines anti-regresión (sin tocar prod):** contrato actual de `WorkoutBlockSchema`
  (bloque legacy pasa sin cambios; extiende `packages/schemas/workout.test.ts`); mapa de call sites de
  `reps`/`sets` (print, preview, history, muscle balance, `target_reps_at_log`) en `CALLSITES.md`;
  verificar baselines de áreas siguen verdes. *Verifica:* vitest verde.
- **F1 — DB expand (M1+M2+M3) vía branch MCP:** protocolo completo Director §3; en el branch: seed
  sintético (2 teams + standalone) + asserts RLS catálogo (team A no ve B; standalone no ve team;
  alumno pool lee su team; system intacto; UPDATE re-apuntando `team_id` de A→B rechazado por WITH
  CHECK) + `EXPLAIN ANALYZE` de un SELECT de catálogo (helpers InitPlan, `loops=1`) + advisors 0
  críticos → **pre-check read-only en prod** (`SELECT count(*) FROM public.exercises WHERE
  num_nonnulls(coach_id, org_id) > 1` debe dar 0; si no, diferir el VALIDATE de `single_owner_check`
  — ver nota en M1) → merge → `db pull` + regen `database.types.ts` → `delete_branch` mismo día.
  *Verifica:* typecheck verde post-regen; suite SQL `tests/team/exercises-catalog-isolation.sql`
  escrita (corre en gate).
- **F2 — Dominio + schemas + calc (puro, progreso rápido):** `ExerciseType`/`SideMode`/`LoadType` en
  `domain/workout/types.ts` (alinear `ExerciseUnit` huérfano); `WorkoutBlockSchema` extendido (campos
  nuevos opcionales + `IntervalConfigSchema` + superRefine por tipo) y `WorkoutLogSetSchema` extendido;
  helper `effectiveExerciseType` + generador de resumen legacy ≤20 chars (`lib/workout-exercise-type.ts`);
  package `@eva/calc` completo con golden tests. *Verifica:* vitest (golden + truncado + passthrough legacy).
- **F3 — Catálogo:** `resolveExerciseOwner` 3er caso team (por workspace ACTIVO vía
  `resolvePreferredWorkspace`, patrón `CoachClientScope`); `ExerciseFormModal` selector de tipo;
  queries del catálogo y `DraggableExerciseCatalog` traen/filtran `exercise_type` (+ visible
  system+team+propios; ASIGNABLE en workspace team = system+team, propios solo vía "Copiar al team" —
  decisión #7 anti-fantasma). *Verifica:* vitest; AC6 + AC11 manual en dev.
- **F4 — Builder coach:** `BuilderBlock` + `mapDbBlockToBuilderBlock` + save pipeline (4 inserts de
  `workout.service.ts`) con campos nuevos + resumen legacy en `reps`; `BlockEditSheet` 4 forms por tipo
  (+ override de tipo, kg/lb, side_mode, distancia, instructions, plantilla de intervalos si módulo ON)
  + migrar `<img>`→`next/image`; `ExerciseBlock` resumen por tipo ("4×400m @ Z4", "30s ×3 por lado").
  *Verifica:* AC1/AC2/AC3 builder round-trip (vitest del reducer + manual); baselines de áreas verdes.
- **F5 — Alumno (logging):** query de ejecución trae campos nuevos + `exercises.exercise_type`;
  `LogSetForm` variantes por tipo efectivo (misma maquinaria useActionState/useOptimistic/useFormStatus);
  `logSetAction` + `WorkoutLogSetSchema` persisten espejo; `WorkoutOfflineLog` extendido + flush;
  `getExerciseHistoryAction`/historial por tipo (sin "NaN reps"). *Verifica:* AC4 (manual dev + unit
  de mapeo); regresión strength intacta.
- **F6 — Timers:** `WorkoutTimerProvider` contrato `{startRest, startHold, startInterval, startStopwatch}`
  (un activo, reemplazo con confirmación); `HoldTimer` (countdown + vibrate/beep al 0), `IntervalTimer`
  (work/rest + N de M + beep/vibración + Wake Lock toggle), `Stopwatch` (count-up + laps); preferencias
  de sonido en `rest-timer-preferences.ts`; safe-area + `useReducedMotion`. *Verifica:* AC5 manual dev;
  unit de la máquina de estados del interval timer.
- **F7 — Módulo cardio (gated):** M4 vía branch MCP (mismo protocolo); enforcement de `entitlement`
  en `getVisibleNavItems` + flag plataforma `DISABLED_MODULE_KEYS` en `hasModule`; página `/coach/cardio`
  (module pattern: page RSC + `_data` + `_components` calculadora zonas/pace + galería plantillas);
  `services/cardio-zones.service.ts` (perfil → `@eva/calc`, `assertModule` al tope); captura de perfil
  (onboarding alumno opcional + edición en perfil del coach); chips de zona en builder y ejecución
  ("Z4 · 150–168 bpm"; sin `birth_date` → "Z4" + CTA). *Verifica:* AC7/AC8; OFF→ON manual; vitest.
- **F8 — Seed ejercicios:** `scripts/seed-exercises-movida.mjs` (service-role, idempotente por
  nombre normalizado+scope) leyendo `data/seed/exercises-movida.csv` versionado con columna `scope`
  por fila (decisión #11: genéricos curados propios → `system`; Villarroel + lista kine de Ani →
  `team` de Movida); smoke de conteo; backfill curado opcional `_POST_DEPLOY_` de system cardio.
  *Verifica:* corrida doble sin duplicados (idempotencia) en branch; conteo esperado por scope.
- **GATE (con autorización explícita):** E2E `tests/movida/cardio-builder-execution.spec.ts` +
  `tests/movida/mobility-timer.spec.ts` (escritos en F4-F7) + suites SQL, 1 corrida, `--workers=1`,
  contra build prod. AC10.

## Disciplina

- Expand-contract: NUNCA dropear/renombrar `reps`/`section`; columnas nuevas nullable; `reps` siempre
  poblado (resumen legacy). DDL solo vía branch efímero Pro (borrar MISMO día; créditos/Spend Cap no cubren).
- RLS: solo helpers set-returning + `col IN (SELECT helper())`; jamás SECURITY DEFINER per-row ni
  EXISTS correlacionado en hot tables; advisors + `EXPLAIN ANALYZE` antes de merge.
- Clean Architecture: `_data → services → infrastructure/db/workout.repository → Supabase`; cálculo en
  `packages/calc`; gating server-side `assertModule` (la UI solo espeja).
- i18n: todo string nuevo con `t()` + keys en `es.json` Y `en.json` mismo commit (namespace
  `workout.type.*`, `workout.cardio.*`); mobile: `h-dvh`, `*-safe`, `overflow-x: clip`.
- Por tanda: typecheck + vitest. E2E/SQL SOLO al gate final autorizado (regla 2026-06-10). Review
  adversarial en F4 y F5 (núcleo builder + ejecución).
- Docs: actualizar `docs/plans/movida/00-DIRECTOR.md` (bitácora) y canónicas al cerrar cada fase.
