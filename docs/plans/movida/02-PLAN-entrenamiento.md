# 02 · PLAN — Entrenamiento (ejercicios polimórficos + cardio)

> Depende de **áreas custom** y **team** de [01 Cimientos](01-PLAN-cimientos.md). Volver al [Director](00-DIRECTOR.md).

## Objetivo

Builder que soporta ejercicios **no-fuerza** (cardio/carrera, movilidad, foam roller) con datos propios y UI distinta en coach y alumno, + módulo **cardio tipo TrainingPeaks-lite** (simplificado). Validado con el Excel real (`martin Guerra.xlsx`) y el template correctivo (Villarroel).

## A. Ejercicios polimórficos por tipo

**Patrón:** el tipo define qué campos se capturan (Hevy/Trainerize/Everfit). Datos **híbrido**: columnas tipadas para lo frecuente + jsonb para lo raro.

**Campos por tipo:** Fuerza (sets/reps/peso/rest/tempo/rir) · Cardio (distancia/duración/pace/descanso/intervalos/zona FC) · Movilidad (hold/sets/lados/tempo/respiración) · Foam roller (duración o pasadas/zona/presión).

**Transversal (del Excel real):** por-lado/unilateral (`6 x l`, `3 x lado`) en TODOS los tipos · carga polimórfica (kg/lb/**segundos** isométrico/vacío) · distancia ("7,5 mts" Farmer carry = carga **+** distancia simultáneas) · instrucciones por ejercicio asignado.

> **Unidad de carga:** soportar **kg y lb** (el coach elige por ejercicio; default `kg`). El Excel real mezcla ambos en la misma sesión. Mostrar conversión opcional. Persistir `load_unit` tal cual (no auto-convertir al guardar).

**Migraciones (aditivas):**
- `exercises.exercise_type text default 'strength' check (in ('strength','cardio','mobility','roller'))` (+ backfill).
- **Ownership de team en catálogo:** `exercises.team_id uuid` (FK nullable). Extender el patrón de `exercises.actions.ts` (hoy `coach_id` O `org_id`) a un 3er caso `team`. Un miembro ve ejercicios **system + del team + propios**. Sin esto, cada coach crea ejercicios privados invisibles para los otros 29 (rompe full-access).
- `workout_blocks` (prescripción): `is_unilateral bool`, `side_mode text check (bilateral|per_side|alternating)`, `reps_value int` + `reps_unit text`, `load_type text check (weight|time|bodyweight|none)` + `load_value numeric` + `load_unit text check (kg|lb|sec)`, `distance_value numeric` + `distance_unit text check (m|km)`, `instructions text`, `exercise_type_override text`, `hr_zone int`, `extra_targets jsonb`.
- `workout_logs` (espejo nullable): `actual_duration_sec`, `actual_distance_m`, `actual_pace_sec_per_km`, `actual_hold_sec`, `actual_avg_hr`, `metadata jsonb`. **NO** reusar `reps_done` (INT).

**Coexistencia de `reps` (clave):** read **prefiere `reps_value`/`reps_unit`, fallback a `reps` texto**. Manejar no-numéricos (`8-10`, `AMRAP`, `al fallo`): `reps_value` NULL + conservar `reps` texto; la UI muestra `reps` como fallback cuando `reps_value` es NULL. NO prometer reemplazo total en expand (fase contract dropea `reps` después). Resolución de tipo: `effective_type = COALESCE(block.exercise_type_override, exercise.exercise_type)`.

**UI coach:** `BlockEditSheet.tsx` render condicional por tipo (4 forms); `ExerciseBlock.tsx` resumen por tipo ("4×400m @ Z4", "30s ×3 por lado"); `ExerciseFormModal.tsx` selector de tipo; `types.ts` + `packages/schemas/workout.ts` (Zod por tipo). Migrar el `<img>` crudo de `BlockEditSheet` a `next/image`.

**UI alumno (preservar maquinaria existente):** `LogSetForm.tsx` variantes por tipo, cada una reusa `useActionState`+`useOptimistic`+`useFormStatus` y el **offline queue** (`enqueueWorkoutLog`), mapeando campos por tipo (los logs cardio/movilidad también entran a la cola offline). Validación submit condicional por tipo (Zod). `getExerciseHistoryAction`/`ExerciseHistory` muestran "última vez" según tipo (`4×400m @ 1:35/km`) u ocultan si no aplica (evitar "NaN reps").

**Timers — contrato de extensión `WorkoutTimerProvider`:** hoy solo `startRest(timeStr)` con un `RestTimer`. Ampliar a `{ startRest, startHold(sec), startInterval(config), startStopwatch() }` (un solo timer activo; el nuevo reemplaza con confirmación suave). UX: HoldTimer countdown + `navigator.vibrate` al 0; IntervalTimer indicador work/rest + N de M + beep/vibración; count-up con lap. Reusar `useReducedMotion` + safe-area en overlays.

**Seed (bloquea go-live):** ejercicios cardio/movilidad/roller. **Plan concreto:** datos system (section_templates) ya en Plan 1; ejercicios voluminosos como script `.mjs` service-role **idempotente** (por slug/nombre+scope) leyendo CSV/JSON **versionado en repo** (transcribir Villarroel + lista kine de Ani, NO a mano en SQL). Corre primero en branch; tras merge, en prod (idempotente, snapshot previo). Smoke de conteo.

## B. Cardio "TrainingPeaks-lite"

Capa de inteligencia sobre los ejercicios cardio (no builder aparte). **Cálculo puro en `packages/calc/`** (no `services/`); `services/cardio-zones.service.ts` orquesta. Sin imports `server-only`/Supabase (testeable Vitest). Campos perfil cliente: `birth_date`/edad, `resting_hr` (opcional), `ref_5k_time` (opcional) — **confirmar si `clients` ya los tiene; agregar aditivo si faltan** + captura en onboarding/perfil.

**Incluir (fórmulas):**
- *FCmax:* `220 − edad` (simple) · **Tanaka (default) `208 − 0.7·edad`**.
- *5 zonas %FCmax* (Garmin/Polar): Z1 50-60 · Z2 60-70 · Z3 70-80 · Z4 80-90 · Z5 90-100. `límite = round(FCmax × pct)`.
- *Karvonen* (si hay FC reposo): `FCR = FCmax − FCreposo`; `objetivo = FCR·int% + FCreposo`. Fallback %FCmax.
- *Pace/tiempo (segundos enteros):* `tiempo = pace_s_km × dist_km`; `pace = tiempo/dist`; `dist = tiempo/pace`; `km/h = 3600/pace_s_km`; `pace_milla = pace_km × 1.60934`; display `floor(s/60):s%60`.
- *Intervalos:* `warmup → [N×(trabajo+recuperación)]×M → cooldown`.

**Omitir:** TSS/rTSS, Normalized Power, IF, PMC, FTP en watts.

**HYROX/híbrido:** días mixtos fuerza+cardio (ya habilitado por tipos + áreas custom); "compromised running". Empezar con **plantillas curadas por el coach**, no generador automático.

**MVP (3-5 días):** funciones puras + calculadora de zonas/pace + plantillas de intervalos pre-hechas. **Toggle** `cardio`.

## Archivos clave

`supabase/migrations/*` · `packages/calc/cardio.ts` (puro) + `packages/schemas/workout.ts` · `domain/workout/types.ts` (alinear `ExerciseUnit`, agregar `ExerciseType` — hoy huérfanos; `BuilderSection` → string id de template) · `services/cardio-zones.service.ts` · `infrastructure/db/workout.repository.ts` · `app/coach/builder/[clientId]/components/{BlockEditSheet,ExerciseBlock}.tsx` + `types.ts` · `app/coach/exercises/_components/ExerciseFormModal.tsx` + `_actions/exercises.actions.ts` (3er caso team) · `app/c/[coach_slug]/workout/[planId]/{LogSetForm,WorkoutExecutionClient}.tsx` + `WorkoutTimerProvider` + `_actions/workout-log.actions.ts` + offline queue.

## Specs SDD

`specs/exercise-types-polymorphic/` · `specs/cardio-planning-lite/`.

## Orden sugerido

1. SDD. 2. Migración `exercise_type` + ownership team + prescripción polimórfica + logs (en branch Pro: apply→seed→advisors→merge→delete). 3. `packages/calc/cardio.ts` + tests (progreso rápido). 4. UI coach por tipo. 5. UI alumno + timers + offline. 6. Calculadora + plantillas cardio. 7. Seed ejercicios.

## Verification

- **Golden fixtures cardio** (valores esperados): FCmax Tanaka edad 30 = 187; `220−30` = 190; Z4 sobre 187 = 150-168 bpm; Karvonen reposo 60 int 70% = `(187−60)·0.7+60 ≈ 149`; pace 5:00/km → 5k = 1500s = 25:00; `3600/300` = 12 km/h; `300·1.60934 ≈ 482.8s` = 8:03. Redondeo a segundos enteros.
- **Farmer carry tri-eje:** bloque con `load_type=time` (10 seg) + `distance` + `side_mode=per_side` coexisten y se registran sin perder eje.
- **Coexistencia reps:** bloque con `reps='8-10'` y `reps_value` NULL renderiza vía fallback; AMRAP no rompe.
- **Regresión alumno:** sigue pudiendo INSERT `workout_logs` con columnas nuevas y NO lee datos de otro alumno (policies endurecidas `20260530170000`/`20260608120000`).
- **Ownership team:** ejercicio creado por un coach del team es visible para los otros miembros.
- **E2E** (Playwright nombrados, en CI): `tests/movida/cardio-builder-execution.spec.ts`, `mobility-timer.spec.ts` con usuario seed.
- `pnpm typecheck`/`test`/`build` verdes.

## Definition of Done

Builder soporta fuerza/cardio/movilidad/roller con UI distinta coach+alumno; por-lado/carga polimórfica/distancia/instrucciones; ejercicios de team compartidos; timers (hold/interval/stopwatch) + offline; calculadora de zonas/pace + plantillas; cálculo puro en `packages/calc` con golden tests; módulo cardio toggleable; seed cargado.
